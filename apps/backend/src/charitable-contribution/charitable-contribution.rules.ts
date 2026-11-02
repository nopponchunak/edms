import { DataSource } from 'typeorm';
import { SaveCharitableContributionDto } from './dto/charitable-contribution.dto';

/** Committee (Master Data) that supplies each approval step. */
export const COMMITTEES = {
  verifyBy: 'ACSC',
  ack1By: 'ACSL',
  approverBy: 'DI/MD',
  approver2By: 'DI/MD',
  ack2By: 'CA',
} as const;

export const STEP_LABELS: Record<keyof typeof COMMITTEES, string> = {
  verifyBy: 'Verify (ACSC)',
  ack1By: 'Acknowledge 1 (ACSL)',
  approverBy: 'Approve (DI/MD)',
  approver2By: 'Approve 2 (DI)',
  ack2By: 'Acknowledge 2 (CA)',
};

export const APPROVAL_THRESHOLD = 20000;
export const MIN_THB_AMOUNT = 2500;
export const VIEW_PERMISSION = 'charitable-contribution.view';

interface Member { username: string; title: string | null; level: string | null }

export const isMd = (m: Pick<Member, 'title' | 'level'>) =>
  m.level?.trim().toUpperCase() === 'MD' || /managing director/i.test(m.title ?? '');
export const isDi = (m: Pick<Member, 'title' | 'level'>) =>
  !isMd(m) && (m.level?.trim().toUpperCase() === 'DI' || /^director$/i.test((m.title ?? '').trim()));

const text = (value?: string | null) => value?.trim() || null;

/** Everything that must hold before a request can leave draft. Returns human readable errors. */
export async function validateForSubmit(
  dataSource: DataSource,
  dto: SaveCharitableContributionDto,
  actor: { username: string },
): Promise<string[]> {
  const errors: string[] = [];
  const isThb = (dto.currency ?? 'THB') === 'THB';
  const longText = (value: string | null | undefined, label: string) => {
    if ((value?.trim().length ?? 0) < 10) errors.push(`${label} must be at least 10 characters.`);
  };
  longText(dto.eventDescription, 'Event Description');
  longText(dto.eventPurpose, 'Event Purpose');
  longText(dto.contributionDescription, 'Description of Contribution / Sponsorship');
  if (!(dto.valueAmount > 0)) errors.push('Value must be greater than 0.');
  else if (isThb && dto.valueAmount < MIN_THB_AMOUNT) errors.push(`Value must be at least ${MIN_THB_AMOUNT.toLocaleString('en-US')} THB.`);

  const picked: Record<keyof typeof COMMITTEES, string | null> = {
    verifyBy: text(dto.verifyBy), ack1By: text(dto.ack1By), approverBy: text(dto.approverBy),
    approver2By: text(dto.approver2By), ack2By: text(dto.ack2By),
  };
  for (const key of ['verifyBy', 'ack1By', 'approverBy', 'ack2By'] as const) {
    if (!picked[key]) errors.push(`${STEP_LABELS[key]} is required.`);
  }

  // Resolve who the requester is (the form may be filed on someone's behalf).
  const requesterRows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [dto.requesterName.trim()],
  );
  const requesterUsers = new Set([actor.username, ...requesterRows.map((r) => r.username)].map((u) => u.toLowerCase()));

  const members = new Map<string, Member | null>();
  for (const key of Object.keys(COMMITTEES) as (keyof typeof COMMITTEES)[]) {
    const username = picked[key];
    if (!username) continue;
    const rows: Member[] = await dataSource.query(
      `SELECT e.username, e.title_name AS title, e.level_name AS level
       FROM committee_members m
       JOIN committees c ON c.id = m.committee_id AND c.deleted_at IS NULL AND LOWER(c.name) = LOWER($1)
       JOIN employees e ON e.id = m.employee_id AND e.deleted_at IS NULL
       WHERE LOWER(e.username) = LOWER($2) LIMIT 1`,
      [COMMITTEES[key], username],
    );
    members.set(key, rows[0] ?? null);
    if (!rows[0]) errors.push(`${STEP_LABELS[key]}: ${username} is not a member of the ${COMMITTEES[key]} committee.`);

    const allowed: { n: number }[] = await dataSource.query(
      `SELECT 1 AS n FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
       WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
      [username, VIEW_PERMISSION],
    );
    if (!allowed.length) errors.push(`${STEP_LABELS[key]}: ${username} has no access to this form.`);

    // Verify / acknowledge steps may be the requester; only the approval steps cannot be self-approved (an MD may).
    if ((key === 'approverBy' || key === 'approver2By') && requesterUsers.has(username.toLowerCase())) {
      const mayApproveSelf = key === 'approverBy' && rows[0] && isMd(rows[0]);
      if (!mayApproveSelf) errors.push(`${STEP_LABELS[key]}: you cannot approve your own request unless you are an MD.`);
    }
  }

  const approver = members.get('approverBy');
  const approver2 = members.get('approver2By');
  if (picked.approver2By && picked.approver2By.toLowerCase() === picked.approverBy?.toLowerCase()) {
    errors.push('Approve 2 must be a different person from Approve.');
  }
  if (approver2 && !isDi(approver2)) errors.push('Approve 2 must be a DI.');

  if (isThb && approver) {
    if (!(isDi(approver) || isMd(approver))) errors.push('Approve must be a DI or MD.');
    if (dto.valueAmount > APPROVAL_THRESHOLD) {
      if (isDi(approver) && !picked.approver2By) {
        errors.push(`Requests above ${APPROVAL_THRESHOLD.toLocaleString('en-US')} THB need an MD, or two DIs (Approve 2 is required).`);
      }
    } else if (picked.approver2By) {
      errors.push(`Approve 2 is only used for requests above ${APPROVAL_THRESHOLD.toLocaleString('en-US')} THB.`);
    }
  }
  return errors;
}

/** Usernames that count as "the requester" for a stored request (the creator and anyone with the requester's display name). */
export async function requesterUsernames(
  dataSource: DataSource,
  record: { requesterName: string; createBy: string | null },
): Promise<Set<string>> {
  const rows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [record.requesterName],
  );
  return new Set([record.createBy, ...rows.map((r) => r.username)].filter((u): u is string => !!u).map((u) => u.toLowerCase()));
}

/** Whether the person is an MD (read from their HRIS title/level). */
export async function isMdUser(dataSource: DataSource, username: string): Promise<boolean> {
  const rows: { title: string | null; level: string | null }[] = await dataSource.query(
    'SELECT title_name AS title, level_name AS level FROM employees WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL LIMIT 1', [username],
  );
  return !!rows[0] && isMd(rows[0]);
}
