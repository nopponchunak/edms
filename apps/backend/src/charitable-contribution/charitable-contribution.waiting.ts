import { Brackets } from 'typeorm';

/** Approval steps in the order they must be completed (steps without a named person are skipped). */
export const WORKFLOW = [
  { key: 'verify', by: 'verify_by', status: 'verify_by_status' },
  { key: 'ack1', by: 'ack1_by', status: 'ack1_by_status' },
  { key: 'approver', by: 'approver_by', status: 'approver_by_status' },
  { key: 'approver2', by: 'approver2_by', status: 'approver2_by_status' },
  { key: 'ack2', by: 'ack2_by', status: 'ack2_by_status' },
] as const;

/**
 * Requests whose current step is assigned to `:me`: the request is in flight, this person's step is still pending
 * and every earlier step that has a named person is already approved.
 */
export function charitableWaitingFor(alias: string): Brackets {
  const branches = WORKFLOW.map((step, index) => {
    const earlier = WORKFLOW.slice(0, index).map((s) => `(${alias}.${s.by} IS NULL OR ${alias}.${s.status} = 'approved')`);
    return `(LOWER(${alias}.${step.by}) = LOWER(:me) AND ${alias}.${step.status} = 'pending'${earlier.map((e) => ` AND ${e}`).join('')})`;
  });
  return new Brackets((qb) => qb.where(`${alias}.status IN ('submitted', 'verified')`).andWhere(`(${branches.join(' OR ')})`));
}
