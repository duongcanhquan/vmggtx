'use server'

import { revalidatePath } from 'next/cache'
import { createOpenAI } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'

// ============================================================
// KHO TRI THỨC AI (Knowledge Base) - Data Isolation theo org_id.
//
// processDocumentForAI:
//   File (PDF/TXT/MD) -> trích text -> băm nhỏ (chunking)
//   -> embedding (API Key theo TENANT qua getAIConfig)
//   -> insert lesson_materials GẮN CHẶT org_id của user.
// ============================================================

/** Role được phép nạp tài liệu vào kho tri thức */
const UPLOADER_ROLES = ['super_admin', 'campus_admin', 'academic_staff', 'teacher']

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md']

/** Kích thước chunk ~1200 ký tự, chồng lấn 150 để không đứt ngữ cảnh */
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
  chunkCount: number
  className: string | null
  createdAt: string
}

// ---------- Chunking: ưu tiên cắt theo đoạn văn ----------
function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) return []

  const chunks: string[] = []
  let start = 0

  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, text.length)

    if (end < text.length) {
      // Cắt tại ranh giới tự nhiên gần nhất: hết đoạn > hết câu > khoảng trắng
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

// ---------- Trích text theo loại file ----------
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
          return { error: 'PDF không chứa text (có thể là bản scan ảnh) - không trích xuất được nội dung.' }
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

/**
 * Nạp tài liệu vào Kho tri thức AI của cơ sở.
 *
 * BẢO MẬT / DATA ISOLATION:
 * - org_id KHÓA CỨNG theo profile của user đang đăng nhập - client
 *   không thể truyền org_id khác (chống nạp tài liệu chéo cơ sở).
 * - Chỉ UPLOADER_ROLES được nạp. RLS (018) chặn thêm tầng DB.
 * - Embedding dùng API Key của TENANT (getAIConfig: org -> org Mẹ ->
 *   env). Model embedding luôn là text-embedding-3-small vì cột
 *   vector cố định 1536 chiều - key tenant chỉ quyết định AI TRẢ PHÍ.
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
    if (!profile?.org_id) {
      return { error: 'Tài khoản của bạn chưa được gán vào cơ sở nào.' }
    }
    if (!UPLOADER_ROLES.includes(profile.role)) {
      return { error: 'TỪ CHỐI: Chỉ Giáo viên / Giáo vụ / Quản lý được nạp tài liệu.' }
    }
    const orgId = profile.org_id // KHÓA CỨNG - không nhận từ client

    // ===== Đọc form =====
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
    const subject = String(formData.get('subject') ?? '').trim()
    const gradeLevel = String(formData.get('gradeLevel') ?? '').trim()

    // classId (nếu có) phải là lớp CỦA CHÍNH cơ sở này
    if (classId) {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, org_id')
        .eq('id', classId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!cls || cls.org_id !== orgId) {
        return { error: 'Lớp học không thuộc cơ sở của bạn.' }
      }
    }

    // ===== Trích text + chunking =====
    const extracted = await extractText(file)
    if ('error' in extracted) return { error: extracted.error }

    const chunks = chunkText(extracted.text)
    if (chunks.length === 0) {
      return { error: 'Tài liệu không có nội dung text để nạp vào kho tri thức.' }
    }

    // ===== Embedding bằng API Key của tenant =====
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

    // ===== Insert - GẮN CHẶT org_id =====
    const rows = chunks.map((content, index) => ({
      org_id: orgId,
      class_id: classId,
      content,
      embedding: JSON.stringify(embeddings[index]),
      metadata: {
        file_name: file.name,
        author: profile.full_name,
        subject: subject || null,
        grade_level: gradeLevel || null,
        chunk_index: index,
        total_chunks: chunks.length,
      },
    }))

    const { error: insertError } = await supabase.from('lesson_materials').insert(rows)
    if (insertError) {
      return { error: `Không thể lưu vào kho tri thức: ${insertError.message}` }
    }

    revalidatePath('/ai/knowledge-base')
    return { fileName: file.name, chunkCount: chunks.length }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi xử lý tài liệu.',
    }
  }
}

/** Danh sách tài liệu trong kho tri thức của cơ sở user (gom theo file). */
export async function getKnowledgeBaseDocs(): Promise<{
  data: KnowledgeDoc[]
  demo: boolean
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('unauthenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile?.org_id) throw new Error('no-org')

    const { data, error } = await supabase
      .from('lesson_materials')
      .select('metadata, created_at, classes(name)')
      .eq('org_id', profile.org_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw error

    // Gom chunk theo file_name
    const byFile = new Map<string, KnowledgeDoc>()
    for (const row of data ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const fileName = String(meta.file_name ?? 'Tài liệu không tên')
      const cls = row.classes as { name?: string } | { name?: string }[] | null
      const className = Array.isArray(cls) ? cls[0]?.name ?? null : cls?.name ?? null

      const existing = byFile.get(fileName)
      if (existing) {
        existing.chunkCount += 1
      } else {
        byFile.set(fileName, {
          fileName,
          author: String(meta.author ?? '—'),
          subject: String(meta.subject ?? '') || '—',
          chunkCount: 1,
          className,
          createdAt: row.created_at,
        })
      }
    }

    return { data: [...byFile.values()], demo: false }
  } catch {
    return { data: [], demo: true }
  }
}

/** Lớp học của cơ sở user - cho dropdown "gắn tài liệu vào lớp". */
export async function getMyOrgClasses(): Promise<{ id: string; name: string }[]> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile?.org_id) return []

    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .is('deleted_at', null)
      .order('name')
    return data ?? []
  } catch {
    return []
  }
}
