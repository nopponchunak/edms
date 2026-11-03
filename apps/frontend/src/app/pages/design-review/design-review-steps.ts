import type { DesignReview } from './design-review.service';

export type DrStepKey = 'review' | 'respond' | 'tl' | 'tl2' | 'ack';

export interface DrStep {
  key: DrStepKey;
  by: keyof DesignReview;
  status: keyof DesignReview;
  date: keyof DesignReview;
  comment: keyof DesignReview;
  label: string;
  /** Wording on the action button / history. */
  verb: string;
  /** Past tense of the verb. */
  past: string;
  done: string;
}

// Same order the API enforces.
export const DR_STEPS: DrStep[] = [
  { key: 'review', comment: 'reviewComment', by: 'reviewBy', status: 'reviewByStatus', date: 'reviewByDate', label: 'Reviewed By (TL CSA / DL MEP)', verb: 'Review', past: 'Reviewed', done: 'Reviewed by' },
  { key: 'respond', comment: 'respondComment', by: 'respondBy', status: 'respondByStatus', date: 'respondByDate', label: 'Responded By (PE)', verb: 'Respond', past: 'Responded', done: 'Responded by (PE)' },
  { key: 'tl', comment: 'tlComment', by: 'tlBy', status: 'tlByStatus', date: 'tlByDate', label: 'Review Comments And Signatures By (TL CSA / DL MEP)', verb: 'Sign', past: 'Signed', done: 'Signed by' },
  { key: 'tl2', comment: 'tl2Comment', by: 'tl2By', status: 'tl2ByStatus', date: 'tl2ByDate', label: 'Approved By TL (MEP)', verb: 'Approve', past: 'Approved', done: 'Approved by TL' },
  { key: 'ack', comment: 'ackComment', by: 'ackBy', status: 'ackByStatus', date: 'ackByDate', label: 'Acknowledged By (DI)', verb: 'Acknowledge', past: 'Acknowledged', done: 'Acknowledged by (DI)' },
];

/** The step still waiting on someone (the first one with a named person that is not yet approved). */
export function currentDrStep(record: DesignReview): DrStep | null {
  if (record.status !== 'submitted' && record.status !== 'verified') return null;
  return DR_STEPS.find((s) => record[s.by] && record[s.status] !== 'approved') ?? null;
}

/** True when it is the given user's turn to act on the review. */
export function isDrTurnOf(record: DesignReview, username: string | undefined): boolean {
  const step = username ? currentDrStep(record) : null;
  return !!step && (record[step.by] as string).toLowerCase() === username!.toLowerCase();
}
