// Reserve one template row between the final totals and the approval block.
// A wrapped item consumes more than one unit, so 19 is a height budget rather
// than a hard record count.
export const EXPENSES_CLAIM_PRINT_ROWS_PER_PAGE = 19;
export const EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT = 19;

export interface ExpensesClaimPrintPage<T> {
  items: T[];
  blankRows: number[];
  totalBaht: number;
}

export function buildExpensesClaimPrintPages<T extends { baht?: unknown }>(
  sourceItems: T[] | null | undefined,
  getRowWeight: (item: T) => number = () => 1
): ExpensesClaimPrintPage<T>[] {
  const items = Array.isArray(sourceItems) ? sourceItems : [];

  if (!items.length) {
    return [createExpensesClaimPrintPage([], 0)];
  }

  const pages: ExpensesClaimPrintPage<T>[] = [];
  let pageItems: T[] = [];
  let pageWeight = 0;

  items.forEach((item) => {
    const rowWeight = normalizeRowWeight(getRowWeight(item));
    const shouldStartNewPage = pageItems.length > 0 && (
      pageItems.length >= EXPENSES_CLAIM_PRINT_ROWS_PER_PAGE ||
      pageWeight + rowWeight > EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT
    );

    if (shouldStartNewPage) {
      pages.push(createExpensesClaimPrintPage(pageItems, pageWeight));
      pageItems = [];
      pageWeight = 0;
    }

    pageItems.push(item);
    pageWeight += rowWeight;
  });

  if (pageItems.length) {
    pages.push(createExpensesClaimPrintPage(pageItems, pageWeight));
  }

  return pages;
}

function createExpensesClaimPrintPage<T extends { baht?: unknown }>(
  items: T[],
  pageWeight: number
): ExpensesClaimPrintPage<T> {
  return {
    items,
    blankRows: Array.from(
      { length: Math.max(0, EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT - pageWeight) },
      (_, index) => index
    ),
    totalBaht: items.reduce((sum, item) => sum + Number(item?.baht || 0), 0),
  };
}

function normalizeRowWeight(value: number): number {
  const normalized = Number.isFinite(value) ? Math.ceil(value) : 1;
  return Math.min(
    EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT,
    Math.max(1, normalized)
  );
}
