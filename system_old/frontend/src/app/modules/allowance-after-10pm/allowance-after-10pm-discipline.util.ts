export const ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS = ['C&S', 'M&E', 'Admin', 'Other'] as const;
export const ALLOWANCE_AFTER_10PM_PRINT_DISCIPLINE_OPTIONS = ['C&S', 'M&E', 'Admin', 'Site'] as const;

const STANDARD_ALLOWANCE_AFTER_10PM_DISCIPLINES = ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS.filter(
  (option) => option !== 'Other'
);

export function normalizeAllowanceAfter10pmDiscipline(value: string | null | undefined): string {
  const discipline = String(value || '').trim();
  return discipline === 'Site' ? 'Other' : discipline;
}

export function resolveAllowanceAfter10pmDisciplineFormValue(value: string | null | undefined): {
  discipline: string;
  disciplineOther: string;
} {
  const discipline = normalizeAllowanceAfter10pmDiscipline(value);

  if (!discipline) {
    return { discipline: '', disciplineOther: '' };
  }

  if (ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS.includes(discipline as typeof ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS[number])) {
    return { discipline, disciplineOther: '' };
  }

  return { discipline: 'Other', disciplineOther: discipline };
}

export function buildAllowanceAfter10pmDisciplinePayload(
  discipline: string | null | undefined,
  disciplineOther: string | null | undefined
): string {
  const selectedDiscipline = normalizeAllowanceAfter10pmDiscipline(discipline);

  if (selectedDiscipline === 'Other') {
    return normalizeAllowanceAfter10pmDiscipline(disciplineOther) || 'Other';
  }

  return selectedDiscipline;
}

export function isAllowanceAfter10pmOtherDiscipline(value: string | null | undefined): boolean {
  const discipline = normalizeAllowanceAfter10pmDiscipline(value);
  return !!discipline && !STANDARD_ALLOWANCE_AFTER_10PM_DISCIPLINES.includes(
    discipline as typeof STANDARD_ALLOWANCE_AFTER_10PM_DISCIPLINES[number]
  );
}

export function isAllowanceAfter10pmPrintDisciplineSelected(
  value: string | null | undefined,
  option: typeof ALLOWANCE_AFTER_10PM_PRINT_DISCIPLINE_OPTIONS[number]
): boolean {
  if (option === 'Site') {
    return isAllowanceAfter10pmOtherDiscipline(value);
  }

  return normalizeAllowanceAfter10pmDiscipline(value) === option;
}

export function getAllowanceAfter10pmOtherDisciplineText(value: string | null | undefined): string {
  const discipline = normalizeAllowanceAfter10pmDiscipline(value);
  return isAllowanceAfter10pmOtherDiscipline(discipline) && discipline !== 'Other' ? discipline : '';
}
