import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReassignDto, assertCanTakeStep } from '../lifecycle/reassign';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { ApprovePurchaseRequisitionDto, ListPurchaseRequisitionsDto, SavePurchaseRequisitionDto } from './dto/purchase-requisition.dto';
import { PurchaseRequisitionEntity } from './entities/purchase-requisition.entity';
import { PR_DEFAULT_PAYMENT_TERM, PR_VOUCHER_PREFIX, computePrTotals, prRequesterUsernames, prWaitingFor, validatePrForSubmit } from './purchase-requisition.rules';

export interface PrActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

/** The approval steps in the order they must be completed. */
const STEPS = [
  { key: 'verifyIs', comment: 'verifyIsComment', by: 'verifyIsBy', status: 'verifyIsByStatus', date: 'verifyIsByDate' },
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate' },
  { key: 'approver2', comment: 'approver2Comment', by: 'approver2By', status: 'approver2ByStatus', date: 'approver2ByDate' },
  { key: 'ack', comment: 'ackComment', by: 'ackBy', status: 'ackByStatus', date: 'ackByDate' },
  { key: 'action', comment: 'actionComment', by: 'actionBy', status: 'actionByStatus', date: 'actionByDate' },
] as const;

const VIEW_ALL = 'purchase-requisition.view-all';
const APPROVER_COLUMNS = ['verify_is_by', 'verify_by', 'approver_by', 'approver2_by', 'ack_by', 'action_by'];
const SORT_COLUMNS: Record<string, string> = {
  id: 'p.id', pr_no: 'p.prNo', subject: 'p.subject', requested_by: 'p.requestedBy', request_date: 'p.requestDate',
  grand_total: 'p.grandTotal', approver_by: 'p.approverBy', status: 'p.status', created_at: 'p.createdAt',
};

@Injectable()
export class PurchaseRequisitionService {
  constructor(
    @InjectRepository(PurchaseRequisitionEntity)
    private readonly records: Repository<PurchaseRequisitionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListPurchaseRequisitionsDto, actor: PrActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const qb = this.records.createQueryBuilder('p').where('p.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere(
        `(p.requested_by ILIKE :q OR p.subject ILIKE :q OR p.pr_no ILIKE :q OR p.to_name ILIKE :q OR ${APPROVER_COLUMNS.map((col) => `p.${col} ILIKE :q`).join(' OR ')})`,
        { q: `%${dto.q}%` },
      );
    }
    if (dto.status) qb.andWhere('p.status = :status', { status: dto.status });
    if (dto.approver) {
      qb.andWhere(`(${APPROVER_COLUMNS.map((col) => `p.${col} = :approver`).join(' OR ')})`, { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('p.request_date >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('p.request_date <= :dateTo', { dateTo: dto.dateTo });
    if (!canViewAll(actor, VIEW_ALL)) {
      qb.andWhere(
        `(p.create_by = :self OR ${APPROVER_COLUMNS.map((col) => `p.${col} = :self`).join(' OR ')} OR p.requested_by = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))`,
        { self: actor.username },
      );
    }
    if (dto.waiting === 'me') qb.andWhere(prWaitingFor('p')).setParameter('me', actor.username);

    qb.orderBy(SORT_COLUMNS[dto.sort ?? 'created_at'] ?? 'p.createdAt', (dto.dir ?? 'desc').toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const record = await this.records.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Purchase requisition not found');
    return record;
  }

  async findOneFor(id: number, actor: PrActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, VIEW_ALL) && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async assertSubmittable(dto: SavePurchaseRequisitionDto, actor: PrActor) {
    const errors = await validatePrForSubmit(this.dataSource, dto, actor);
    if (errors.length) throw new BadRequestException(errors);
  }

  async create(dto: SavePurchaseRequisitionDto, actor: PrActor) {
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable(dto, actor);
    const record = this.records.create({
      ...this.fields(dto),
      status: submitting ? 'submitted' : 'draft',
      version: submitting ? 1 : 0,
      createBy: actor.username,
      updateBy: actor.username,
      prNo: submitting ? await this.generatePrNo() : null,
    });
    const saved = await this.records.save(record);
    if (submitting) await this.logEvent(saved, 'submitted', actor.username, null, null);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: SavePurchaseRequisitionDto, actor: PrActor) {
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
    if (submitting && !record.prNo) record.prNo = await this.generatePrNo();
    await this.records.save(record);
    if (submitting) await this.logEvent(record, revising ? 'revised' : 'submitted', actor.username, null, null);
    return this.findOne(id);
  }

  async approve(id: number, dto: ApprovePurchaseRequisitionDto, actor: PrActor) {
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') {
      throw new ForbiddenException('This request is not waiting for action');
    }
    const pending = (r: PurchaseRequisitionEntity) => STEPS.find((s) => r[s.by] && r[s.status] !== 'approved');
    const step = pending(record);
    if (!step) throw new ConflictException('This request has already completed its workflow');
    if (record[step.by]!.toLowerCase() !== actor.username.toLowerCase()) {
      throw new ForbiddenException('You are not assigned to this step, or it is not your turn yet');
    }
    if (dto.action === 'approved' && (step.key === 'approver' || step.key === 'approver2')) {
      const requesters = await prRequesterUsernames(this.dataSource, record);
      if (requesters.has(actor.username.toLowerCase())) throw new ForbiddenException('You cannot approve your own request');
    }
    const comment = dto.comment?.trim() || null;
    if (dto.action === 'rejected' && !comment) throw new BadRequestException('A comment is required when rejecting');

    // CA records which items need an asset code while acknowledging.
    if (dto.action === 'approved' && step.key === 'ack') {
      if (dto.needAssetCodeRegistration !== undefined) record.needAssetCodeRegistration = dto.needAssetCodeRegistration;
      if (dto.itemAssetFlags) {
        record.items = record.items.map((row, i) => ({ ...row, needAsset: dto.itemAssetFlags![i] ?? row.needAsset ?? false }));
      }
    }

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
  async events(id: number, actor: PrActor) {
    await this.findOneFor(id, actor);
    return this.dataSource.query(
      `SELECT id, version, action, step, actor, comment, created_at AS "createdAt"
       FROM purchase_requisition_events WHERE record_id = $1 ORDER BY created_at ASC, id ASC`,
      [id],
    );
  }

  /** Administrators only: hand a step that is still waiting (e.g. the person has left) to someone else. */
  async reassign(id: number, dto: ReassignDto, actor: PrActor) {
    if (!isAdministrator(actor)) throw new ForbiddenException('Only an administrator can reassign an approver');
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') throw new ForbiddenException('This request is not waiting for action');
    const step = STEPS.find((s) => s.key === dto.step);
    if (!step || !record[step.by] || record[step.status] !== 'pending') throw new BadRequestException('That step is not waiting for anyone');
    const next = dto.username.trim();
    await assertCanTakeStep(this.dataSource, next, 'purchase-requisition.view');
    if ((step.key === 'approver' || step.key === 'approver2') && (await prRequesterUsernames(this.dataSource, record)).has(next.toLowerCase())) {
      throw new BadRequestException('The requester cannot approve their own request');
    }
    const previous = record[step.by] as string;
    record[step.by] = next;
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.logEvent(record, 'reassigned', actor.username, step.key, `${previous} -> ${next}`);
    return this.findOne(id);
  }

  private async logEvent(record: PurchaseRequisitionEntity, action: string, actorUsername: string, step: string | null, comment: string | null) {
    // A snapshot of the form data is kept for each submission so earlier revisions can be reviewed.
    const snapshot = action === 'submitted' || action === 'revised' ? this.snapshot(record) : null;
    await this.dataSource.query(
      `INSERT INTO purchase_requisition_events (record_id, version, action, step, actor, comment, snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.id, record.version, action, step, actorUsername, comment, snapshot ? JSON.stringify(snapshot) : null],
    );
  }

  private snapshot(r: PurchaseRequisitionEntity) {
    return {
      subject: r.subject, toName: r.toName, requestDate: r.requestDate, requestedBy: r.requestedBy, recommendedBy: r.recommendedBy,
      deadline: r.deadline, receivedFrom: r.receivedFrom, reasonsForPurchase: r.reasonsForPurchase, currency: r.currency,
      items: r.items, discount: r.discount, vat: r.vat, grandTotal: r.grandTotal, paymentTerm: r.paymentTerm,
      otherConditions: r.otherConditions, quotationAttached: r.quotationAttached, notItEquipment: r.notItEquipment,
      verifyIsBy: r.verifyIsBy, verifyBy: r.verifyBy, approverBy: r.approverBy, approver2By: r.approver2By, ackBy: r.ackBy, actionBy: r.actionBy,
    };
  }

  async remove(id: number, actor: PrActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (record.status !== 'draft') throw new ForbiddenException('Only draft requests can be deleted');
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.records.softDelete(id);
    return { message: 'Deleted' };
  }

  private fields(dto: SavePurchaseRequisitionDto): Partial<PurchaseRequisitionEntity> {
    const text = (value?: string | null) => value?.trim() || null;
    const totals = computePrTotals(dto);
    const notIt = dto.notItEquipment ?? false;
    return {
      subject: dto.subject.trim(),
      toName: text(dto.toName),
      requestDate: dto.requestDate,
      requestedBy: dto.requestedBy.trim(),
      recommendedBy: text(dto.recommendedBy),
      deadline: dto.deadline || null,
      receivedFrom: text(dto.receivedFrom),
      reasonsForPurchase: text(dto.reasonsForPurchase),
      currency: dto.currency ?? 'THB',
      items: totals.items,
      discount: String(totals.discount),
      vat: dto.vat ?? false,
      subTotal: String(totals.subTotal),
      vatValue: String(totals.vatValue),
      grandTotal: String(totals.grandTotal),
      paymentTerm: text(dto.paymentTerm) ?? PR_DEFAULT_PAYMENT_TERM,
      otherConditions: text(dto.otherConditions),
      quotationAttached: dto.quotationAttached ?? false,
      notItEquipment: notIt,
      needAssetCodeRegistration: null,
      attachments: dto.attachments ?? null,
      verifyIsBy: notIt ? null : text(dto.verifyIsBy), verifyIsByStatus: !notIt && text(dto.verifyIsBy) ? 'pending' : null, verifyIsByDate: null, verifyIsComment: null,
      verifyBy: text(dto.verifyBy), verifyByStatus: text(dto.verifyBy) ? 'pending' : null, verifyByDate: null, verifyComment: null,
      approverBy: text(dto.approverBy), approverByStatus: text(dto.approverBy) ? 'pending' : null, approverByDate: null, approverComment: null,
      approver2By: text(dto.approver2By), approver2ByStatus: text(dto.approver2By) ? 'pending' : null, approver2ByDate: null, approver2Comment: null,
      ackBy: text(dto.ackBy), ackByStatus: text(dto.ackBy) ? 'pending' : null, ackByDate: null, ackComment: null,
      actionBy: text(dto.actionBy), actionByStatus: text(dto.actionBy) ? 'pending' : null, actionByDate: null, actionComment: null,
    };
  }

  /** PR-YYYYMMDD-XXXX; soft-deleted rows still hold their numbers. */
  private async generatePrNo(): Promise<string> {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `${PR_VOUCHER_PREFIX}-${stamp}-`;
    const last = await this.records.createQueryBuilder('p')
      .withDeleted()
      .where('p.pr_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('p.pr_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.prNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async preparedBy(record: { requestedBy: string }, actor: PrActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.requestedBy;
  }

  private async takesPart(record: PurchaseRequisitionEntity, actor: PrActor): Promise<boolean> {
    const people = [record.createBy, record.verifyIsBy, record.verifyBy, record.approverBy, record.approver2By, record.ackBy, record.actionBy];
    return people.includes(actor.username) || (await this.preparedBy(record, actor));
  }

  private async assertOwner(record: PurchaseRequisitionEntity, actor: PrActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedBy(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }
}
