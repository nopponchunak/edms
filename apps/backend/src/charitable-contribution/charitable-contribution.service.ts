import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReassignDto, assertCanTakeStep } from '../lifecycle/reassign';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { charitableWaitingFor } from './charitable-contribution.waiting';
import { isMdUser, requesterUsernames, validateForSubmit } from './charitable-contribution.rules';
import { ApproveCharitableContributionDto } from './dto/approve-charitable-contribution.dto';
import { ListCharitableContributionsDto, SaveCharitableContributionDto } from './dto/charitable-contribution.dto';
import { CharitableContributionEntity } from './entities/charitable-contribution.entity';

export interface CharitableActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

/** The five approval steps in the order they must be completed; steps without a named person are skipped. */
const STEPS = [
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate' },
  { key: 'ack1', comment: 'ack1Comment', by: 'ack1By', status: 'ack1ByStatus', date: 'ack1ByDate' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate' },
  { key: 'approver2', comment: 'approver2Comment', by: 'approver2By', status: 'approver2ByStatus', date: 'approver2ByDate' },
  { key: 'ack2', comment: 'ack2Comment', by: 'ack2By', status: 'ack2ByStatus', date: 'ack2ByDate' },
] as const;

const VIEW_ALL = 'charitable-contribution.view-all';
const APPROVER_COLUMNS = ['verify_by', 'ack1_by', 'approver_by', 'approver2_by', 'ack2_by'];
const SORT_COLUMNS: Record<string, string> = {
  id: 'c.id', voucher_no: 'c.voucherNo', request_type: 'c.requestType', requester_name: 'c.requesterName',
  event_description: 'c.eventDescription', organizer_name: 'c.organizerName', value_amount: 'c.valueAmount',
  proposed_date: 'c.proposedDate', approver_by: 'c.approverBy', status: 'c.status', created_at: 'c.createdAt',
};

@Injectable()
export class CharitableContributionService {
  constructor(
    @InjectRepository(CharitableContributionEntity)
    private readonly records: Repository<CharitableContributionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListCharitableContributionsDto, actor: CharitableActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const qb = this.records.createQueryBuilder('c').where('c.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere(
        `(c.requester_name ILIKE :q OR c.organizer_name ILIKE :q OR c.event_description ILIKE :q OR c.voucher_no ILIKE :q OR ${APPROVER_COLUMNS.map((col) => `c.${col} ILIKE :q`).join(' OR ')})`,
        { q: `%${dto.q}%` },
      );
    }
    if (dto.status) qb.andWhere('c.status = :status', { status: dto.status });
    if (dto.requestType) qb.andWhere('c.request_type = :requestType', { requestType: dto.requestType });
    if (dto.approver) {
      qb.andWhere(`(${APPROVER_COLUMNS.map((col) => `c.${col} = :approver`).join(' OR ')})`, { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('c.proposed_date >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('c.proposed_date <= :dateTo', { dateTo: dto.dateTo });
    if (!canViewAll(actor, VIEW_ALL)) {
      qb.andWhere(
        `(c.create_by = :self OR ${APPROVER_COLUMNS.map((col) => `c.${col} = :self`).join(' OR ')} OR c.requester_name = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))`,
        { self: actor.username },
      );
    }

    if (dto.waiting === 'me') qb.andWhere(charitableWaitingFor('c')).setParameter('me', actor.username);

    qb.orderBy(SORT_COLUMNS[dto.sort ?? 'created_at'] ?? 'c.createdAt', (dto.dir ?? 'desc').toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const record = await this.records.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Charitable contribution request not found');
    return record;
  }

  async findOneFor(id: number, actor: CharitableActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, VIEW_ALL) && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async assertSubmittable(dto: SaveCharitableContributionDto, actor: CharitableActor) {
    const errors = await validateForSubmit(this.dataSource, dto, actor);
    if (errors.length) throw new BadRequestException(errors);
  }

  async create(dto: SaveCharitableContributionDto, actor: CharitableActor) {
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

  async update(id: number, dto: SaveCharitableContributionDto, actor: CharitableActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (!['draft', 'rejected'].includes(record.status)) {
      throw new ForbiddenException('Only draft or rejected requests can be edited');
    }
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable(dto, actor);
    // Submitting a record that already went through the flow (it was rejected) starts a new version.
    const revising = submitting && record.version > 0;
    Object.assign(record, this.fields(dto), { updateBy: actor.username, status: submitting ? 'submitted' : record.status });
    if (submitting) record.version += 1;
    if (submitting && !record.voucherNo) record.voucherNo = await this.generateVoucherNo();
    await this.records.save(record);
    if (submitting) await this.logEvent(record, revising ? 'revised' : 'submitted', actor.username, null, null);
    return this.findOne(id);
  }

  async approve(id: number, dto: ApproveCharitableContributionDto, actor: CharitableActor) {
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') {
      throw new ForbiddenException('This request is not waiting for action');
    }
    const pending = (r: CharitableContributionEntity) => STEPS.find((s) => r[s.by] && r[s.status] !== 'approved');
    const step = pending(record);
    if (!step) throw new ConflictException('This request has already completed its workflow');
    if (record[step.by]!.toLowerCase() !== actor.username.toLowerCase()) {
      throw new ForbiddenException('You are not assigned to this step, or it is not your turn yet');
    }
    if (dto.action === 'approved' && (step.key === 'approver' || step.key === 'approver2')) {
      const requesters = await requesterUsernames(this.dataSource, record);
      if (requesters.has(actor.username.toLowerCase()) && !(step.key === 'approver' && (await isMdUser(this.dataSource, actor.username)))) {
        throw new ForbiddenException('You cannot approve your own request unless you are an MD');
      }
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

  /** History entries (newest last): submissions and revisions with their version, plus every step decision and comment. */
  async events(id: number, actor: CharitableActor) {
    await this.findOneFor(id, actor);
    return this.dataSource.query(
      `SELECT id, version, action, step, actor, comment, created_at AS "createdAt"
       FROM charitable_contribution_events WHERE record_id = $1 ORDER BY created_at ASC, id ASC`,
      [id],
    );
  }

  /** Administrators only: hand a step that is still waiting (e.g. the person has left) to someone else. */
  async reassign(id: number, dto: ReassignDto, actor: CharitableActor) {
    if (!isAdministrator(actor)) throw new ForbiddenException('Only an administrator can reassign an approver');
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') throw new ForbiddenException('This request is not waiting for action');
    const step = STEPS.find((s) => s.key === dto.step);
    if (!step || !record[step.by] || record[step.status] !== 'pending') throw new BadRequestException('That step is not waiting for anyone');
    const next = dto.username.trim();
    await assertCanTakeStep(this.dataSource, next, 'charitable-contribution.view');
    if ((step.key === 'approver' || step.key === 'approver2') && (await requesterUsernames(this.dataSource, record)).has(next.toLowerCase())) {
      throw new BadRequestException('The requester cannot approve their own request');
    }
    const previous = record[step.by] as string;
    record[step.by] = next;
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.logEvent(record, 'reassigned', actor.username, step.key, `${previous} -> ${next}`);
    return this.findOne(id);
  }

  private async logEvent(record: CharitableContributionEntity, action: string, actorUsername: string, step: string | null, comment: string | null) {
    // A snapshot of the form data is kept for each submission so earlier versions can be reviewed.
    const snapshot = action === 'submitted' || action === 'revised' ? this.snapshot(record) : null;
    await this.dataSource.query(
      `INSERT INTO charitable_contribution_events (record_id, version, action, step, actor, comment, snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.id, record.version, action, step, actorUsername, comment, snapshot ? JSON.stringify(snapshot) : null],
    );
  }

  private snapshot(r: CharitableContributionEntity) {
    return {
      requestType: r.requestType, requesterName: r.requesterName, eventDescription: r.eventDescription, eventPurpose: r.eventPurpose,
      organizerName: r.organizerName, contributionDescription: r.contributionDescription, valueAmount: r.valueAmount, currency: r.currency,
      proposedDate: r.proposedDate, verifyBy: r.verifyBy, ack1By: r.ack1By, approverBy: r.approverBy, approver2By: r.approver2By, ack2By: r.ack2By,
    };
  }

  async remove(id: number, actor: CharitableActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (record.status !== 'draft') throw new ForbiddenException('Only draft requests can be deleted');
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.records.softDelete(id);
    return { message: 'Deleted' };
  }

  private fields(dto: SaveCharitableContributionDto): Partial<CharitableContributionEntity> {
    const text = (value?: string | null) => value?.trim() || null;
    return {
      requestType: dto.requestType,
      requesterName: dto.requesterName.trim(),
      eventDescription: text(dto.eventDescription),
      eventPurpose: text(dto.eventPurpose),
      organizerName: dto.organizerName.trim(),
      contributionDescription: text(dto.contributionDescription),
      valueAmount: String(dto.valueAmount),
      currency: dto.currency ?? 'THB',
      proposedDate: dto.proposedDate,
      attachments: dto.attachments ?? null,
      verifyBy: text(dto.verifyBy), verifyByStatus: text(dto.verifyBy) ? 'pending' : null, verifyByDate: null, verifyComment: null,
      ack1By: text(dto.ack1By), ack1ByStatus: text(dto.ack1By) ? 'pending' : null, ack1ByDate: null, ack1Comment: null,
      approverBy: text(dto.approverBy), approverByStatus: text(dto.approverBy) ? 'pending' : null, approverByDate: null, approverComment: null,
      approver2By: text(dto.approver2By), approver2ByStatus: text(dto.approver2By) ? 'pending' : null, approver2ByDate: null, approver2Comment: null,
      ack2By: text(dto.ack2By), ack2ByStatus: text(dto.ack2By) ? 'pending' : null, ack2ByDate: null, ack2Comment: null,
    };
  }

  /** CHA-YYYYMMDD-XXXX; soft-deleted rows still hold their numbers. */
  private async generateVoucherNo(): Promise<string> {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `CHA-${stamp}-`;
    const last = await this.records.createQueryBuilder('c')
      .withDeleted()
      .where('c.voucher_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('c.voucher_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.voucherNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async preparedBy(record: { requesterName: string }, actor: CharitableActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.requesterName;
  }

  private async takesPart(record: CharitableContributionEntity, actor: CharitableActor): Promise<boolean> {
    const people = [record.createBy, record.verifyBy, record.ack1By, record.approverBy, record.approver2By, record.ack2By];
    return people.includes(actor.username) || (await this.preparedBy(record, actor));
  }

  private async assertOwner(record: CharitableContributionEntity, actor: CharitableActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedBy(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }
}
