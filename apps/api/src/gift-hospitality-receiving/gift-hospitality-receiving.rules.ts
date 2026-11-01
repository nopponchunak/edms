import { Brackets, DataSource } from 'typeorm';
import { SaveGiftReceivingDto } from './dto/gift-hospitality-receiving.dto';

/** Committee (Master Data) that supplies each approval step. */
export const GIFT_COMMITTEES = {
  verifyBy: 'ACSC',
  ack1By: 'ACSL',
  approverBy: 'TL/DI/MD',
  ack2By: 'CA',
} as const;

export const GIFT_STEP_LABELS: Record<keyof typeof GIFT_COMMITTEES, string> = {
  verifyBy: 'Verify (ACSC)',
  ack1By: 'Acknowledge 1 (ACSL)',
  approverBy: 'Approve (TL/DI/MD)',
  ack2By: 'Acknowledge 2 (CA)',
};

/** Receiving a gift or hospitality worth this much (THB, including VAT) or more must be requested. */
export const MIN_GIFT_VALUE = 3000;
export const GIFT_VIEW_PERMISSION = 'gift-hospitality-receiving.view';
export const GIFT_VOUCHER_PREFIX = 'GHR';

/** Approval steps in the order they must be completed. */
export const GIFT_WORKFLOW = [
  { key: 'verify', by: 'verify_by', status: 'verify_by_status' },
  { key: 'ack1', by: 'ack1_by', status: 'ack1_by_status' },
  { key: 'approver', by: 'approver_by', status: 'approver_by_status' },
  { key: 'ack2', by: 'ack2_by', status: 'ack2_by_status' },
] as const;

/** Requests whose current step is assigned to `:me` (in flight, pending for them, every earlier step approved). */
export function giftWaitingFor(alias: string): Brackets {
  const branches = GIFT_WORKFLOW.map((step, index) => {
    const earlier = GIFT_WORKFLOW.slice(0, index).map((s) => `(${alias}.${s.by} IS NULL OR ${alias}.${s.status} = 'approved')`);
    return `(LOWER(${alias}.${step.by}) = LOWER(:me) AND ${alias}.${step.status} = 'pending'${earlier.map((e) => ` AND ${e}`).join('')})`;
  });
  return new Brackets((qb) => qb.where(`${alias}.status IN ('submitted', 'verified')`).andWhere(`(${branches.join(' OR ')})`));
}

const text = (value?: string | null) => value?.trim() || null;

/** Usernames that count as "the requester" for a stored request (the creator and anyone with the requester's display name). */
export async function giftRequesterUsernames(
  dataSource: DataSource,
  record: { requesterName: string; createBy: string | null },
): Promise<Set<string>> {
  const rows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [record.requesterName],
  );
  return new Set([record.createBy, ...rows.map((r) => r.username)].filter((u): u is string => !!u).map((u) => u.toLowerCase()));
}

/** Everything that must hold before a request can leave draft. Returns human readable errors. */
export async function validateGiftForSubmit(
  dataSource: DataSource,
  dto: SaveGiftReceivingDto,
  actor: { username: string },
): Promise<string[]> {
  const errors: string[] = [];
  const longText = (value: string | null | undefined, label: string) => {
    if ((value?.trim().length ?? 0) < 10) errors.push(`${label} must be at least 10 characters.`);
  };
  longText(dto.description, 'Description of Gift/Hospitality');
  longText(dto.purpose, 'Purpose of receiving');
  if (!(dto.valueAmount >= MIN_GIFT_VALUE)) {
    errors.push(`Value must be at least ${MIN_GIFT_VALUE.toLocaleString('en-US')} THB (including VAT).`);
  }

  const picked: Record<keyof typeof GIFT_COMMITTEES, string | null> = {
    verifyBy: text(dto.verifyBy), ack1By: text(dto.ack1By), approverBy: text(dto.approverBy), ack2By: text(dto.ack2By),
  };
  for (const key of Object.keys(GIFT_COMMITTEES) as (keyof typeof GIFT_COMMITTEES)[]) {
    if (!picked[key]) errors.push(`${GIFT_STEP_LABELS[key]} is required.`);
  }

  // The form may be filed on someone's behalf: the requester is whoever has that display name, plus the person filing.
  const requesterRows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [dto.requesterName.trim()],
  );
  const requesterUsers = new Set([actor.username, ...requesterRows.map((r) => r.username)].map((u) => u.toLowerCase()));

  for (const key of Object.keys(GIFT_COMMITTEES) as (keyof typeof GIFT_COMMITTEES)[]) {
    const username = picked[key];
    if (!username) continue;
    const member: { n: number }[] = await dataSource.query(
      `SELECT 1 AS n
       FROM committee_members m
       JOIN committees c ON c.id = m.committee_id AND c.deleted_at IS NULL AND LOWER(c.name) = LOWER($1)
       JOIN employees e ON e.id = m.employee_id AND e.deleted_at IS NULL
       WHERE LOWER(e.username) = LOWER($2) LIMIT 1`,
      [GIFT_COMMITTEES[key], username],
    );
    if (!member.length) errors.push(`${GIFT_STEP_LABELS[key]}: ${username} is not a member of the ${GIFT_COMMITTEES[key]} committee.`);

    const allowed: { n: number }[] = await dataSource.query(
      `SELECT 1 AS n FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
       WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
      [username, GIFT_VIEW_PERMISSION],
    );
    if (!allowed.length) errors.push(`${GIFT_STEP_LABELS[key]}: ${username} has no access to this form.`);

    // Verifying or acknowledging one's own request is fine; approving it is not (no exception for anyone).
    if (key === 'approverBy' && requesterUsers.has(username.toLowerCase())) {
      errors.push(`${GIFT_STEP_LABELS[key]}: you cannot approve your own request.`);
    }
  }
  return errors;
}
