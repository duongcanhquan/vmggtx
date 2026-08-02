'use server'

import { revalidatePath } from 'next/cache'
import { createOpenAI } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { KB_CATEGORIES, type KbCategory } from './constants'

// Re-export types only via constants for client — do NOT re-export from 'use server'

const UPLOADER_ROLES = ['super_admin', 'campus_admin', 'academic_staff', 'teacher']

const MAX_FILE_BYTES = 8 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md']
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150
const MAX_CHUNKS = 200

export type ProcessResult =
  | { error: string }
  | { error?: undefined; fileName: string; chunkCount: number }

export type KnowledgeDoc = {
  fileName: string
  author: string
  subject: string
  subjectId: string | null
  category: KbCategory | string
  categoryLabel: string
  orgId: string
  orgName: string
  chunkCount: number
  classId: string | null
  className: string | null
  createdAt: string
}

function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) return []

  const chunks: string[] = []
  let start = 0

  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, text.length)

    if (end < text.length) {
      const slice = text.slice(start, end)
      const paragraphBreak = slice.lastIndexOf('\n\n')
      const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'))
      const spaceBreak = slice.lastIndexOf(' ')
      const cut =
        paragraphBreak > CHUNK_SIZE * 0.4
          ? paragraphBreak
          : sentenceBreak > CHUNK_SIZE * 0.4
            ? sentenceBreak + 1
            : spaceBreak > CHUNK_SIZE * 0.4
              ? spaceBreak
              : slice.length
      end = start + cut
    }

    const chunk = text.slice(start, end).trim()
    if (chunk.length > 30) chunks.push(chunk)

    if (end >= text.length) break
    start = Math.max(end - CHUNK_OVERLAP, start + 1)
  }

  return chunks
}

async function extractText(file: File): Promise<{ text: string } | { error: string }> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: await file.text() }
  }

  if (name.endsWith('.pdf')) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) })
      try {
        const parsed = await parser.getText()
        if (!parsed.text?.trim()) {
          return {
            error:
              'PDF không chứa text (có thể là bản scan ảnh) - không trích xuất được nội dung.',
          }
        }
        return { text: parsed.text }
      } finally {
        await parser.destroy()
      }
    } catch {
      return { error: 'Không đọc được file PDF. Vui lòng kiểm tra file không bị hỏng/mã hóa.' }
    }
  }

  return { error: 'Định dạng không hỗ trợ. Chỉ nhận PDF, TXT, MD.' }
}

function categoryLabel(value: string): string {
  return KB_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

/**
 * Nạp tài liệu vào kho tri thức của ORG đang chọn (FormData.orgId),
 * không nhận org từ chỗ khác ngoài form đã authorize.
 */
export async function processDocumentForAI(formData: FormData): Promise<ProcessResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role, full_name')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile) return { error: 'Không tìm thấy hồ sơ.' }
    if (!UPLOADER_ROLES.includes(profile.role)) {
      return { error: 'TỪ CHỐI: Chỉ Giáo viên / Giáo vụ / Quản lý được nạp tài liệu.' }
    }

    const orgId = String(formData.get('orgId') ?? '').trim()
    if (!orgId) {
      return { error: 'Chưa chọn cơ sở trên thanh tổ chức. Chọn cơ sở rồi nạp lại.' }
    }

    let allowed = profile.role === 'super_admin'
    if (!allowed && profile.role === 'teacher') {
      // GV chỉ nạp vào đúng org của mình (trùng org đang chọn trên thanh)
      allowed = Boolean(profile.org_id && profile.org_id === orgId)
    }
    if (!allowed) {
      const { data: authorized } = await isAuthorizedRpc(supabase, {
        p_user_id: user.id,
        p_target_org_id: orgId,
        p_required_role: 'academic_staff',
        p_menu_key: 'ai_kb',
      })
      allowed = authorized === true
    }
    if (!allowed) {
      return { error: 'Bạn không có quyền nạp tri thức vào cơ sở đang chọn.' }
    }

    const { data: orgRow } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!orgRow) return { error: 'Cơ sở không tồn tại.' }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Vui lòng chọn file tài liệu (PDF, TXT hoặc MD).' }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: 'File vượt quá 8MB. Vui lòng tách nhỏ tài liệu.' }
    }
    if (!ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      return { error: 'Định dạng không hỗ trợ. Chỉ nhận PDF, TXT, MD.' }
    }

    const classId = String(formData.get('classId') ?? '').trim() || null
    const subjectId = String(formData.get('subjectId') ?? '').trim() || null
    const categoryRaw = String(formData.get('category') ?? 'general').trim()
    const category: KbCategory = KB_CATEGORIES.some((c) => c.value === categoryRaw)
      ? (categoryRaw as KbCategory)
      : 'general'
    const gradeLevel = String(formData.get('gradeLevel') ?? '').trim()

    if (!subjectId && category === 'training') {
      return { error: 'Category Đào tạo bắt buộc chọn môn học từ danh mục.' }
    }

    let subjectName: string | null = null
    if (subjectId) {
      const { data: subject } = await supabase
        .from('subjects')
        .select('id, name, org_id, is_active')
        .eq('id', subjectId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!subject || !subject.is_active) {
        return { error: 'Môn học không tồn tại hoặc đã tắt.' }
      }
      // subject.org_id null = global; else must be in subtree
      if (subject.org_id) {
        const subtree = await getDescendantOrgIds(supabase, orgId)
        if (!subtree.includes(subject.org_id) && subject.org_id !== orgId) {
          return { error: 'Môn học không thuộc phạm vi cơ sở đang chọn.' }
        }
      }
      subjectName = subject.name
    }

    if (classId) {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, org_id')
        .eq('id', classId)
        .is('deleted_at', null)
        .maybeSingle()
      const subtree = await getDescendantOrgIds(supabase, orgId)
      if (!cls || (!subtree.includes(cls.org_id) && cls.org_id !== orgId)) {
        return { error: 'Lớp học không thuộc cơ sở đang chọn (hoặc nhánh con).' }
      }
    }

    const extracted = await extractText(file)
    if ('error' in extracted) return { error: extracted.error }

    const chunks = chunkText(extracted.text)
    if (chunks.length === 0) {
      return { error: 'Tài liệu không có nội dung text để nạp vào kho tri thức.' }
    }

    const aiConfig = await getAIConfig(orgId)
    const embeddingApiKey =
      aiConfig.provider === 'openai' && aiConfig.apiKey
        ? aiConfig.apiKey
        : process.env.OPENAI_API_KEY
    if (!embeddingApiKey) {
      return {
        error:
          'Chưa có API Key AI: cấu hình tại Cài đặt > Cấu hình AI hoặc đặt biến môi trường OPENAI_API_KEY.',
      }
    }

    const openaiClient = createOpenAI({ apiKey: embeddingApiKey })
    let embeddings: number[][]
    try {
      const result = await embedMany({
        model: openaiClient.embedding('text-embedding-3-small'),
        values: chunks,
        abortSignal: AbortSignal.timeout(30_000),
      })
      embeddings = result.embeddings
    } catch {
      return {
        error:
          'Gọi API Embedding thất bại (key hết hạn / hết quota?). Kiểm tra lại cấu hình AI của cơ sở.',
      }
    }

    const rows = chunks.map((content, index) => ({
      org_id: orgId,
      class_id: classId,
      content,
      embedding: JSON.stringify(embeddings[index]),
      metadata: {
        file_name: file.name,
        author: profile.full_name,
        subject: subjectName,
        subject_id: subjectId,
        category,
        grade_level: gradeLevel || null,
        org_name: orgRow.name,
        chunk_index: index,
        total_chunks: chunks.length,
      },
    }))

    const { error: insertError } = await supabase.from('lesson_materials').insert(rows)
    if (insertError) {
      return { error: `Không thể lưu vào kho tri thức: ${insertError.message}` }
    }

    revalidatePath('/ai/knowledge-base')
    revalidatePath('/settings/ai')
    return { fileName: file.name, chunkCount: chunks.length }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi xử lý tài liệu.',
    }
  }
}

export async function getKnowledgeBaseDocs(
  orgId: string | null,
  filters?: {
    subjectId?: string | null
    classId?: string | null
    category?: string | null
  }
): Promise<{ data: KnowledgeDoc[]; demo: boolean; error?: string; orgName?: string }> {
  if (!orgId) {
    return { data: [], demo: false, error: 'Chưa chọn cơ sở trên thanh tổ chức.' }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], demo: true }

    const subtree = await getDescendantOrgIds(supabase, orgId)
    const orgIds = subtree.includes(orgId) ? subtree : [orgId, ...subtree]

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
      .is('deleted_at', null)
    const orgNameMap = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))

    const { data, error } = await supabase
      .from('lesson_materials')
      .select('org_id, class_id, metadata, created_at, classes(name)')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) return { data: [], demo: false, error: error.message }

    const byFile = new Map<string, KnowledgeDoc>()
    for (const row of data ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const fileName = String(meta.file_name ?? 'Tài liệu không tên')
      const metaSubjectId = meta.subject_id ? String(meta.subject_id) : null
      const metaCategory = String(meta.category ?? 'general')
      const rowClassId = (row.class_id as string | null) ?? null

      if (filters?.subjectId && metaSubjectId !== filters.subjectId) continue
      if (filters?.classId && rowClassId !== filters.classId) continue
      if (filters?.category && metaCategory !== filters.category) continue

      const cls = row.classes as { name?: string } | { name?: string }[] | null
      const className = Array.isArray(cls) ? cls[0]?.name ?? null : cls?.name ?? null
      const rowOrgId = row.org_id as string
      const key = `${rowOrgId}:${fileName}:${metaCategory}:${metaSubjectId ?? ''}:${rowClassId ?? ''}`

      const existing = byFile.get(key)
      if (existing) {
        existing.chunkCount += 1
      } else {
        byFile.set(key, {
          fileName,
          author: String(meta.author ?? '—'),
          subject: String(meta.subject ?? '') || '—',
          subjectId: metaSubjectId,
          category: metaCategory,
          categoryLabel: categoryLabel(metaCategory),
          orgId: rowOrgId,
          orgName: orgNameMap.get(rowOrgId) ?? String(meta.org_name ?? '—'),
          chunkCount: 1,
          classId: rowClassId,
          className,
          createdAt: row.created_at as string,
        })
      }
    }

    return {
      data: [...byFile.values()],
      demo: false,
      orgName: orgNameMap.get(orgId),
    }
  } catch {
    return { data: [], demo: true }
  }
}

/** Lớp trong subtree org đang chọn */
export async function getKbClasses(
  orgId: string | null
): Promise<{ id: string; name: string }[]> {
  if (!orgId) return []
  try {
    const supabase = createClient()
    const subtree = await getDescendantOrgIds(supabase, orgId)
    const orgIds = subtree.includes(orgId) ? subtree : [orgId, ...subtree]
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('name')
    return data ?? []
  } catch {
    return []
  }
}

/** Môn active (global + org subtree) */
export async function getKbSubjects(
  orgId: string | null
): Promise<{ id: string; name: string }[]> {
  if (!orgId) return []
  try {
    const supabase = createClient()
    const subtree = await getDescendantOrgIds(supabase, orgId)
    const orgIds = subtree.includes(orgId) ? subtree : [orgId, ...subtree]
    const { data } = await supabase
      .from('subjects')
      .select('id, name, org_id')
      .eq('is_active', true)
      .is('deleted_at', null)
      .or(`org_id.is.null,org_id.in.(${orgIds.join(',')})`)
      .order('name')
    return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }))
  } catch {
    return []
  }
}

/** @deprecated dùng getKbClasses(orgId) */
export async function getMyOrgClasses(): Promise<{ id: string; name: string }[]> {
  return []
}
