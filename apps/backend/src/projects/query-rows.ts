/**
 * `DataSource.query` returns the rows for SELECT / INSERT, but `[rows, rowCount]` for UPDATE / DELETE ... RETURNING on
 * Postgres. This gives the rows in both cases.
 */
export function rowsOf<T = any>(result: unknown): T[] {
  return Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
}
