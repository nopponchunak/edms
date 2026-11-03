import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { ReassignDto, assertCanTakeStep } from '../lifecycle/reassign';
import { ApproveDesignReviewDto, ListDesignReviewsDto, SaveDesignReviewDto } from './dto/design-review.dto';
import { DesignReviewEntity } from './entities/design-review.entity';
import { DESIGN_REVIEW_FORMS } from './design-review.config';
import { DESIGN_REVIEW_VIEW_PERMISSION, drWaitingFor, validateDesignReviewForSubmit } from './design-review.rules';

export interface DesignReviewActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

/** The sign-offs in the order they must be completed. */
const STEPS = [
  { key: 'review', comment: 'reviewComment', by: 'reviewBy', status: 'reviewByStatus', date: 'reviewByDate' },
  { key: 'respond', comment: 'respondComment', by: 'respondBy', status: 'respondByStatus', date: 'respondByDate' },
  { key: 'tl', comment: 'tlComment', by: 'tlBy', status: 'tlByStatus', date: 'tlByDate' },
  { key: 'tl2', comment: 'tl2Comment', by: 'tl2By', status: 'tl2ByStatus', date: 'tl2ByDate' },
  { key: 'ack', comment: 'ackComment', by: 'ackBy', status: 'ackByStatus', date: 'ackByDate' },
] as const;

const VIEW_ALL = 'design-review.view-all';
const APPROVER_COLUMNS = ['review_by', 'respond_by', 'tl_by', 'tl2_by', 'ack_by'];
const SORT_COLUMNS: Record<string, string> = {
  id: 'd.id', voucher_no: 'd.voucherNo', project_no: 'd.projectNo', project_name: 'd.projectName', discipline: 'd.discipline',
  prepared_by: 'd.preparedBy', status: 'd.status', created_at: 'd.createdAt',
};

@Injectable()
export class DesignReviewService {
  constructor(
    @InjectRepository(DesignReviewEntity)
    private readonly records: Repository<DesignReviewEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListDesignReviewsDto, actor: DesignReviewActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const qb = this.records.createQueryBuilder('d').where('d.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere(
        `(d.project_no ILIKE :q OR d.project_name ILIKE :q OR d.prepared_by ILIKE :q OR d.voucher_no ILIKE :q OR d.discipline ILIKE :q OR ${APPROVER_COLUMNS.map((col) => `d.${col} ILIKE :q`).join(' OR ')})`,
        { q: `%${dto.q}%` },
      );
    }
    if (dto.status) qb.andWhere('d.status = :status', { status: dto.status });
    if (dto.formType) qb.andWhere('d.form_type = :formType', { formType: dto.formType });
    if (dto.approver) {
      qb.andWhere(`(${APPROVER_COLUMNS.map((col) => `d.${col} = :approver`).join(' OR ')})`, { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('d.created_at >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere("d.created_at < (:dateTo::date + 1)", { dateTo: dto.dateTo });
    if (!canViewAll(actor, VIEW_ALL)) {
      qb.andWhere(
        `(d.create_by = :self OR ${APPROVER_COLUMNS.map((col) => `d.${col} = :self`).join(' OR ')} OR d.prepared_by = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))`,
        { self: actor.username },
      );
    }
    if (dto.waiting === 'me') qb.andWhere(drWaitingFor('d')).setParameter('me', actor.username);

    qb.orderBy(SORT_COLUMNS[dto.sort ?? 'created_at'] ?? 'd.createdAt', (dto.dir ?? 'desc').toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const record = await this.records.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Design review not found');
    return record;
  }

  async findOneFor(id: number, actor: DesignReviewActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, VIEW_ALL) && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async assertSubmittable(dto: SaveDesignReviewDto) {
    const errors = await validateDesignReviewForSubmit(this.dataSource, dto);
    if (errors.length) throw new BadRequestException(errors);
  }

  async create(dto: SaveDesignReviewDto, actor: DesignReviewActor) {
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable(dto);
    const fields = await this.fields(dto);
    const record = this.records.create({
      ...fields,
      status: submitting ? 'submitted' : 'draft',
      version: submitting ? 1 : 0,
      createBy: actor.username,
      updateBy: actor.username,
      voucherNo: submitting ? await this.generateVoucherNo(fields.formType!) : null,
    });
    const saved = await this.records.save(record);
    if (submitting) await this.logEvent(saved, 'submitted', actor.username, null, null);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: SaveDesignReviewDto, actor: DesignReviewActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (!['draft', 'rejected'].includes(record.status)) {
      throw new ForbiddenException('Only draft or rejected reviews can be edited');
    }
    const submitting = dto.action === 'submitted';
    if (submitting) await this.assertSubmittable({ ...dto, formType: record.formType });
    // Submitting a review that already went through the flow (it was rejected) starts a new revision.
    const revising = submitting && record.version > 0;
    Object.assign(record, await this.fields({ ...dto, formType: record.formType }), { updateBy: actor.username, status: submitting ? 'submitted' : record.status });
    if (submitting) record.version += 1;
    if (submitting && !record.voucherNo) record.voucherNo = await this.generateVoucherNo(record.formType);
    await this.records.save(record);
    if (submitting) await this.logEvent(record, revising ? 'revised' : 'submitted', actor.username, null, null);
    return this.findOne(id);
  }

  async approve(id: number, dto: ApproveDesignReviewDto, actor: DesignReviewActor) {
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') {
      throw new ForbiddenException('This review is not waiting for action');
    }
    const pending = (r: DesignReviewEntity) => STEPS.find((s) => r[s.by] && r[s.status] !== 'approved');
    const step = pending(record);
    if (!step) throw new ConflictException('This review has already completed its workflow');
    if (record[step.by]!.toLowerCase() !== actor.username.toLowerCase()) {
      throw new ForbiddenException('You are not assigned to this step, or it is not your turn yet');
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

  /** Administrators only: hand a step that is still waiting (e.g. the person has left) to someone else. */
  async reassign(id: number, dto: ReassignDto, actor: DesignReviewActor) {
    if (!isAdministrator(actor)) throw new ForbiddenException('Only an administrator can reassign an approver');
    const record = await this.findOne(id);
    if (record.status !== 'submitted' && record.status !== 'verified') throw new ForbiddenException('This review is not waiting for action');
    const step = STEPS.find((s) => s.key === dto.step);
    if (!step || !record[step.by] || record[step.status] !== 'pending') throw new BadRequestException('That step is not waiting for anyone');
    const next = dto.username.trim();
    await assertCanTakeStep(this.dataSource, next, DESIGN_REVIEW_VIEW_PERMISSION);
    const previous = record[step.by] as string;
    record[step.by] = next;
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.logEvent(record, 'reassigned', actor.username, step.key, `${previous} -> ${next}`);
    return this.findOne(id);
  }

  /** History entries (oldest first): submissions and revisions with their number, plus every step decision and comment. */
  async events(id: number, actor: DesignReviewActor) {
    await this.findOneFor(id, actor);
    return this.dataSource.query(
      `SELECT id, version, action, step, actor, comment, created_at AS "createdAt"
       FROM design_review_events WHERE record_id = $1 ORDER BY created_at ASC, id ASC`,
      [id],
    );
  }

  private async logEvent(record: DesignReviewEntity, action: string, actorUsername: string, step: string | null, comment: string | null) {
    // A snapshot of the form data is kept for each submission so earlier revisions can be reviewed.
    const snapshot = action === 'submitted' || action === 'revised' ? this.snapshot(record) : null;
    await this.dataSource.query(
      `INSERT INTO design_review_events (record_id, version, action, step, actor, comment, snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.id, record.version, action, step, actorUsername, comment, snapshot ? JSON.stringify(snapshot) : null],
    );
  }

  private snapshot(r: DesignReviewEntity) {
    return {
      formType: r.formType, projectNo: r.projectNo, projectName: r.projectName, preparedBy: r.preparedBy, discipline: r.discipline,
      disciplineOther: r.disciplineOther, stage: r.stage, documentTypes: r.documentTypes, documentTypesOther: r.documentTypesOther,
      documentLocation: r.documentLocation, checklist: r.checklist, comments: r.comments, recommendedActions: r.recommendedActions,
      actionsTaken: r.actionsTaken, actionNote: r.actionNote,
      reviewBy: r.reviewBy, respondBy: r.respondBy, tlBy: r.tlBy, tl2By: r.tl2By, ackBy: r.ackBy,
    };
  }

  async remove(id: number, actor: DesignReviewActor) {
    const record = await this.findOne(id);
    await this.assertOwner(record, actor);
    if (record.status !== 'draft') throw new ForbiddenException('Only draft reviews can be deleted');
    record.updateBy = actor.username;
    await this.records.save(record);
    await this.records.softDelete(id);
    return { message: 'Deleted' };
  }

  private async fields(dto: SaveDesignReviewDto): Promise<Partial<DesignReviewEntity>> {
    const text = (value?: string | null) => value?.trim() || null;
    const formType = dto.formType ?? 'mtdd01';
    const config = DESIGN_REVIEW_FORMS[formType];
    // The project's number and name are copied onto the review so it keeps reading the same if the project is edited later.
    const project: { id: number; project_no: string; name: string }[] = dto.projectId
      ? await this.dataSource.query(`SELECT id, project_no, name FROM projects WHERE id = $1 AND deleted_at IS NULL`, [dto.projectId])
      : [];
    const answers = new Map((dto.checklist ?? []).map((c) => [c.id, c.answer ?? null]));
    const documents = (dto.documentTypes ?? []).filter((d) => config.documentTypes.includes(d));
    const discipline = text(dto.discipline);
    return {
      formType,
      projectId: project[0]?.id ?? null,
      projectNo: project[0]?.project_no ?? null,
      projectName: project[0]?.name ?? null,
      preparedBy: dto.preparedBy.trim(),
      discipline,
      disciplineOther: discipline === 'Other' ? text(dto.disciplineOther) : null,
      stage: text(dto.stage),
      documentTypes: documents,
      documentTypesOther: documents.includes('Other') ? text(dto.documentTypesOther) : null,
      documentLocation: text(dto.documentLocation),
      checklist: config.checklist.map((item) => ({ id: item.id, answer: answers.get(item.id) ?? null })),
      comments: text(dto.comments),
      recommendedActions: text(dto.recommendedActions),
      actionsTaken: dto.actionsTaken ?? null,
      actionNote: dto.actionsTaken ? text(dto.actionNote) : null,
      attachments: dto.attachments ?? null,
      reviewBy: text(dto.reviewBy), reviewByStatus: text(dto.reviewBy) ? 'pending' : null, reviewByDate: null, reviewComment: null,
      respondBy: text(dto.respondBy), respondByStatus: text(dto.respondBy) ? 'pending' : null, respondByDate: null, respondComment: null,
      tlBy: text(dto.tlBy), tlByStatus: text(dto.tlBy) ? 'pending' : null, tlByDate: null, tlComment: null,
      tl2By: text(dto.tl2By), tl2ByStatus: text(dto.tl2By) ? 'pending' : null, tl2ByDate: null, tl2Comment: null,
      ackBy: text(dto.ackBy), ackByStatus: text(dto.ackBy) ? 'pending' : null, ackByDate: null, ackComment: null,
    };
  }

  /** `<form>-YYYYMMDD-XXXX` (e.g. MTDD-01-20261102-0001); soft-deleted rows still hold their numbers. */
  private async generateVoucherNo(formType: string): Promise<string> {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `${DESIGN_REVIEW_FORMS[formType].voucherPrefix}-${stamp}-`;
    const last = await this.records.createQueryBuilder('d')
      .withDeleted()
      .where('d.voucher_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('d.voucher_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.voucherNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async preparedByActor(record: { preparedBy: string }, actor: DesignReviewActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.preparedBy;
  }

  private async takesPart(record: DesignReviewEntity, actor: DesignReviewActor): Promise<boolean> {
    const people = [record.createBy, record.reviewBy, record.respondBy, record.tlBy, record.tl2By, record.ackBy];
    return people.includes(actor.username) || (await this.preparedByActor(record, actor));
  }

  private async assertOwner(record: DesignReviewEntity, actor: DesignReviewActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedByActor(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }
}

