export const ALLOWANCE_AFTER_10PM_PRINT_ROWS_PER_PAGE = 13;
export const ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT = 13;

export interface AllowanceAfter10pmPrintPage<T> {
  items: T[];
  blankRows: number[];
  totalBaht: number;
}

export function formatAllowanceAfter10pmPrintProject(item: any, separator = ' / '): string {
  const rawProjectCode = String(item?.project_code ?? item?.projectCode ?? '').trim();
  const projectName = String(item?.project_name ?? item?.projectName ?? '').trim();
  const withMtPrefix = (value: string): string => value && !/^MT/i.test(value) ? `MT${value}` : value;

  if (!rawProjectCode) {
    return withMtPrefix(projectName);
  }

  return [withMtPrefix(rawProjectCode), projectName].filter(Boolean).join(separator);
}

export function buildAllowanceAfter10pmPrintPages<T extends { baht?: unknown }>(
  sourceItems: T[] | null | undefined,
  getRowWeight: (item: T) => number = () => 1
): AllowanceAfter10pmPrintPage<T>[] {
  const items = Array.isArray(sourceItems) ? sourceItems : [];
  if (!items.length) {
    return [createAllowanceAfter10pmPrintPage([], 0)];
  }

  const pages: AllowanceAfter10pmPrintPage<T>[] = [];
  let pageItems: T[] = [];
  let pageWeight = 0;

  items.forEach((item) => {
    const rowWeight = normalizeRowWeight(getRowWeight(item));
    const shouldStartNewPage = pageItems.length > 0 && (
      pageItems.length >= ALLOWANCE_AFTER_10PM_PRINT_ROWS_PER_PAGE ||
      pageWeight + rowWeight > ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT
    );

    if (shouldStartNewPage) {
      pages.push(createAllowanceAfter10pmPrintPage(pageItems, pageWeight));
      pageItems = [];
      pageWeight = 0;
    }

    pageItems.push(item);
    pageWeight += rowWeight;
  });

  if (pageItems.length) {
    pages.push(createAllowanceAfter10pmPrintPage(pageItems, pageWeight));
  }

  return pages;
}

function normalizeRowWeight(value: number): number {
  const normalized = Number.isFinite(value) ? Math.ceil(value) : 1;
  return Math.min(
    ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT,
    Math.max(1, normalized)
  );
}

function createAllowanceAfter10pmPrintPage<T extends { baht?: unknown }>(
  items: T[],
  pageWeight: number
): AllowanceAfter10pmPrintPage<T> {
  const remainingRows = ALLOWANCE_AFTER_10PM_PRINT_ROWS_PER_PAGE - items.length;
  const remainingWeight = ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT - pageWeight;

  return {
    items,
    blankRows: Array.from(
      { length: Math.max(0, Math.floor(Math.min(remainingRows, remainingWeight))) },
      (_, index) => index
    ),
    totalBaht: items.reduce((sum, item) => sum + Number(item?.baht || 0), 0),
  };
}
