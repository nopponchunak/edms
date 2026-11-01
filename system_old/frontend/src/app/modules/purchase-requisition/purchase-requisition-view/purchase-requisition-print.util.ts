export interface PurchaseRequisitionPrintPage<T> {
  items: T[];
  pageNumber: number;
  totalPages: number;
  isLast: boolean;
}

export interface PurchaseRequisitionPrintPaginationOptions<T> {
  maxRowsPerPage: number;
  maxPageWeight: number;
  getRowWeight: (item: T) => number;
}

/** Heights are measured at the actual print width after fonts and images load. */
export function paginatePurchaseRequisitionItemsByHeight<T>(
  items: T[],
  rowHeights: number[],
  continuationCapacity: number,
  finalCapacity: number
): PurchaseRequisitionPrintPage<T>[] {
  const pages: T[][] = [];
  let start = 0;
  while (start < items.length) {
    const remainingHeight = rowHeights.slice(start).reduce((sum, height) => sum + height, 0);
    if (remainingHeight <= finalCapacity) {
      pages.push(items.slice(start));
      start = items.length;
      break;
    }

    let end = start;
    let height = 0;
    // Leave an item for the final page whenever it can share space with the signatures.
    const limit = rowHeights[items.length - 1] <= finalCapacity ? items.length - 1 : items.length;
    while (end < limit && height + rowHeights[end] <= continuationCapacity) {
      height += rowHeights[end++];
    }
    if (end === start) {
      end++;
    }
    pages.push(items.slice(start, end));
    start = end;
  }
  // A row that fits a continuation page but not the signature page needs a summary page.
  if (!pages.length || rowHeights[rowHeights.length - 1] > finalCapacity) {
    pages.push([]);
  }
  return pages.map((pageItems, index) => ({
    items: pageItems,
    pageNumber: index + 1,
    totalPages: pages.length,
    isLast: index === pages.length - 1,
  }));
}

export function paginatePurchaseRequisitionItems<T>(
  items: T[] | null | undefined,
  options: PurchaseRequisitionPrintPaginationOptions<T>
): PurchaseRequisitionPrintPage<T>[] {
  const sourceItems = Array.isArray(items) ? items : [];
  const itemPages: T[][] = [];

  if (!sourceItems.length) {
    itemPages.push([]);
  } else {
    let pageItems: T[] = [];
    let pageWeight = 0;

    sourceItems.forEach((item) => {
      const rowWeight = options.getRowWeight(item);
      const shouldStartNewPage = pageItems.length > 0
        && (
          pageItems.length >= options.maxRowsPerPage
          || pageWeight + rowWeight > options.maxPageWeight
        );

      if (shouldStartNewPage) {
        itemPages.push(pageItems);
        pageItems = [];
        pageWeight = 0;
      }

      pageItems.push(item);
      pageWeight += rowWeight;
    });

    if (pageItems.length > 0) {
      itemPages.push(pageItems);
    }
  }

  const totalPages = itemPages.length;

  return itemPages.map((pageItems, index) => ({
    items: pageItems,
    pageNumber: index + 1,
    totalPages,
    isLast: index === totalPages - 1,
  }));
}
