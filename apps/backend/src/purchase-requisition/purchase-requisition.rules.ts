import { Brackets, DataSource } from 'typeorm';
import { SavePurchaseRequisitionDto } from './dto/purchase-requisition.dto';
import { PR_ROLE_LABELS, PR_ROLE_SQL, PrRoleKind } from './purchase-requisition.roles';

export const PR_VIEW_PERMISSION = 'purchase-requisition.view';
export const PR_VOUCHER_PREFIX = 'PR';
/** Above this grand total (in the chosen currency) a second approver is required. */
export const PR_SECOND_APPROVER_ABOVE = 50000;
export const PR_VAT_RATE = 0.07;
export const PR_DEFAULT_PAYMENT_TERM =
  'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';

export type PrStepKey = 'verifyIs' | 'verify' | 'approver' | 'approver2' | 'ack' | 'action';

/** Where each step's person comes from: a committee (Master Data) or a Title / Level role. */
export const PR_SOURCES: Record<PrStepKey, { committee?: string; role?: PrRoleKind }> = {
  verifyIs: { role: 'it-manager' },
  verify: { role: 'verifier' },
  approver: { committee: 'DI/MD' },
  approver2: { committee: 'DI/MD' },
  ack: { committee: 'CA' },
  action: { role: 'adm' },
};

export const PR_STEP_LABELS: Record<PrStepKey, string> = {
  verifyIs: 'Verified By (IS)',
  verify: 'Verified By (MD/DI/AD/TL)',
  approver: 'Approved By (MD/DI)',
  approver2: 'Approved By 2 (MD/DI)',
  ack: 'Acknowledged (CA)',
  action: 'Action By (ADM)',
};

/** Approval steps in the order they must be completed (a step without a named person is skipped). */
export const PR_WORKFLOW = [
  { key: 'verifyIs', by: 'verify_is_by', status: 'verify_is_by_status' },
  { key: 'verify', by: 'verify_by', status: 'verify_by_status' },
  { key: 'approver', by: 'approver_by', status: 'approver_by_status' },
  { key: 'approver2', by: 'approver2_by', status: 'approver2_by_status' },
  { key: 'ack', by: 'ack_by', status: 'ack_by_status' },
  { key: 'action', by: 'action_by', status: 'action_by_status' },
] as const;

/** Requests whose current step is assigned to `:me` (in flight, pending for them, every earlier step approved). */
export function prWaitingFor(alias: string): Brackets {
  const branches = PR_WORKFLOW.map((step, index) => {
    const earlier = PR_WORKFLOW.slice(0, index).map((s) => `(${alias}.${s.by} IS NULL OR ${alias}.${s.status} = 'approved')`);
    return `(LOWER(${alias}.${step.by}) = LOWER(:me) AND ${alias}.${step.status} = 'pending'${earlier.map((e) => ` AND ${e}`).join('')})`;
  });
  return new Brackets((qb) => qb.where(`${alias}.status IN ('submitted', 'verified')`).andWhere(`(${branches.join(' OR ')})`));
}

const text = (value?: string | null) => value?.trim() || null;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Item rows with their amounts recomputed, and the totals the form shows (discount comes off before VAT). */
export function computePrTotals(dto: Pick<SavePurchaseRequisitionDto, 'items' | 'discount' | 'vat'>) {
  const items = (dto.items ?? []).map((row) => ({
    item: row.item?.trim() ?? '',
    description: row.description?.trim() ?? '',
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    amount: round(row.quantity * row.unitPrice),
    needAsset: row.needAsset ?? false,
  }));
  const itemsTotal = round(items.reduce((sum, row) => sum + row.amount, 0));
  const discount = Math.max(0, round(dto.discount ?? 0));
  const subTotal = round(Math.max(0, itemsTotal - discount));
  const vatValue = dto.vat ? round(subTotal * PR_VAT_RATE) : 0;
  return { items, discount, subTotal, vatValue, grandTotal: round(subTotal + vatValue) };
}

/** Usernames that count as "the requester" for a stored request (the creator and anyone with the requester's display name). */
export async function prRequesterUsernames(
  dataSource: DataSource,
  record: { requestedBy: string; createBy: string | null },
): Promise<Set<string>> {
  const rows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [record.requestedBy],
  );
  return new Set([record.createBy, ...rows.map((r) => r.username)].filter((u): u is string => !!u).map((u) => u.toLowerCase()));
}

/** Everything that must hold before a request can leave draft. Returns human readable errors. */
export async function validatePrForSubmit(
  dataSource: DataSource,
  dto: SavePurchaseRequisitionDto,
  actor: { username: string },
): Promise<string[]> {
  const errors: string[] = [];
  if ((dto.subject?.trim().length ?? 0) < 6) errors.push('Subject must be more than 5 characters.');
  if ((dto.reasonsForPurchase?.trim().length ?? 0) < 10) errors.push('Reasons for Purchase must be at least 10 characters.');
  if (!dto.items?.length) errors.push('Add at least one item.');
  (dto.items ?? []).forEach((row, i) => {
    if (!row.description?.trim()) errors.push(`Item ${i + 1}: description is required.`);
    if (!(row.quantity > 0)) errors.push(`Item ${i + 1}: quantity must be greater than 0.`);
  });

  const totals = computePrTotals(dto);
  const needSecond = totals.grandTotal > PR_SECOND_APPROVER_ABOVE;
  const picked: Record<PrStepKey, string | null> = {
    verifyIs: dto.notItEquipment ? null : text(dto.verifyIsBy),
    verify: text(dto.verifyBy), approver: text(dto.approverBy), approver2: text(dto.approver2By),
    ack: text(dto.ackBy), action: text(dto.actionBy),
  };
  for (const key of ['verify', 'approver', 'ack', 'action'] as const) {
    if (!picked[key]) errors.push(`${PR_STEP_LABELS[key]} is required.`);
  }
  if (!dto.notItEquipment && !picked.verifyIs) errors.push(`${PR_STEP_LABELS.verifyIs} is required, or tick "No IT equipment / software".`);
  if (needSecond && !picked.approver2) errors.push(`${PR_STEP_LABELS.approver2} is required when the grand total is over ${PR_SECOND_APPROVER_ABOVE.toLocaleString('en-US')}.`);
  if (!needSecond && picked.approver2) errors.push(`${PR_STEP_LABELS.approver2} is only used when the grand total is over ${PR_SECOND_APPROVER_ABOVE.toLocaleString('en-US')}.`);
  if (picked.approver2 && picked.approver2.toLowerCase() === picked.approver?.toLowerCase()) {
    errors.push('Approved By 2 must be a different person from Approved By.');
  }

  const requesterRows: { username: string }[] = await dataSource.query(
    'SELECT username FROM users WHERE display_name = $1 AND deleted_at IS NULL', [dto.requestedBy.trim()],
  );
  const requesterUsers = new Set([actor.username, ...requesterRows.map((r) => r.username)].map((u) => u.toLowerCase()));

  for (const key of Object.keys(PR_SOURCES) as PrStepKey[]) {
    const username = picked[key];
    if (!username) continue;
    const source = PR_SOURCES[key];
    const member: unknown[] = source.committee
      ? await dataSource.query(
        `SELECT 1 FROM committee_members m
         JOIN committees c ON c.id = m.committee_id AND c.deleted_at IS NULL AND LOWER(c.name) = LOWER($1)
         JOIN employees e ON e.id = m.employee_id AND e.deleted_at IS NULL
         WHERE LOWER(e.username) = LOWER($2) LIMIT 1`,
        [source.committee, username],
      )
      : await dataSource.query(
        `SELECT 1 FROM employees e WHERE e.deleted_at IS NULL AND LOWER(e.username) = LOWER($1) AND ${PR_ROLE_SQL[source.role!]} LIMIT 1`,
        [username],
      );
    if (!member.length) {
      const where = source.committee ? `a member of the ${source.committee} committee` : `a ${PR_ROLE_LABELS[source.role!]}`;
      errors.push(`${PR_STEP_LABELS[key]}: ${username} is not ${where}.`);
    }

    const allowed: unknown[] = await dataSource.query(
      `SELECT 1 FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
       WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
      [username, PR_VIEW_PERMISSION],
    );
    if (!allowed.length) errors.push(`${PR_STEP_LABELS[key]}: ${username} has no access to this form.`);

    // Verifying or acknowledging one's own request is fine; approving it is not.
    if ((key === 'approver' || key === 'approver2') && requesterUsers.has(username.toLowerCase())) {
      errors.push(`${PR_STEP_LABELS[key]}: you cannot approve your own request.`);
    }
  }
  return errors;
}
