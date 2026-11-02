/**
 * Approvers that come from an employee's Title / Level (HRIS) rather than from a committee.
 * Each predicate is a SQL condition on the `employees` alias `e`, shared by the dropdown and the submit checks.
 */
export type PrRoleKind = 'it-manager' | 'verifier' | 'adm';

export const PR_ROLE_SQL: Record<PrRoleKind, string> = {
  // Title "IT Manager".
  'it-manager': `e.title_name ~* '^\\s*IT Manager\\s*$'`,
  // Level MD, DI, AD (AD, AD1, AD-TL ...) or a team leader (level ending in -TL, or the title).
  verifier: `(UPPER(TRIM(e.level_name)) ~ '^(MD|DI|AD)(\\d|-|$)' OR UPPER(TRIM(e.level_name)) ~ '-TL$' OR e.title_name ~* '(managing director|^director$|team leader)')`,
  // Action by (ADM) of this form: the Title contains "Purchase" (e.g. Senior Administrative Officer (Purchase)).
  adm: `e.title_name ILIKE '%purchase%'`,
};

export const PR_ROLE_LABELS: Record<PrRoleKind, string> = {
  'it-manager': 'IT Manager',
  verifier: 'MD/DI/AD/TL',
  adm: 'ADM (Purchase)',
};

export const isPrRoleKind = (value: string): value is PrRoleKind => value in PR_ROLE_SQL;
