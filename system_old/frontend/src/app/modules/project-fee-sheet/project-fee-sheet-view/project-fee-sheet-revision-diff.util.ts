export type RevisionDiffState = 'unchanged' | 'changed' | 'added' | 'removed';

export function normalizeComparableValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  const date = new Date(text);
  if (/^\d{4}-\d{2}-\d{2}/.test(text) && !Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric) && text !== '') {
    return String(numeric);
  }

  return text;
}

export function valuesDifferent(current: any, previous: any): boolean {
  return normalizeComparableValue(current) !== normalizeComparableValue(previous);
}

export function rowKey(row: any, keys: string[]): string {
  return keys.map((key) => normalizeComparableValue(row?.[key])).join('|');
}

export function getRowDiffState(
  current: any,
  previousRows: any[] | null | undefined,
  keyFields: string[],
  valueFields: string[]
): RevisionDiffState {
  const previous = (previousRows ?? []).find(
    (row) => rowKey(row, keyFields) === rowKey(current, keyFields)
  );

  if (!previous) {
    return 'added';
  }

  return valueFields.some((field) => valuesDifferent(current?.[field], previous?.[field]))
    ? 'changed'
    : 'unchanged';
}

export function getRemovedRows<T extends Record<string, any>>(
  currentRows: T[] | null | undefined,
  previousRows: T[] | null | undefined,
  keyFields: string[]
): T[] {
  const currentKeys = new Set((currentRows ?? []).map((row) => rowKey(row, keyFields)));

  return (previousRows ?? []).filter((row) => !currentKeys.has(rowKey(row, keyFields)));
}

export function hasPreviousRevision(index: number): boolean {
  return index > 0;
}
