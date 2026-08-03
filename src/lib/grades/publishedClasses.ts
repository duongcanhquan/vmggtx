/**
 * Migration 075: điểm chỉ hiện sau khi khảo thí công bố
 * (class_results.is_published = true).
 *
 * - Có cột + query OK → chỉ giữ lớp đã publish (thiếu dòng = chưa công bố).
 * - Thiếu cột / lỗi schema → legacy fail-open (giữ mọi classId).
 */

export async function resolvePublishedClassIds(
  supabase: unknown,
  classIds: string[]
): Promise<{ mode: 'filter'; published: Set<string> } | { mode: 'legacy' }> {
  if (classIds.length === 0) {
    return { mode: 'filter', published: new Set() }
  }

  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, values: string[]) => {
          is: (
            col: string,
            value: null
          ) => Promise<{
            data: { class_id: string; is_published: boolean }[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  }

  const { data, error } = await client
    .from('class_results')
    .select('class_id, is_published')
    .in('class_id', classIds)
    .is('deleted_at', null)

  if (error) {
    return { mode: 'legacy' }
  }

  return {
    mode: 'filter',
    published: new Set(
      (data ?? [])
        .filter((r) => r.is_published === true)
        .map((r) => r.class_id)
    ),
  }
}
