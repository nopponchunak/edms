import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AllowanceEntity } from '../allowance-after-10pm/entities/allowance.entity';
import { ExpensesClaimEntity } from '../expenses-claim/entities/expenses-claim.entity';
import { charitableWaitingFor } from '../charitable-contribution/charitable-contribution.waiting';
import { CharitableContributionEntity } from '../charitable-contribution/entities/charitable-contribution.entity';
import { offeringWaitingFor } from '../gift-hospitality-offering/gift-hospitality-offering.rules';
import { GiftOfferingEntity } from '../gift-hospitality-offering/entities/gift-hospitality-offering.entity';
import { giftWaitingFor } from '../gift-hospitality-receiving/gift-hospitality-receiving.rules';
import { GiftReceivingEntity } from '../gift-hospitality-receiving/entities/gift-hospitality-receiving.entity';
import { PurchaseRequisitionEntity } from '../purchase-requisition/entities/purchase-requisition.entity';
import { prWaitingFor } from '../purchase-requisition/purchase-requisition.rules';
import { waitingFor } from './waiting';

export type ApprovalStage = 'verify' | 'approve' | 'acknowledge';

export interface PendingItem {
  form: 'expenses' | 'allowance' | 'charitable' | 'gift-receiving' | 'gift-offering' | 'purchase-requisition';
  id: number;
  voucherNo: string | null;
  claimantName: string;
  totalBaht: string;
  currency: string;
  stage: ApprovalStage;
  submittedAt: Date;
}

const ITEM_LIMIT = 50;

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectRepository(ExpensesClaimEntity) private readonly claims: Repository<ExpensesClaimEntity>,
    @InjectRepository(AllowanceEntity) private readonly allowances: Repository<AllowanceEntity>,
    @InjectRepository(CharitableContributionEntity) private readonly charitable: Repository<CharitableContributionEntity>,
    @InjectRepository(GiftReceivingEntity) private readonly giftReceivings: Repository<GiftReceivingEntity>,
    @InjectRepository(GiftOfferingEntity) private readonly giftOfferings: Repository<GiftOfferingEntity>,
    @InjectRepository(PurchaseRequisitionEntity) private readonly requisitions: Repository<PurchaseRequisitionEntity>,
  ) {}

  async pending(username: string) {
    const [claims, allowances, charitableRecords, giftRecords, offeringRecords, prRecords] = await Promise.all([
      this.claims.createQueryBuilder('c')
        .where(waitingFor('c', 'verifiedBy', 'verifiedByStatus', 'approvedBy', 'approvedByStatus'))
        .setParameter('me', username)
        .orderBy('c.updatedAt', 'ASC')
        .getMany(),
      this.allowances.createQueryBuilder('a')
        .where(waitingFor('a', 'tlBy', 'tlByStatus', 'diBy', 'diByStatus'))
        .setParameter('me', username)
        .orderBy('a.updatedAt', 'ASC')
        .getMany(),
      this.charitable.createQueryBuilder('c')
        .where('c.deleted_at IS NULL')
        .andWhere(charitableWaitingFor('c'))
        .setParameter('me', username)
        .orderBy('c.updated_at', 'ASC')
        .getMany(),
      this.giftReceivings.createQueryBuilder('g')
        .where('g.deleted_at IS NULL')
        .andWhere(giftWaitingFor('g'))
        .setParameter('me', username)
        .orderBy('g.updated_at', 'ASC')
        .getMany(),
      this.giftOfferings.createQueryBuilder('o')
        .where('o.deleted_at IS NULL')
        .andWhere(offeringWaitingFor('o'))
        .setParameter('me', username)
        .orderBy('o.updated_at', 'ASC')
        .getMany(),
      this.requisitions.createQueryBuilder('p')
        .where('p.deleted_at IS NULL')
        .andWhere(prWaitingFor('p'))
        .setParameter('me', username)
        .orderBy('p.updated_at', 'ASC')
        .getMany(),
    ]);

    const expenses: PendingItem[] = claims.map((c) => ({
      form: 'expenses',
      id: c.id,
      voucherNo: c.voucherNo,
      claimantName: c.claimantName,
      totalBaht: c.totalBaht,
      currency: c.currency,
      stage: c.status === 'submitted' && c.verifiedBy === username && c.verifiedByStatus === 'pending' ? 'verify' : 'approve',
      submittedAt: c.updatedAt,
    }));
    const allowanceItems: PendingItem[] = allowances.map((a) => ({
      form: 'allowance',
      id: a.id,
      voucherNo: a.voucherNo,
      claimantName: a.claimantName,
      totalBaht: a.totalBaht,
      currency: 'THB',
      stage: a.status === 'submitted' && a.tlBy === username && a.tlByStatus === 'pending' ? 'verify' : 'approve',
      submittedAt: a.updatedAt,
    }));

    const charitableItems: PendingItem[] = charitableRecords.map((c) => ({
      form: 'charitable' as const,
      id: c.id,
      voucherNo: c.voucherNo,
      claimantName: c.requesterName,
      totalBaht: c.valueAmount,
      currency: c.currency,
      stage: this.stageOf(c, username),
      submittedAt: c.updatedAt,
    }));

    const giftItems: PendingItem[] = giftRecords.map((g) => ({
      form: 'gift-receiving' as const,
      id: g.id,
      voucherNo: g.voucherNo,
      claimantName: g.requesterName,
      totalBaht: g.valueAmount,
      currency: 'THB',
      stage: this.giftStage(g, username),
      submittedAt: g.updatedAt,
    }));

    const offeringItems: PendingItem[] = offeringRecords.map((o) => ({
      form: 'gift-offering' as const,
      id: o.id,
      voucherNo: o.voucherNo,
      claimantName: o.requesterName,
      totalBaht: o.valueAmount,
      currency: o.currency,
      stage: this.offeringStage(o, username),
      submittedAt: o.updatedAt,
    }));

    const prItems: PendingItem[] = prRecords.map((p) => ({
      form: 'purchase-requisition' as const,
      id: p.id,
      voucherNo: p.prNo,
      claimantName: p.requestedBy,
      totalBaht: p.grandTotal,
      currency: p.currency,
      stage: this.prStage(p, username),
      submittedAt: p.updatedAt,
    }));

    return {
      total: expenses.length + allowanceItems.length + charitableItems.length + giftItems.length + offeringItems.length + prItems.length,
      expenses: { count: expenses.length, items: expenses.slice(0, ITEM_LIMIT) },
      allowances: { count: allowanceItems.length, items: allowanceItems.slice(0, ITEM_LIMIT) },
      charitable: { count: charitableItems.length, items: charitableItems.slice(0, ITEM_LIMIT) },
      giftReceiving: { count: giftItems.length, items: giftItems.slice(0, ITEM_LIMIT) },
      giftOffering: { count: offeringItems.length, items: offeringItems.slice(0, ITEM_LIMIT) },
      purchaseRequisition: { count: prItems.length, items: prItems.slice(0, ITEM_LIMIT) },
    };
  }

  private prStage(p: PurchaseRequisitionEntity, username: string): ApprovalStage {
    const me = username.toLowerCase();
    const pending = (by: string | null, status: string | null) => by?.toLowerCase() === me && status === 'pending';
    if (pending(p.verifyIsBy, p.verifyIsByStatus) || pending(p.verifyBy, p.verifyByStatus)) return 'verify';
    if (pending(p.ackBy, p.ackByStatus)) return 'acknowledge';
    return 'approve';
  }

  private offeringStage(o: GiftOfferingEntity, username: string): ApprovalStage {
    const me = username.toLowerCase();
    if (o.verifyBy?.toLowerCase() === me && o.verifyByStatus === 'pending') return 'verify';
    if (o.ack1By?.toLowerCase() === me && o.ack1ByStatus === 'pending') return 'acknowledge';
    if (o.approverBy?.toLowerCase() === me && o.approverByStatus === 'pending') return 'approve';
    if (o.approver2By?.toLowerCase() === me && o.approver2ByStatus === 'pending') return 'approve';
    return o.ack2By?.toLowerCase() === me && o.ack2ByStatus === 'pending' ? 'acknowledge' : 'approve';
  }

  private giftStage(g: GiftReceivingEntity, username: string): ApprovalStage {
    const me = username.toLowerCase();
    if (g.verifyBy?.toLowerCase() === me && g.verifyByStatus === 'pending') return 'verify';
    if (g.ack1By?.toLowerCase() === me && g.ack1ByStatus === 'pending') return 'acknowledge';
    if (g.approverBy?.toLowerCase() === me && g.approverByStatus === 'pending') return 'approve';
    return g.ack2By?.toLowerCase() === me && g.ack2ByStatus === 'pending' ? 'acknowledge' : 'approve';
  }

  /** Which kind of action the user owes on a Charitable Contribution request (the first step still pending for them). */
  private stageOf(c: CharitableContributionEntity, username: string): ApprovalStage {
    const me = username.toLowerCase();
    if (c.verifyBy?.toLowerCase() === me && c.verifyByStatus === 'pending') return 'verify';
    if (c.ack1By?.toLowerCase() === me && c.ack1ByStatus === 'pending') return 'acknowledge';
    if (c.approverBy?.toLowerCase() === me && c.approverByStatus === 'pending') return 'approve';
    if (c.approver2By?.toLowerCase() === me && c.approver2ByStatus === 'pending') return 'approve';
    return 'acknowledge';
  }

}
