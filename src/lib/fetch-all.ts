/**
 * Paginates a Supabase query in pages of `pageSize` rows to bypass the
 * default 1000-row PostgREST limit. The callback receives the inclusive
 * `from`/`to` range and must return a Supabase query builder (or any
 * thenable) that resolves to `{ data, error }`.
 *
 * After the first full page, the next pages are requested in parallel
 * batches (`parallel`), so big lists cost a few round-trips instead of one
 * per page. Results keep the query order.
 */
export async function fetchAllPaginated<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  parallel = 4,
): Promise<T[]> {
  const first = await build(0, pageSize - 1);
  if (first.error) throw first.error;
  const all: T[] = [...(first.data ?? [])];
  if (!first.data || first.data.length < pageSize) return all;

  for (let page = 1; ; page += parallel) {
    const results = await Promise.all(
      Array.from({ length: parallel }, (_, i) => {
        const from = (page + i) * pageSize;
        return build(from, from + pageSize - 1);
      }),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      if (!data || data.length === 0) return all;
      all.push(...data);
      if (data.length < pageSize) return all;
    }
  }
}
