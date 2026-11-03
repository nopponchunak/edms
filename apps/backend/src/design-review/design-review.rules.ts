import { Brackets, DataSource } from 'typeorm';
import { SaveDesignReviewDto } from './dto/design-review.dto';
import { DESIGN_REVIEW_DISCIPLINES, DESIGN_REVIEW_FORMS } from './design-review.config';

export const DESIGN_REVIEW_VIEW_PERMISSION = 'design-review.view';

export type DrStepKey = 'review' | 'respond' | 'tl' | 'tl2' | 'ack';

/** Today every sign-off can be picked from all active users who can open the form (committees / roles come later). */
export const DR_STEP_LABELS: Record<DrStepKey, string> = {
  review: 'Reviewed By (TL CSA / DL MEP)',
  respond: 'Responded By (PE)',
  tl: 'Review Comments And Signatures By (TL CSA / DL MEP)',
  tl2: 'Approved By TL (MEP)',
  ack: 'Acknowledged By (DI)',
};

/** Sign-offs in the order they must be completed. */
export const DR_WORKFLOW = [
  { key: 'review', by: 'review_by', status: 'review_by_status' },
  { key: 'respond', by: 'respond_by', status: 'respond_by_status' },
  { key: 'tl', by: 'tl_by', status: 'tl_by_status' },
  { key: 'tl2', by: 'tl2_by', status: 'tl2_by_status' },
  { key: 'ack', by: 'ack_by', status: 'ack_by_status' },
] as const;

/** Reviews whose current step is assigned to `:me` (in flight, pending for them, every earlier step approved). */
export function drWaitingFor(alias: string): Brackets {
  const branches = DR_WORKFLOW.map((step, index) => {
    const earlier = DR_WORKFLOW.slice(0, index).map((s) => `(${alias}.${s.by} IS NULL OR ${alias}.${s.status} = 'approved')`);
    return `(LOWER(${alias}.${step.by}) = LOWER(:me) AND ${alias}.${step.status} = 'pending'${earlier.map((e) => ` AND ${e}`).join('')})`;
  });
  return new Brackets((qb) => qb.where(`${alias}.status IN ('submitted', 'verified')`).andWhere(`(${branches.join(' OR ')})`));
}

const text = (value?: string | null) => value?.trim() || null;

/** Usernames that count as "the preparer" of a stored review (the creator and anyone with the preparer's display name). */
export async function drPreparerUsernames(
  dataSource: DataSource,
  record: { preparedBy: string; createBy: string | null },
): Promise<Set<string>> {
  const rows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [record.preparedBy],
  );
  return new Set([record.createBy, ...rows.map((r) => r.username)].filter((u): u is string => !!u).map((u) => u.toLowerCase()));
}

/** Everything that must hold before a review can leave draft. Returns human readable errors. */
export async function validateDesignReviewForSubmit(dataSource: DataSource, dto: SaveDesignReviewDto): Promise<string[]> {
  const errors: string[] = [];
  const config = DESIGN_REVIEW_FORMS[dto.formType ?? 'mtdd01'];

  if (!dto.projectId) errors.push('Project is required.');
  else {
    const rows: unknown[] = await dataSource.query(`SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL`, [dto.projectId]);
    if (!rows.length) errors.push('The selected project no longer exists.');
  }
  if (!dto.preparedBy?.trim()) errors.push('Prepared By is required.');
  if (!dto.discipline || !DESIGN_REVIEW_DISCIPLINES.includes(dto.discipline)) errors.push('Discipline is required.');
  else if (dto.discipline === 'Other' && !text(dto.disciplineOther)) errors.push('Specify the other discipline.');

  const documents = (dto.documentTypes ?? []).filter((d) => config.documentTypes.includes(d));
  if (!documents.length) errors.push('Select at least one document reviewed.');
  if (documents.includes('Other') && !text(dto.documentTypesOther)) errors.push('Specify the other document type.');

  const answered = new Map((dto.checklist ?? []).map((c) => [c.id, c.answer]));
  for (const item of config.checklist) {
    if (!answered.get(item.id)) errors.push(`Checklist item ${item.id} needs an answer (Yes / No / N/A).`);
  }
  if (dto.actionsTaken === true && !text(dto.actionNote)) errors.push('Add a note for the recommended actions that have been taken.');
  if ((dto.attachments?.length ?? 0) > 5) errors.push('Attach at most 5 files.');

  const picked: Record<DrStepKey, string | null> = {
    review: text(dto.reviewBy), respond: text(dto.respondBy), tl: text(dto.tlBy), tl2: text(dto.tl2By), ack: text(dto.ackBy),
  };
  for (const key of Object.keys(picked) as DrStepKey[]) {
    const username = picked[key];
    if (!username) { errors.push(`${DR_STEP_LABELS[key]} is required.`); continue; }
    const allowed: unknown[] = await dataSource.query(
      `SELECT 1 FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
       WHERE LOWER(u.username) = LOWER($1) AND u.status = 'active' AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
      [username, DESIGN_REVIEW_VIEW_PERMISSION],
    );
    if (!allowed.length) errors.push(`${DR_STEP_LABELS[key]}: ${username} is not an active user with access to this form.`);
  }
  return errors;
}
