/**
 * Chế độ soạn thảo AI — điền thẳng vào form (khác module_assist hỏi đáp).
 */
export const DRAFT_MODES = [
  'announcement',
  'parent_warning',
  'contact_book',
  'exam_paper',
  'invoice_note',
  'leave_reason',
  'session_note',
] as const

export type DraftMode = (typeof DRAFT_MODES)[number]

export function parseLabeledDraft(
  text: string,
  labels: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  const keys = Object.keys(labels)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const label = labels[key]
    const nextLabels = keys.slice(i + 1).map((k) => labels[k])
    const nextAlt = nextLabels.length
      ? `(?=${nextLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)`
      : '$'
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([\\s\\S]+?)${nextAlt}`,
      'i'
    )
    const m = text.match(re)
    if (m?.[1]) out[key] = m[1].trim()
  }
  return out
}

export function parseAnnouncementDraft(text: string): { title: string; body: string } {
  const parsed = parseLabeledDraft(text, {
    title: 'TIÊU ĐỀ',
    body: 'NỘI DUNG',
  })
  if (parsed.title || parsed.body) {
    return {
      title: (parsed.title || '').slice(0, 150),
      body: (parsed.body || text).slice(0, 2000),
    }
  }
  const lines = text.trim().split('\n').filter(Boolean)
  return {
    title: (lines[0] || 'Thông báo').slice(0, 150),
    body: (lines.slice(1).join('\n').trim() || text).slice(0, 2000),
  }
}

export function parseExamPaperDraft(text: string): {
  title: string
  description: string
  content: string
} {
  const parsed = parseLabeledDraft(text, {
    title: 'TIÊU ĐỀ',
    description: 'MÔ TẢ',
    content: 'NỘI DUNG',
  })
  if (parsed.content || parsed.title) {
    return {
      title: (parsed.title || 'Đề kiểm tra').slice(0, 200),
      description: (parsed.description || '').slice(0, 500),
      content: (parsed.content || text).slice(0, 20000),
    }
  }
  return { title: 'Đề kiểm tra', description: '', content: text.slice(0, 20000) }
}
