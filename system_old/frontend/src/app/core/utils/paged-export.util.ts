export interface PagedExportResponse<T> {
    data?: T[];
    total?: number | string;
    recordsFiltered?: number | string;
    recordsTotal?: number | string;
}

export async function fetchAllPagedRows<T>(
    loadPage: (start: number, length: number) => Promise<PagedExportResponse<T>>,
    pageSize = 100
): Promise<T[]> {
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
        throw new Error('Export page size must be a positive integer.');
    }

    const rows: T[] = [];
    let start = 0;
    let expectedTotal: number | null = null;

    for (let page = 0; page < 10000; page += 1) {
        const response = await loadPage(start, pageSize);
        const pageRows = Array.isArray(response?.data) ? response.data : [];
        const rawTotal = response?.total ?? response?.recordsFiltered ?? response?.recordsTotal;
        const parsedTotal = Number(rawTotal);
        if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
            expectedTotal = parsedTotal;
        }

        rows.push(...pageRows);

        if (pageRows.length === 0 || (expectedTotal !== null && rows.length >= expectedTotal)) {
            return expectedTotal === null ? rows : rows.slice(0, expectedTotal);
        }

        if (expectedTotal === null && pageRows.length < pageSize) {
            return rows;
        }

        start += pageRows.length;
    }

    throw new Error('Export stopped because the page limit was exceeded.');
}
