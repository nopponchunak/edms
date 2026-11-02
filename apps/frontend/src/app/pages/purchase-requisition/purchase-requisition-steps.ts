import type { PurchaseRequisition } from './purchase-requisition.service';

export type PrStepKey = 'verifyIs' | 'verify' | 'approver' | 'approver2' | 'ack' | 'action';

export interface PrStep {
  key: PrStepKey;
  by: keyof PurchaseRequisition;
  status: keyof PurchaseRequisition;
  date: keyof PurchaseRequisition;
  comment: keyof PurchaseRequisition;
  label: string;
  /** Wording on the action button / history. */
  verb: string;
  /** Past tense of the verb. */
  past: string;
  done: string;
}

// Same order the API enforces.
export const PR_STEPS: PrStep[] = [
  { key: 'verifyIs', comment: 'verifyIsComment', by: 'verifyIsBy', status: 'verifyIsByStatus', date: 'verifyIsByDate', label: 'Verified By (IS)', verb: 'Verify', past: 'Verified', done: 'Verified by (IS)' },
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate', label: 'Verified By (MD/DI/AD/TL)', verb: 'Verify', past: 'Verified', done: 'Verified by' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate', label: 'Approved By (MD/DI)', verb: 'Approve', past: 'Approved', done: 'Approved by' },
  { key: 'approver2', comment: 'approver2Comment', by: 'approver2By', status: 'approver2ByStatus', date: 'approver2ByDate', label: 'Approved By 2 (MD/DI)', verb: 'Approve', past: 'Approved', done: 'Approved by (2nd)' },
  { key: 'ack', comment: 'ackComment', by: 'ackBy', status: 'ackByStatus', date: 'ackByDate', label: 'Acknowledged (CA)', verb: 'Acknowledge', past: 'Acknowledged', done: 'Acknowledged by (CA)' },
  { key: 'action', comment: 'actionComment', by: 'actionBy', status: 'actionByStatus', date: 'actionByDate', label: 'Action By (ADM)', verb: 'Complete', past: 'Completed', done: 'Action by (ADM)' },
];

/** The step still waiting on someone (the first one with a named person that is not yet approved). */
export function currentPrStep(record: PurchaseRequisition): PrStep | null {
  if (record.status !== 'submitted' && record.status !== 'verified') return null;
  return PR_STEPS.find((s) => record[s.by] && record[s.status] !== 'approved') ?? null;
}

/** True when it is the given user's turn to act on the request. */
export function isPrTurnOf(record: PurchaseRequisition, username: string | undefined): boolean {
  const step = username ? currentPrStep(record) : null;
  return !!step && (record[step.by] as string).toLowerCase() === username!.toLowerCase();
}
