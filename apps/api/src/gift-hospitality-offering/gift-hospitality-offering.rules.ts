import { Brackets, DataSource } from 'typeorm';
import { isDi, isMd } from '../charitable-contribution/charitable-contribution.rules';
import { SaveGiftOfferingDto } from './dto/gift-hospitality-offering.dto';

/** Committee (Master Data) that supplies each approval step. */
export const OFFERING_COMMITTEES = {
  verifyBy: 'ACSC',
  ack1By: 'ACSL',
  approverBy: 'DI/MD',
  approver2By: 'DI/MD',
  ack2By: 'CA',
} as const;

export const OFFERING_STEP_LABELS: Record<keyof typeof OFFERING_COMMITTEES, string> = {
  verifyBy: 'Verify (ACSC)',
  ack1By: 'Acknowledge 1 (ACSL)',
  approverBy: 'Approve (DI/MD)',
  approver2By: 'Approve 2 (DI)',
  ack2By: 'Acknowledge 2 (CA)',
};

/**
 * Amount tiers for THB requests (including VAT). Requests start above 5,000.
 *   > 5,000  to <= 10,000: requested by EE or above, approved by 1 DI or MD
 *   > 10,000 to <= 30,000: requested by DI or MD,    approved by 1 DI or MD
 *   > 30,000:              requested by MD,          approved by an MD and a DI together
 */
export const OFFERING_MIN_THB = 5000;
export const OFFERING_TIER_2 = 10000;
export const OFFERING_TIER_3 = 30000;
export const OFFERING_VIEW_PERMISSION = 'gift-hospitality-offering.view';
export const OFFERING_VOUCHER_PREFIX = 'GHO';

/** Approval steps in the order they must be completed (a step without a named person is skipped). */
export const OFFERING_WORKFLOW = [
  { key: 'verify', by: 'verify_by', status: 'verify_by_status' },
  { key: 'ack1', by: 'ack1_by', status: 'ack1_by_status' },
  { key: 'approver', by: 'approver_by', status: 'approver_by_status' },
  { key: 'approver2', by: 'approver2_by', status: 'approver2_by_status' },
  { key: 'ack2', by: 'ack2_by', status: 'ack2_by_status' },
] as const;

/** Requests whose current step is assigned to `:me` (in flight, pending for them, every earlier step approved). */
export function offeringWaitingFor(alias: string): Brackets {
  const branches = OFFERING_WORKFLOW.map((step, index) => {
    const earlier = OFFERING_WORKFLOW.slice(0, index).map((s) => `(${alias}.${s.by} IS NULL OR ${alias}.${s.status} = 'approved')`);
    return `(LOWER(${alias}.${step.by}) = LOWER(:me) AND ${alias}.${step.status} = 'pending'${earlier.map((e) => ` AND ${e}`).join('')})`;
  });
  return new Brackets((qb) => qb.where(`${alias}.status IN ('submitted', 'verified')`).andWhere(`(${branches.join(' OR ')})`));
}

const text = (value?: string | null) => value?.trim() || null;

interface Person { title: string | null; level: string | null }

/** EE or above: the level starts with EE, AD, DI or MD (EE1, EE2-TL, AD-TL, AD1, DI, MD ...), or the person is a DI / MD by title. */
export const isEeOrAbove = (p: Person) =>
  /^(EE|AD|DI|MD)(?:$|[^A-Z])/i.test((p.level ?? '').trim()) || isDi(p) || isMd(p);

/** Usernames that count as "the requester" for a stored request (the creator and anyone with the requester's display name). */
export async function offeringRequesterUsernames(
  dataSource: DataSource,
  record: { requesterName: string; createBy: string | null },
): Promise<Set<string>> {
  const rows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [record.requesterName],
  );
  return new Set([record.createBy, ...rows.map((r) => r.username)].filter((u): u is string => !!u).map((u) => u.toLowerCase()));
}

/** Everything that must hold before a request can leave draft. Returns human readable errors. */
export async function validateOfferingForSubmit(
  dataSource: DataSource,
  dto: SaveGiftOfferingDto,
  actor: { username: string },
): Promise<string[]> {
  const errors: string[] = [];
  const isThb = (dto.currency ?? 'THB') === 'THB';
  const amount = dto.valueAmount;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const longText = (value: string | null | undefined, label: string) => {
    if ((value?.trim().length ?? 0) < 10) errors.push(`${label} must be at least 10 characters.`);
  };
  longText(dto.description, 'Description of Gift/Hospitality');
  longText(dto.purpose, 'Purpose of offering');
  if (!(amount > 0)) errors.push('Value must be greater than 0.');
  else if (isThb && amount <= OFFERING_MIN_THB) errors.push(`Offering requests start above ${fmt(OFFERING_MIN_THB)} THB.`);

  const picked: Record<keyof typeof OFFERING_COMMITTEES, string | null> = {
    verifyBy: text(dto.verifyBy), ack1By: text(dto.ack1By), approverBy: text(dto.approverBy), approver2By: text(dto.approver2By), ack2By: text(dto.ack2By),
  };
  for (const key of ['verifyBy', 'ack1By', 'approverBy', 'ack2By'] as const) {
    if (!picked[key]) errors.push(`${OFFERING_STEP_LABELS[key]} is required.`);
  }

  // The form may be filed on someone's behalf: the requester is whoever has that display name, plus the person filing.
  const requesterRows: { username: string; title: string | null; level: string | null }[] = await dataSource.query(
    `SELECT u.username, e.title_name AS title, e.level_name AS level
     FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.display_name = $1 AND u.deleted_at IS NULL`, [dto.requesterName.trim()],
  );
  const requesterUsers = new Set([actor.username, ...requesterRows.map((r) => r.username)].map((u) => u.toLowerCase()));

  // Who may request, by amount (THB only).
  if (isThb && amount > OFFERING_MIN_THB) {
    const meets = (test: (p: Person) => boolean) => requesterRows.some((r) => test(r));
    if (amount > OFFERING_TIER_3) {
      if (!meets(isMd)) errors.push(`Requests above ${fmt(OFFERING_TIER_3)} THB can only be submitted by an MD.`);
    } else if (amount > OFFERING_TIER_2) {
      if (!meets((p) => isDi(p) || isMd(p))) errors.push(`Requests above ${fmt(OFFERING_TIER_2)} THB can only be submitted by a DI or MD.`);
    } else if (!meets(isEeOrAbove)) {
      errors.push('Requests of this amount can only be submitted by EE level or above.');
    }
  }

  const members = new Map<string, Person | null>();
  for (const key of Object.keys(OFFERING_COMMITTEES) as (keyof typeof OFFERING_COMMITTEES)[]) {
    const username = picked[key];
    if (!username) continue;
    const rows: Person[] = await dataSource.query(
      `SELECT e.title_name AS title, e.level_name AS level
       FROM committee_members m
       JOIN committees c ON c.id = m.committee_id AND c.deleted_at IS NULL AND LOWER(c.name) = LOWER($1)
       JOIN employees e ON e.id = m.employee_id AND e.deleted_at IS NULL
       WHERE LOWER(e.username) = LOWER($2) LIMIT 1`,
      [OFFERING_COMMITTEES[key], username],
    );
    members.set(key, rows[0] ?? null);
    if (!rows[0]) errors.push(`${OFFERING_STEP_LABELS[key]}: ${username} is not a member of the ${OFFERING_COMMITTEES[key]} committee.`);

    const allowed: { n: number }[] = await dataSource.query(
      `SELECT 1 AS n FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
       WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
      [username, OFFERING_VIEW_PERMISSION],
    );
    if (!allowed.length) errors.push(`${OFFERING_STEP_LABELS[key]}: ${username} has no access to this form.`);

    // Verifying or acknowledging one's own request is fine; approving it is not (no exception for anyone).
    if ((key === 'approverBy' || key === 'approver2By') && requesterUsers.has(username.toLowerCase())) {
      errors.push(`${OFFERING_STEP_LABELS[key]}: you cannot approve your own request.`);
    }
  }

  const approver = members.get('approverBy');
  const approver2 = members.get('approver2By');
  if (picked.approver2By && picked.approver2By.toLowerCase() === picked.approverBy?.toLowerCase()) {
    errors.push('Approve 2 must be a different person from Approve.');
  }
  if (approver2 && !isDi(approver2)) errors.push('Approve 2 must be a DI.');
  if (approver && !(isDi(approver) || isMd(approver))) errors.push('Approve must be a DI or MD.');

  if (isThb && amount > OFFERING_MIN_THB) {
    if (amount > OFFERING_TIER_3) {
      // An MD and a DI sign together.
      if (approver && !isMd(approver)) errors.push(`Requests above ${fmt(OFFERING_TIER_3)} THB need an MD as the first approver.`);
      if (!picked.approver2By) errors.push(`Requests above ${fmt(OFFERING_TIER_3)} THB also need a DI as the second approver (Approve 2).`);
    } else if (picked.approver2By) {
      errors.push(`Approve 2 is only used for requests above ${fmt(OFFERING_TIER_3)} THB.`);
    }
  }
  return errors;
}
