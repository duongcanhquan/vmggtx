/**
 * Lọc thông báo theo phạm vi 076 (all / class / individual).
 * Thiếu cột targeting → coi như all (hiện).
 */

export type AnnouncementTargetFields = {
  target_scope?: string | null
  target_class_ids?: string[] | null
  target_user_ids?: string[] | null
}

export function announcementVisibleToRecipient(
  row: AnnouncementTargetFields,
  opts: {
    userId: string
    /** Lớp HV đang học / lớp GV phụ trách */
    classIds: string[]
  }
): boolean {
  const scope = row.target_scope ?? 'all'
  if (scope === 'all' || !scope) return true
  if (scope === 'class') {
    const targets = row.target_class_ids ?? []
    if (targets.length === 0) return true
    return opts.classIds.some((id) => targets.includes(id))
  }
  if (scope === 'individual') {
    const targets = row.target_user_ids ?? []
    if (targets.length === 0) return true
    return targets.includes(opts.userId)
  }
  return true
}
