import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { ApproveGiftOfferingDto, ListGiftOfferingsDto, SaveGiftOfferingDto } from './dto/gift-hospitality-offering.dto';
import { GiftOfferingEntity } from './entities/gift-hospitality-offering.entity';
import { OFFERING_VOUCHER_PREFIX, offeringRequesterUsernames, offeringWaitingFor, validateOfferingForSubmit } from './gift-hospitality-offering.rules';

export interface OfferingActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

/** The approval steps in the order they must be completed. */
const STEPS = [
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate' },
  { key: 'ack1', comment: 'ack1Comment', by: 'ack1By', status: 'ack1ByStatus', date: 'ack1ByDate' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate' },
  { key: 'approver2', comment: 'approver2Comment', by: 'approver2By', status: 'approver2ByStatus', date: 'approver2ByDate' },
  { key: 'ack2', comment: 'ack2Comment', by: 'ack2By', status: 'ack2ByStatus', date: 'ack2ByDate' },
] as const;

const VIEW_ALL = 'gift-hospitality-offering.view-all';
const APPROVER_COLUMNS = ['verify_by', 'ack1_by', 'approver_by', 'approver2_by', 'ack2_by'];
const SORT_COLUMNS: Record<string, string> = {
  id: 'g.id', voucher_no: 'g.voucherNo', request_type: 'g.requestType', requester_name: 'g.requesterName',
  description: 'g.description', receiver_name_company: 'g.receiverNameCompany', value_amount: 'g.valueAmount',
  proposed_date: 'g.proposedDate', approver_by: 'g.approverBy', status: 'g.status', created_at: 'g.createdAt',
};

@Injectable()
export class GiftOfferingService {
  constructor(
    @InjectRepository(GiftOfferingEntity)
    private readonly records: Repository<GiftOfferingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListGiftOfferingsDto, actor: OfferingActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const qb = this.records.createQueryBuilder('g').where('g.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere(
        `(g.requester_name ILIKE :q OR g.receiver_name_company ILIKE :q OR g.description ILIKE :q OR g.voucher_no ILIKE :q OR ${APPROVER_COLUMNS.map((col) => `g.${col} ILIKE :q`).join(' OR ')})`,
        { q: `%${dto.q}%` },
      );
    }
    if (dto.status) qb.andWhere('g.status = :status', { status: dto.status });
    if (dto.requestType) qb.andWhere('g.request_type = :requestType', { requestType: dto.requestType });
    if (dto.approver) {
      qb.andWhere(`(${APPROVER_COLUMNS.map((col) => `g.${col} = :approver`).join(' OR ')})`, { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('g.proposed_date >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('g.proposed_date <= :dateTo', { dateTo: dto.dateTo });
    if (!canViewAll(actor, VIEW_ALL)) {
      qb.andWhere(
        `(g.create_by = :self OR ${APPROVER_COLUMNS.map((col) => `g.${col} = :self`).join(' OR ')} OR g.requester_name = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))`,
        { self: actor.username },
      );
    }
    if (dto.waiting === 'me') qb.andWhere(offeringWaitingFor('g')).setParameter('me', actor.username);

    qb.orderBy(SORT_COLUMNS[dto.sort ?? 'created_at'] ?? 'g.createdAt', (dto.dir ?? 'desc').toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const record = await this.records.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Gift/hospitality offering request not found');
    return record;
  }

  async findOneFor(id: number, actor: OfferingActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, VIEW_ALL) && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async assertSubmittable(dto: SaveGiftOfferingDto, actor: OfferingActor) {
    const errors = await validateOfferingForSubmit(this.dataSource, dto, actor);
    if (errors.length) throw new BadRequestException(errors);
  }

  async create(dto: SaveGiftOfferingDto, actor: OfferingActor) {
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable(dto, actor);
    const record = this.records.create({
      ...this.fields(dto),
      status: submitting ? 'submitted' : 'draft',
      version: submitting ? 1 : 0,
      createBy: actor.username,
      updateBy: actor.username,
      voucherNo: submitting ? await this.generateVoucherNo() : null,
    });
    const saved = await this.records.save(record);
    if (submitting) await this.logEvent(saved, 'submitted', actor.username, null, null);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: SaveGiftOfferingDto, actor: OfferingActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (!['draft', 'rejected'].includes(record.status)) {
      throw new ForbiddenException('Only draft or rejected requests can be edited');
    }
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable(dto, actor);
    // Submitting a record that already went through the flow (it was rejected) starts a new revision.
    const revising = submitting && record.version > 0;
    Object.assign(record, this.fields(dto), { updateBy: actor.username, status: submitting ? 'submitted' : record.status });
    if (submitting) record.version += 1;
    if (submitting && !record.voucherNo) record.voucherNo = await this.generateVoucherNo();
    await this.records.save(record);
    if (submitting) await this.logEvent(record, revising ? 'revised' : 'submitted', actor.username, null, null);
    return this.findOne(id);
  }

  async approve(id: number, dto: ApproveGiftOfferingDto, actor: OfferingActor) {
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') {
      throw new ForbiddenException('This request is not waiting for action');
    }
    const pending = (r: GiftOfferingEntity) => STEPS.find((s) => r[s.by] && r[s.status] !== 'approved');
    const step = pending(record);
    if (!step) throw new ConflictException('This request has already completed its workflow');
    if (record[step.by]!.toLowerCase() !== actor.username.toLowerCase()) {
      throw new ForbiddenException('You are not assigned to this step, or it is not your turn yet');
    }
    if (dto.action === 'approved' && (step.key === 'approver' || step.key === 'approver2')) {
      const requesters = await offeringRequesterUsernames(this.dataSource, record);
      if (requesters.has(actor.username.toLowerCase())) throw new ForbiddenException('You cannot approve your own request');
    }
    const comment = dto.comment?.trim() || null;
    if (dto.action === 'rejected' && !comment) throw new BadRequestException('A comment is required when rejecting');
    record[step.status] = dto.action;
    record[step.date] = new Date();
    record[step.comment] = comment;
    record.updateBy = actor.username;
    record.status = dto.action === 'rejected' ? 'rejected' : pending(record) ? 'verified' : 'approved';
    await this.records.save(record);
    await this.logEvent(record, dto.action, actor.username, step.key, comment);
    return this.findOne(id);
  }

  /** History entries (oldest first): submissions and revisions with their number, plus every step decision and comment. */
  async events(id: number, actor: OfferingActor) {
    await this.findOneFor(id, actor);
    return this.dataSource.query(
      `SELECT id, version, action, step, actor, comment, created_at AS "createdAt"
       FROM gift_hospitality_offering_events WHERE record_id = $1 ORDER BY created_at ASC, id ASC`,
      [id],
    );
  }

  private async logEvent(record: GiftOfferingEntity, action: string, actorUsername: string, step: string | null, comment: string | null) {
    // A snapshot of the form data is kept for each submission so earlier revisions can be reviewed.
    const snapshot = action === 'submitted' || action === 'revised' ? this.snapshot(record) : null;
    await this.dataSource.query(
      `INSERT INTO gift_hospitality_offering_events (record_id, version, action, step, actor, comment, snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.id, record.version, action, step, actorUsername, comment, snapshot ? JSON.stringify(snapshot) : null],
    );
  }

  private snapshot(r: GiftOfferingEntity) {
    return {
      requestType: r.requestType, requesterName: r.requesterName, description: r.description, purpose: r.purpose,
      valueAmount: r.valueAmount, currency: r.currency, receiverNameCompany: r.receiverNameCompany, proposedDate: r.proposedDate,
      verifyBy: r.verifyBy, ack1By: r.ack1By, approverBy: r.approverBy, approver2By: r.approver2By, ack2By: r.ack2By,
    };
  }

  async remove(id: number, actor: OfferingActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (record.status !== 'draft') throw new ForbiddenException('Only draft requests can be deleted');
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.records.softDelete(id);
    return { message: 'Deleted' };
  }

  private fields(dto: SaveGiftOfferingDto): Partial<GiftOfferingEntity> {
    const text = (value?: string | null) => value?.trim() || null;
    return {
      requestType: dto.requestType,
      requesterName: dto.requesterName.trim(),
      description: text(dto.description),
      purpose: text(dto.purpose),
      valueAmount: String(dto.valueAmount),
      currency: dto.currency ?? 'THB',
      receiverNameCompany: dto.receiverNameCompany.trim(),
      proposedDate: dto.proposedDate,
      attachments: dto.attachments ?? null,
      verifyBy: text(dto.verifyBy), verifyByStatus: text(dto.verifyBy) ? 'pending' : null, verifyByDate: null, verifyComment: null,
      ack1By: text(dto.ack1By), ack1ByStatus: text(dto.ack1By) ? 'pending' : null, ack1ByDate: null, ack1Comment: null,
      approverBy: text(dto.approverBy), approverByStatus: text(dto.approverBy) ? 'pending' : null, approverByDate: null, approverComment: null,
      approver2By: text(dto.approver2By), approver2ByStatus: text(dto.approver2By) ? 'pending' : null, approver2ByDate: null, approver2Comment: null,
      ack2By: text(dto.ack2By), ack2ByStatus: text(dto.ack2By) ? 'pending' : null, ack2ByDate: null, ack2Comment: null,
    };
  }

  /** GHR-YYYYMMDD-XXXX; soft-deleted rows still hold their numbers. */
  private async generateVoucherNo(): Promise<string> {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `${OFFERING_VOUCHER_PREFIX}-${stamp}-`;
    const last = await this.records.createQueryBuilder('g')
      .withDeleted()
      .where('g.voucher_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('g.voucher_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.voucherNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async preparedBy(record: { requesterName: string }, actor: OfferingActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.requesterName;
  }

  private async takesPart(record: GiftOfferingEntity, actor: OfferingActor): Promise<boolean> {
    const people = [record.createBy, record.verifyBy, record.ack1By, record.approverBy, record.approver2By, record.ack2By];
    return people.includes(actor.username) || (await this.preparedBy(record, actor));
  }

  private async assertOwner(record: GiftOfferingEntity, actor: OfferingActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedBy(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }
}
