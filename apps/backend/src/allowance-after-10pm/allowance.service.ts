import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApproveAllowanceDto } from './dto/approve-allowance.dto';
import { ListAllowancesDto } from './dto/list-allowances.dto';
import { SaveAllowanceDto } from './dto/save-allowance.dto';
import { AllowanceItemEntity } from './entities/allowance-item.entity';
import { AllowanceEntity } from './entities/allowance.entity';
import { waitingFor } from '../approvals/waiting';

export interface AllowanceActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

@Injectable()
export class AllowanceService {
  constructor(
    @InjectRepository(AllowanceEntity)
    private readonly allowances: Repository<AllowanceEntity>,
    @InjectRepository(AllowanceItemEntity)
    private readonly allowanceItems: Repository<AllowanceItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListAllowancesDto, actor: AllowanceActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const sort = dto.sort ?? 'request_date';
    const dir = dto.dir ?? 'desc';

    const qb = this.allowances.createQueryBuilder('a')
      .leftJoinAndSelect('a.items', 'items')
      .where('a.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere('(a.claimant_name ILIKE :q OR a.voucher_no ILIKE :q OR a.tl_by ILIKE :q OR a.di_by ILIKE :q)', { q: `%${dto.q}%` });
    }
    if (dto.status) {
      qb.andWhere('a.status = :status', { status: dto.status });
    }
    if (dto.approver) {
      qb.andWhere('(a.tl_by = :approver OR a.di_by = :approver)', { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('a.request_date >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('a.request_date <= :dateTo', { dateTo: dto.dateTo });
    if (!canViewAll(actor, 'allowance-after-10pm.view-all')) {
      qb.andWhere(
        '(a.create_by = :self OR a.tl_by = :self OR a.di_by = :self OR a.claimant_name = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))',
        { self: actor.username },
      );
    }
    if (dto.waiting === 'me') {
      qb.andWhere(waitingFor('a', 'tlBy', 'tlByStatus', 'diBy', 'diByStatus')).setParameter('me', actor.username);
    }

    const colMap: Record<string, string> = {
      id: 'a.id', request_date: 'a.requestDate', claimant_name: 'a.claimantName',
      status: 'a.status', total_baht: 'a.totalBaht',
    };
    qb.orderBy(colMap[sort] ?? 'a.requestDate', dir.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOneFor(id: number, actor: AllowanceActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, 'allowance-after-10pm.view-all') && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async preparedBy(record: { claimantName: string }, actor: AllowanceActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.claimantName;
  }

  private async takesPart(record: AllowanceEntity, actor: AllowanceActor): Promise<boolean> {
    const people = [record.createBy, record.tlBy, record.diBy];
    return people.includes(actor.username) || (await this.preparedBy(record, actor));
  }

  private async assertOwner(record: AllowanceEntity, actor: AllowanceActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedBy(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }

  async findOne(id: number) {
    const item = await this.allowances.findOne({ where: { id }, relations: ['items'] });
    if (!item) throw new NotFoundException('Allowance record not found');
    return item;
  }

  async create(dto: SaveAllowanceDto, actor: AllowanceActor) {
    const allowance = this.allowances.create({
      claimantName: dto.claimantName,
      discipline: dto.discipline ?? null,
      requestDate: dto.requestDate,
      tlBy: dto.tlBy ?? null,
      diBy: dto.diBy ?? null,
      notifiedUser: dto.notifiedUser ?? null,
      attachments: dto.attachments ?? null,
      status: dto.action === 'submitted' ? 'submitted' : 'draft',
      createBy: actor.username,
      updateBy: actor.username,
      totalBaht: String(dto.items.reduce((sum, i) => sum + (i.baht ?? 0), 0)),
      tlByStatus: dto.tlBy ? 'pending' : null,
      diByStatus: dto.diBy ? 'pending' : null,
      notifiedUserStatus: dto.notifiedUser ? 'pending' : null,
    });

    if (dto.action === 'submitted') {
      allowance.voucherNo = await this.generateVoucherNo();
    }

    const saved = await this.dataSource.transaction(async (em) => {
      const a = await em.save(AllowanceEntity, allowance);
      const items = dto.items.map((item, idx) =>
        em.create(AllowanceItemEntity, {
          allowanceId: a.id,
          seq: item.seq ?? idx + 1,
          workDate: item.workDate,
          projectDetailId: item.projectDetailId ?? null,
          projectCode: item.projectCode ?? null,
          projectName: item.projectName ?? null,
          description: item.description ?? null,
          timeFrom: item.timeFrom ?? null,
          timeTo: item.timeTo ?? null,
          baht: String(item.baht),
          createBy: actor.username,
          updateBy: actor.username,
        }),
      );
      await em.save(AllowanceItemEntity, items);
      return a;
    });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: SaveAllowanceDto, actor: AllowanceActor) {
    const allowance = await this.findOne(id);
    await this.assertOwner(allowance, actor);
    if (!['draft', 'rejected'].includes(allowance.status)) {
      throw new ForbiddenException('Only draft or rejected records can be edited');
    }

    allowance.claimantName = dto.claimantName;
    allowance.discipline = dto.discipline ?? null;
    allowance.requestDate = dto.requestDate;
    allowance.tlBy = dto.tlBy ?? null;
    allowance.diBy = dto.diBy ?? null;
    allowance.notifiedUser = dto.notifiedUser ?? null;
    allowance.attachments = dto.attachments ?? null;
    allowance.totalBaht = String(dto.items.reduce((sum, i) => sum + (i.baht ?? 0), 0));
    allowance.updateBy = actor.username;

    if (dto.action === 'submitted' && allowance.status !== 'submitted') {
      allowance.status = 'submitted';
      allowance.tlByStatus = dto.tlBy ? 'pending' : null;
      allowance.diByStatus = dto.diBy ? 'pending' : null;
      allowance.notifiedUserStatus = dto.notifiedUser ? 'pending' : null;
      allowance.tlByDate = null;
      allowance.diByDate = null;
      if (!allowance.voucherNo) allowance.voucherNo = await this.generateVoucherNo();
    }

    await this.dataSource.transaction(async (em) => {
      await em.softDelete(AllowanceItemEntity, { allowanceId: id });
      await em.save(AllowanceEntity, allowance);
      const items = dto.items.map((item, idx) =>
        em.create(AllowanceItemEntity, {
          allowanceId: id,
          seq: item.seq ?? idx + 1,
          workDate: item.workDate,
          projectDetailId: item.projectDetailId ?? null,
          projectCode: item.projectCode ?? null,
          projectName: item.projectName ?? null,
          description: item.description ?? null,
          timeFrom: item.timeFrom ?? null,
          timeTo: item.timeTo ?? null,
          baht: String(item.baht),
          createBy: actor.username,
          updateBy: actor.username,
        }),
      );
      await em.save(AllowanceItemEntity, items);
    });
    return this.findOne(id);
  }

  async approve(id: number, dto: ApproveAllowanceDto, actor: AllowanceActor) {
    const allowance = await this.findOne(id);
    const username = actor.username;
    const now = new Date();

    const approverTurn = allowance.status === 'verified' || (allowance.status === 'submitted' && !allowance.tlBy);

    if (allowance.status === 'submitted' && allowance.tlBy === username && allowance.tlByStatus === 'pending') {
      allowance.tlByStatus = dto.action === 'approved' ? 'approved' : 'rejected';
      allowance.tlByDate = now;
      allowance.status = dto.action === 'approved' ? 'verified' : 'rejected';
    } else if (approverTurn && allowance.diBy === username && allowance.diByStatus === 'pending') {
      allowance.diByStatus = dto.action === 'approved' ? 'approved' : 'rejected';
      allowance.diByDate = now;
      allowance.status = dto.action === 'approved' ? 'approved' : 'rejected';
    } else {
      throw new ForbiddenException('You are not authorized to act on this record at this stage');
    }

    allowance.updateBy = username;
    await this.allowances.save(allowance);
    return this.findOne(id);
  }

  async remove(id: number, actor: AllowanceActor) {
    const allowance = await this.findOne(id);
    await this.assertOwner(allowance, actor);
    if (allowance.status !== 'draft') throw new ForbiddenException('Only draft records can be deleted');
    allowance.updateBy = actor.username;
    await this.allowances.save(allowance);
    await this.allowances.softDelete(id);
    return { message: 'Deleted' };
  }

  private async generateVoucherNo(): Promise<string> {
    const now = new Date();
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `AL-${yy}${mm}${dd}-`;
    const last = await this.allowances.createQueryBuilder('a')
      .withDeleted()
      .where('a.voucher_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('a.voucher_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.voucherNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}
