import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canViewAll, isAdministrator } from '../auth/access-scope';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApproveExpensesClaimDto } from './dto/approve-expenses-claim.dto';
import { ListExpensesClaimsDto } from './dto/list-expenses-claims.dto';
import { SaveExpensesClaimDto } from './dto/save-expenses-claim.dto';
import { ExpensesClaimItemEntity } from './entities/expenses-claim-item.entity';
import { ExpensesClaimEntity } from './entities/expenses-claim.entity';
import { waitingFor } from '../approvals/waiting';

export interface ClaimActor {
  userId: number;
  username: string;
  displayName: string;
  roles?: string[];
  permissions?: string[];
}

@Injectable()
export class ExpensesClaimService {
  constructor(
    @InjectRepository(ExpensesClaimEntity)
    private readonly claims: Repository<ExpensesClaimEntity>,
    @InjectRepository(ExpensesClaimItemEntity)
    private readonly claimItems: Repository<ExpensesClaimItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(dto: ListExpensesClaimsDto, actor: ClaimActor) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const sort = dto.sort ?? 'claim_date';
    const dir = dto.dir ?? 'desc';

    const qb = this.claims.createQueryBuilder('c')
      .leftJoinAndSelect('c.items', 'items')
      .where('c.deleted_at IS NULL');

    if (dto.q) {
      qb.andWhere('(c.claimant_name ILIKE :q OR c.voucher_no ILIKE :q OR c.verified_by ILIKE :q OR c.approved_by ILIKE :q)', { q: `%${dto.q}%` });
    }
    if (dto.status) {
      qb.andWhere('c.status = :status', { status: dto.status });
    }
    if (dto.approver) {
      qb.andWhere('(c.verified_by = :approver OR c.approved_by = :approver)', { approver: dto.approver });
    }
    if (dto.dateFrom) qb.andWhere('c.claim_date >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('c.claim_date <= :dateTo', { dateTo: dto.dateTo });
    if (!canViewAll(actor, 'expenses-claim.view-all')) {
      qb.andWhere(
        '(c.create_by = :self OR c.verified_by = :self OR c.approved_by = :self OR c.claimant_name = (SELECT u.display_name FROM users u WHERE u.username = :self LIMIT 1))',
        { self: actor.username },
      );
    }
    if (dto.waiting === 'me') {
      qb.andWhere(waitingFor('c', 'verifiedBy', 'verifiedByStatus', 'approvedBy', 'approvedByStatus')).setParameter('me', actor.username);
    }

    const colMap: Record<string, string> = {
      id: 'c.id', claim_date: 'c.claimDate', claimant_name: 'c.claimantName',
      status: 'c.status', total_baht: 'c.totalBaht',
    };
    qb.orderBy(colMap[sort] ?? 'c.claimDate', dir.toUpperCase() as 'ASC' | 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async findOneFor(id: number, actor: ClaimActor) {
    const record = await this.findOne(id);
    if (!canViewAll(actor, 'expenses-claim.view-all') && !(await this.takesPart(record, actor))) {
      throw new ForbiddenException('You do not have access to this record');
    }
    return record;
  }

  private async preparedBy(record: { claimantName: string }, actor: ClaimActor): Promise<boolean> {
    const rows: { display_name: string }[] = await this.dataSource.query('SELECT display_name FROM users WHERE username = $1 LIMIT 1', [actor.username]);
    return rows[0]?.display_name === record.claimantName;
  }

  private async takesPart(record: ExpensesClaimEntity, actor: ClaimActor): Promise<boolean> {
    const people = [record.createBy, record.verifiedBy, record.approvedBy];
    return people.includes(actor.username) || (await this.preparedBy(record, actor));
  }

  private async assertOwner(record: ExpensesClaimEntity, actor: ClaimActor): Promise<void> {
    if (isAdministrator(actor) || record.createBy === actor.username || (await this.preparedBy(record, actor))) return;
    throw new ForbiddenException('Only the owner can change this record');
  }

  async findOne(id: number) {
    const claim = await this.claims.findOne({ where: { id }, relations: ['items'] });
    if (!claim) throw new NotFoundException('Expenses claim not found');
    return claim;
  }

  async create(dto: SaveExpensesClaimDto, actor: ClaimActor) {
    const claim = this.claims.create({
      claimantName: dto.claimantName,
      claimDate: dto.claimDate,
      currency: dto.currency ?? 'THB',
      verifiedBy: dto.verifiedBy ?? null,
      approvedBy: dto.approvedBy ?? null,
      attachments: dto.attachments ?? null,
      status: dto.action === 'submitted' ? 'submitted' : 'draft',
      createBy: actor.username,
      updateBy: actor.username,
      totalBaht: String(dto.items.reduce((sum, i) => sum + (i.baht ?? 0), 0)),
      verifiedByStatus: dto.verifiedBy ? 'pending' : null,
      approvedByStatus: dto.approvedBy ? 'pending' : null,
    });

    if (dto.action === 'submitted') {
      claim.voucherNo = await this.generateVoucherNo();
    }

    const saved = await this.dataSource.transaction(async (em) => {
      const c = await em.save(ExpensesClaimEntity, claim);
      const items = dto.items.map((item, idx) =>
        em.create(ExpensesClaimItemEntity, {
          expensesClaimId: c.id,
          seq: item.seq ?? idx + 1,
          itemDate: item.itemDate,
          projectDetailId: item.projectDetailId ?? null,
          projectCode: item.projectCode ?? null,
          projectName: item.projectName ?? null,
          details: item.details,
          baht: String(item.baht),
          createBy: actor.username,
          updateBy: actor.username,
        }),
      );
      await em.save(ExpensesClaimItemEntity, items);
      return c;
    });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: SaveExpensesClaimDto, actor: ClaimActor) {
    const claim = await this.findOne(id);
    await this.assertOwner(claim, actor);
    if (!['draft', 'rejected'].includes(claim.status)) {
      throw new ForbiddenException('Only draft or rejected claims can be edited');
    }

    claim.claimantName = dto.claimantName;
    claim.claimDate = dto.claimDate;
    claim.currency = dto.currency ?? claim.currency ?? 'THB';
    claim.verifiedBy = dto.verifiedBy ?? null;
    claim.approvedBy = dto.approvedBy ?? null;
    claim.attachments = dto.attachments ?? null;
    claim.totalBaht = String(dto.items.reduce((sum, i) => sum + (i.baht ?? 0), 0));
    claim.updateBy = actor.username;

    if (dto.action === 'submitted' && claim.status !== 'submitted') {
      claim.status = 'submitted';
      claim.verifiedByStatus = dto.verifiedBy ? 'pending' : null;
      claim.approvedByStatus = dto.approvedBy ? 'pending' : null;
      claim.verifiedByDate = null;
      claim.approvedByDate = null;
      if (!claim.voucherNo) claim.voucherNo = await this.generateVoucherNo();
    }

    await this.dataSource.transaction(async (em) => {
      await em.softDelete(ExpensesClaimItemEntity, { expensesClaimId: id });
      await em.save(ExpensesClaimEntity, claim);
      const items = dto.items.map((item, idx) =>
        em.create(ExpensesClaimItemEntity, {
          expensesClaimId: id,
          seq: item.seq ?? idx + 1,
          itemDate: item.itemDate,
          projectDetailId: item.projectDetailId ?? null,
          projectCode: item.projectCode ?? null,
          projectName: item.projectName ?? null,
          details: item.details,
          baht: String(item.baht),
          createBy: actor.username,
          updateBy: actor.username,
        }),
      );
      await em.save(ExpensesClaimItemEntity, items);
    });
    return this.findOne(id);
  }

  async approve(id: number, dto: ApproveExpensesClaimDto, actor: ClaimActor) {
    const claim = await this.findOne(id);
    const username = actor.username;
    const now = new Date();

    const approverTurn = claim.status === 'verified' || (claim.status === 'submitted' && !claim.verifiedBy);

    if (claim.status === 'submitted' && claim.verifiedBy === username && claim.verifiedByStatus === 'pending') {
      claim.verifiedByStatus = dto.action === 'approved' ? 'approved' : 'rejected';
      claim.verifiedByDate = now;
      claim.status = dto.action === 'approved' ? 'verified' : 'rejected';
    } else if (approverTurn && claim.approvedBy === username && claim.approvedByStatus === 'pending') {
      claim.approvedByStatus = dto.action === 'approved' ? 'approved' : 'rejected';
      claim.approvedByDate = now;
      claim.status = dto.action === 'approved' ? 'approved' : 'rejected';
    } else {
      throw new ForbiddenException('You are not authorized to act on this claim at this stage');
    }

    claim.updateBy = username;
    await this.claims.save(claim);
    return this.findOne(id);
  }

  async remove(id: number, actor: ClaimActor) {
    const claim = await this.findOne(id);
    await this.assertOwner(claim, actor);
    if (claim.status !== 'draft') throw new ForbiddenException('Only draft claims can be deleted');
    claim.updateBy = actor.username;
    await this.claims.save(claim);
    await this.claims.softDelete(id);
    return { message: 'Deleted' };
  }

  private async generateVoucherNo(): Promise<string> {
    const now = new Date();
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `EC-${yy}${mm}${dd}-`;
    const last = await this.claims.createQueryBuilder('c')
      .withDeleted()
      .where('c.voucher_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('c.voucher_no', 'DESC')
      .getOne();
    const seq = last ? parseInt(last.voucherNo!.split('-').pop()!, 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}
