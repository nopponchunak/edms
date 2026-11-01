import { Brackets } from 'typeorm';

export function waitingFor(alias: string, verifier: string, verifierStatus: string, approver: string, approverStatus: string): Brackets {
  return new Brackets((qb) => qb
    .where(`${alias}.status = 'submitted' AND ${alias}.${verifier} = :me AND ${alias}.${verifierStatus} = 'pending'`)
    .orWhere(
      `(${alias}.status = 'verified' OR (${alias}.status = 'submitted' AND ${alias}.${verifier} IS NULL))`
      + ` AND ${alias}.${approver} = :me AND ${alias}.${approverStatus} = 'pending'`,
    ));
}
