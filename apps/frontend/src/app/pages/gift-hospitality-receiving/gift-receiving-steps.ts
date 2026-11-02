import type { GiftReceiving } from './gift-receiving.service';

export type GiftStepKey = 'verify' | 'ack1' | 'approver' | 'ack2';

export interface GiftStep {
  key: GiftStepKey;
  by: keyof GiftReceiving;
  status: keyof GiftReceiving;
  date: keyof GiftReceiving;
  comment: keyof GiftReceiving;
  label: string;
  /** Wording on the action button / history. */
  verb: string;
  done: string;
}

// Same order the API enforces.
export const GIFT_STEPS: GiftStep[] = [
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate', label: 'Verify (ACSC)', verb: 'Verify', done: 'Verified by (ACSC)' },
  { key: 'ack1', comment: 'ack1Comment', by: 'ack1By', status: 'ack1ByStatus', date: 'ack1ByDate', label: 'Acknowledge 1 (ACSL)', verb: 'Acknowledge', done: 'Acknowledged by (ACSL)' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate', label: 'Approve (TL/DI/MD)', verb: 'Approve', done: 'Approved by' },
  { key: 'ack2', comment: 'ack2Comment', by: 'ack2By', status: 'ack2ByStatus', date: 'ack2ByDate', label: 'Acknowledge 2 (CA)', verb: 'Acknowledge', done: 'Acknowledged by (CA)' },
];

/** The step still waiting on someone (the first one with a named person that is not yet approved). */
export function currentGiftStep(record: GiftReceiving): GiftStep | null {
  if (record.status !== 'submitted' && record.status !== 'verified') return null;
  return GIFT_STEPS.find((s) => record[s.by] && record[s.status] !== 'approved') ?? null;
}

/** True when it is the given user's turn to act on the request. */
export function isGiftTurnOf(record: GiftReceiving, username: string | undefined): boolean {
  const step = username ? currentGiftStep(record) : null;
  return !!step && (record[step.by] as string).toLowerCase() === username!.toLowerCase();
}
