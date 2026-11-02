import type { CharitableContribution } from './charitable-contribution.service';

export type StepKey = 'verify' | 'ack1' | 'approver' | 'approver2' | 'ack2';

export interface Step {
  key: StepKey;
  by: keyof CharitableContribution;
  status: keyof CharitableContribution;
  date: keyof CharitableContribution;
  comment: keyof CharitableContribution;
  label: string;
  /** Wording on the action button / history. */
  verb: string;
  done: string;
}

// Same order the API enforces; a step without a named person is skipped.
export const STEPS: Step[] = [
  { key: 'verify', comment: 'verifyComment', by: 'verifyBy', status: 'verifyByStatus', date: 'verifyByDate', label: 'Verify (ACSC)', verb: 'Verify', done: 'Verified by (ACSC)' },
  { key: 'ack1', comment: 'ack1Comment', by: 'ack1By', status: 'ack1ByStatus', date: 'ack1ByDate', label: 'Acknowledge 1 (ACSL)', verb: 'Acknowledge', done: 'Acknowledged by (ACSL)' },
  { key: 'approver', comment: 'approverComment', by: 'approverBy', status: 'approverByStatus', date: 'approverByDate', label: 'Approve (DI/MD)', verb: 'Approve', done: 'Approved by' },
  { key: 'approver2', comment: 'approver2Comment', by: 'approver2By', status: 'approver2ByStatus', date: 'approver2ByDate', label: 'Approve 2 (DI)', verb: 'Approve', done: 'Approved by (2nd DI)' },
  { key: 'ack2', comment: 'ack2Comment', by: 'ack2By', status: 'ack2ByStatus', date: 'ack2ByDate', label: 'Acknowledge 2 (CA)', verb: 'Acknowledge', done: 'Acknowledged by (CA)' },
];

/** The step still waiting on someone (the first one with a named person that is not yet approved). */
export function currentStep(record: CharitableContribution): Step | null {
  if (record.status !== 'submitted' && record.status !== 'verified') return null;
  return STEPS.find((s) => record[s.by] && record[s.status] !== 'approved') ?? null;
}

/** True when it is the given user's turn to act on the request. */
export function isTurnOf(record: CharitableContribution, username: string | undefined): boolean {
  const step = username ? currentStep(record) : null;
  return !!step && (record[step.by] as string).toLowerCase() === username!.toLowerCase();
}
