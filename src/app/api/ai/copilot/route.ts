import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { embed, streamText, type LanguageModel } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIConfig, type TenantAIConfig } from '@/lib/ai/getTenantAIConfig'
import { DEFAULT_ORG_CONFIG, orgConfigSchema } from '@/lib/validation/schemas'

export const maxDuration = 60

// ============================================================
// CORE AI COPILOT
// taskType:
//   tutor | lesson_plan | hr_query | crm_assist
// crm_assist + mode: rag | counsel_script | summarize | draft_followup
// ============================================================

const AI_MAINTENANCE_MESSAGE = 'Trợ lý AI đang bảo trì, vui lòng quay lại sau'

const TASK_TYPES = ['tutor', 'lesson_plan', 'hr_query', 'crm_assist'] as const
const CRM_MODES = ['rag', 'counsel_script', 'summarize', 'draft_followup'] as const

const bodySchema = z.object({
  prompt: z.string().trim().min(1, 'Thiếu prompt.').max(4000, 'Prompt tối đa 4000 ký tự.'),
  taskType: z.enum(TASK_TYPES),
  orgId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  mode: z.enum(CRM_MODES).optional().default('rag'),
})

type MatchedMaterial = { content: string; metadata?: Record<string, unknown> }

function buildChatModel(config: TenantAIConfig): LanguageModel | null {
  switch (config.provider) {
    case 'google': {
      const apiKey = config.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      if (!apiKey) return null
      return createGoogleGenerativeAI({ apiKey })(config.model)
    }
    case 'anthropic': {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
      if (!apiKey) return null
      return createAnthropic({ apiKey })(config.model)
    }
    default: {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY
      if (!apiKey) return null
      return createOpenAI({ apiKey })(config.model)
    }
  }
}

function buildSystemPrompt(
  taskType: (typeof TASK_TYPES)[number],
  context: string,
  extras?: {
    leadContext?: string
    crmTone?: 'friendly' | 'professional'
    crmNote?: string
    mode?: (typeof CRM_MODES)[number]
  }
) {
  switch (taskType) {
    case 'tutor':
      return `Bạn là gia sư của trung tâm GDTX, trả lời bằng tiếng Việt, ngắn gọn và dễ hiểu.
CHỈ trả lời dựa vào tài liệu dưới đây. Nếu tài liệu không chứa thông tin liên quan, hãy nói rõ là tài liệu của lớp chưa đề cập nội dung này và gợi ý học sinh hỏi giáo viên.

TÀI LIỆU CỦA LỚP:
${context}`
    case 'lesson_plan':
      return `Bạn là chuyên gia sư phạm của trung tâm GDTX. Dựa vào khung chương trình dưới đây, tạo GIÁO ÁN 45 PHÚT bằng tiếng Việt theo cấu trúc: Mục tiêu bài học, Chuẩn bị, Tiến trình (Khởi động - Hình thành kiến thức - Luyện tập - Vận dụng, kèm phân bổ thời gian từng phần), Đánh giá & Dặn dò.
Nếu khung chương trình không đề cập chủ đề được yêu cầu, hãy ghi chú rõ và soạn theo chuẩn kiến thức phổ thông.

KHUNG CHƯƠNG TRÌNH (SYLLABUS):
${context}`
    case 'hr_query':
      return `Bạn là trợ lý hành chính - nhân sự của trung tâm GDTX, trả lời bằng tiếng Việt, chính xác và thận trọng.
CHỈ trả lời dựa trên quy chế/tài liệu nội bộ dưới đây. Nếu quy chế không đề cập, hãy trả lời rằng chưa có quy định và đề nghị người hỏi liên hệ phòng nhân sự - TUYỆT ĐỐI không tự suy diễn quy định.

QUY CHẾ / TÀI LIỆU NỘI BỘ:
${context}`
    case 'crm_assist': {
      const tone =
        extras?.crmTone === 'professional'
          ? 'Giọng điệu chuyên nghiệp, lịch sự, ngắn gọn.'
          : 'Giọng điệu thân thiện, gần gũi, vẫn chuyên nghiệp.'
      const note = extras?.crmNote?.trim()
        ? `\nGHI CHÚ CẤU HÌNH CƠ SỞ:\n${extras.crmNote.trim()}\n`
        : ''
      const leadBlock = extras?.leadContext
        ? `\nHỒ SƠ LEAD HIỆN TẠI:\n${extras.leadContext}\n`
        : ''
      const modeHint =
        extras?.mode === 'summarize'
          ? 'Nhiệm vụ: TÓM TẮT hồ sơ + nhật ký chăm sóc, nêu điểm nóng, rủi ro mất lead, bước follow-up đề xuất (3-5 gạch đầu dòng).'
          : extras?.mode === 'counsel_script'
            ? 'Nhiệm vụ: soạn KỊCH BẢN GỌI ĐIỆN / ZALO (mở đầu → khai thác nhu cầu → giới thiệu chương trình/học phí theo tài liệu → xử lý từ chối → chốt lịch hẹn).'
            : extras?.mode === 'draft_followup'
              ? 'Nhiệm vụ: soạn TIN NHẮN / EMAIL follow-up ngắn (≤120 từ), có CTA rõ (gọi lại / đến test / đăng ký).'
              : 'Nhiệm vụ: trả lời câu hỏi tuyển sinh dựa trên TÀI LIỆU RAG + hồ sơ lead. Không bịa học phí/khuyến mãi nếu tài liệu không có.'

      return `Bạn là trợ lý AI TUYỂN SINH của trung tâm giáo dục, trả lời bằng tiếng Việt.
${tone}
${modeHint}
Ưu tiên thông tin từ tài liệu tuyển sinh/chương trình/học phí dưới đây. Nếu thiếu dữ liệu, nói rõ và đề xuất tư vấn viên xác nhận với cơ sở.
KHÔNG bịa chính sách; KHÔNG tiết lộ thông tin nội bộ không liên quan tuyển sinh.
${note}${leadBlock}
TÀI LIỆU TUYỂN SINH / CHƯƠNG TRÌNH (RAG):
${context}`
    }
  }
}

function formatLeadContext(lead: Record<string, unknown>, activities: string[]): string {
  const lines = [
    `Họ tên: ${lead.full_name ?? '—'}`,
    `SĐT: ${lead.phone ?? '—'}`,
    `Email: ${lead.email ?? '—'}`,
    `Trạng thái: ${lead.status ?? '—'}`,
    `Nguồn: ${lead.source ?? '—'}`,
    `Độ nóng: ${lead.priority ?? '—'}`,
    `CCCD: ${lead.cccd ?? '—'}`,
    `Ngày sinh: ${lead.date_of_birth ?? '—'}`,
    `Giới tính: ${lead.gender ?? '—'}`,
    `Địa chỉ: ${lead.address ?? '—'}`,
    `Trường đang học: ${lead.current_school ?? '—'}`,
    `Trình độ: ${lead.education_level ?? '—'}`,
    `Ngành nghề quan tâm: ${lead.career_interest ?? '—'}`,
    `Sở thích/tính cách: ${lead.interests ?? '—'}`,
    `Lịch học mong muốn: ${lead.preferred_schedule ?? '—'}`,
    `PH1: ${lead.parent_name ?? '—'} (${lead.parent_relation ?? ''}) ${lead.parent_phone ?? ''} ${lead.parent_email ?? ''}`,
    `PH2: ${lead.parent2_name ?? '—'} (${lead.parent2_relation ?? ''}) ${lead.parent2_phone ?? ''}`,
    `Tóm tắt cuộc gọi: ${lead.call_summary ?? '—'}`,
    `Ghi chú: ${lead.notes ?? '—'}`,
    `Hẹn follow-up: ${lead.next_follow_up_at ?? '—'}`,
    `Hẹn test: ${lead.appointment_at ?? '—'}`,
  ]
  if (activities.length) {
    lines.push('Nhật ký gần đây:')
    for (const a of activities.slice(0, 8)) lines.push(`- ${a}`)
  }
  return lines.join('\n')
}

function prioritizeAdmissionsMaterials(materials: MatchedMaterial[]): MatchedMaterial[] {
  const score = (m: MatchedMaterial) => {
    const meta = m.metadata || {}
    const cat = String(meta.category || meta.subject || meta.tags || '').toLowerCase()
    if (cat.includes('admission') || cat.includes('crm') || cat.includes('tuyen')) return 2
    if (cat.includes('tuition') || cat.includes('hoc phi') || cat.includes('chuong trinh'))
      return 1
    return 0
  }
  return [...materials].sort((a, b) => score(b) - score(a))
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Bạn cần đăng nhập để sử dụng Trợ lý AI.', { status: 401 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Body không hợp lệ.' },
      { status: 400 }
    )
  }
  const { prompt, taskType, classId, leadId, mode } = parsed.data

  let orgId: string
  let ragClassId: string | null = null
  let leadContext = ''
  let crmTone: 'friendly' | 'professional' = 'friendly'
  let crmNote = ''

  if (taskType === 'tutor') {
    if (!classId) {
      return NextResponse.json({ error: 'taskType=tutor cần classId.' }, { status: 400 })
    }
    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls) {
      return NextResponse.json({ error: 'Lớp học không tồn tại.' }, { status: 404 })
    }

    if (cls.teacher_id !== user.id) {
      const [{ data: enrollment }, { data: staffAuthorized }] = await Promise.all([
        supabase
          .from('enrollments')
          .select('id')
          .eq('class_id', cls.id)
          .eq('student_id', user.id)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase.rpc('is_authorized', {
          p_user_id: user.id,
          p_target_org_id: cls.org_id,
          p_required_role: 'academic_staff',
        }),
      ])
      if (!enrollment && staffAuthorized !== true) {
        return NextResponse.json(
          { error: 'TỪ CHỐI: Bạn không thuộc lớp học này.' },
          { status: 403 }
        )
      }
    }

    orgId = cls.org_id
    ragClassId = cls.id
  } else {
    const requestedOrgId = parsed.data.orgId
    if (!requestedOrgId) {
      return NextResponse.json({ error: `taskType=${taskType} cần orgId.` }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile) {
      return NextResponse.json({ error: 'Không tìm thấy hồ sơ người dùng.' }, { status: 403 })
    }

    let inScope = profile.role === 'super_admin' || profile.org_id === requestedOrgId
    if (!inScope) {
      const { data: inSubtree } = await supabase.rpc('is_org_in_my_subtree', {
        p_target_org_id: requestedOrgId,
      })
      inScope = inSubtree === true
    }
    if (!inScope) {
      return NextResponse.json(
        { error: 'TỪ CHỐI: Cơ sở này không thuộc phạm vi của bạn.' },
        { status: 403 }
      )
    }
    orgId = requestedOrgId

    if (taskType === 'crm_assist') {
      // admission_staff+ trong org
      const allowedRoles = [
        'super_admin',
        'campus_admin',
        'academic_staff',
        'admission_staff',
      ]
      if (!allowedRoles.includes(profile.role)) {
        return NextResponse.json(
          { error: 'TỪ CHỐI: Chỉ nhân sự tuyển sinh/học vụ dùng AI CRM.' },
          { status: 403 }
        )
      }

      const { data: eff } = await supabase.rpc('get_org_effective_config', {
        p_org_id: orgId,
      })
      const cfgParsed = orgConfigSchema.safeParse(eff ?? {})
      const cfg = cfgParsed.success ? cfgParsed.data : DEFAULT_ORG_CONFIG
      if (!cfg.crm_ai_enabled) {
        return NextResponse.json(
          { error: 'AI tuyển sinh đang tắt tại Cài đặt → Tuyển sinh / CRM.' },
          { status: 403 }
        )
      }
      crmTone = cfg.crm_ai_tone
      crmNote = cfg.crm_ai_system_note || ''

      if (leadId) {
        const { data: lead } = await supabase
          .from('leads')
          .select(
            'id, org_id, full_name, phone, email, status, source, priority, cccd, date_of_birth, gender, address, current_school, education_level, career_interest, interests, preferred_schedule, call_summary, notes, parent_name, parent_phone, parent_email, parent_relation, parent2_name, parent2_phone, parent2_relation, next_follow_up_at, appointment_at'
          )
          .eq('id', leadId)
          .is('deleted_at', null)
          .maybeSingle()
        if (!lead) {
          return NextResponse.json(
            { error: 'Lead không tồn tại hoặc không có quyền.' },
            { status: 404 }
          )
        }
        if (lead.org_id !== orgId) {
          // allow subtree
          const { data: leadInScope } = await supabase.rpc('is_org_in_my_subtree', {
            p_target_org_id: lead.org_id,
          })
          if (profile.role !== 'super_admin' && leadInScope !== true) {
            return NextResponse.json({ error: 'Lead ngoài phạm vi.' }, { status: 403 })
          }
        }

        const { data: acts } = await supabase
          .from('lead_activities')
          .select('activity_type, description, created_at')
          .eq('lead_id', leadId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(8)

        const actLines = (acts || []).map(
          (a) =>
            `[${a.activity_type}] ${new Date(a.created_at).toLocaleString('vi-VN')}: ${a.description || ''}`
        )
        leadContext = formatLeadContext(lead as Record<string, unknown>, actLines)

        // Default prompt augmentation for structured modes
      }
    }
  }

  if (taskType === 'tutor') {
    void (async () => {
      try {
        const admin = createAdminClient()
        await admin.from('student_ai_chats').insert({
          org_id: orgId,
          student_id: user.id,
          class_id: classId ?? null,
          task_type: 'tutor',
          question: prompt.slice(0, 2000),
        })
      } catch {
        /* ignore */
      }
    })()
  }

  try {
    const tenantConfig = await getAIConfig(orgId)
    const aiModel = buildChatModel(tenantConfig)
    if (!aiModel) {
      return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
    }

    const embeddingKey =
      tenantConfig.provider === 'openai' && tenantConfig.apiKey
        ? tenantConfig.apiKey
        : process.env.OPENAI_API_KEY

    let context = '(Chưa có tài liệu nào trong kho tri thức của cơ sở)'
    if (embeddingKey) {
      const embeddingClient = createOpenAI({ apiKey: embeddingKey })
      const embedQuery =
        taskType === 'crm_assist' && leadContext
          ? `${prompt}\n${leadContext.slice(0, 800)}`
          : prompt
      const { embedding } = await embed({
        model: embeddingClient.embedding('text-embedding-3-small'),
        value: embedQuery,
        abortSignal: AbortSignal.timeout(30_000),
      })

      const { data: materials, error: rpcError } = await supabase.rpc(
        'match_lesson_materials',
        {
          query_embedding: embedding,
          p_org_id: orgId,
          filter_class_id: ragClassId,
          match_count: taskType === 'tutor' ? 5 : taskType === 'crm_assist' ? 10 : 8,
        }
      )
      if (rpcError) {
        console.error('[AI Copilot] Lỗi RPC match_lesson_materials:', rpcError.message)
        return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
      }

      let found = (materials as MatchedMaterial[] | null) ?? []
      if (taskType === 'crm_assist') {
        found = prioritizeAdmissionsMaterials(found)
      }
      if (found.length > 0) {
        context = found
          .map((m, i) => `[Tài liệu ${i + 1}] ${m.content}`)
          .join('\n---\n')
      }
    }

    let finalPrompt = prompt
    if (taskType === 'crm_assist') {
      if (mode === 'summarize') {
        finalPrompt =
          prompt.trim() ||
          'Hãy tóm tắt hồ sơ lead và nhật ký chăm sóc, đề xuất bước tiếp theo.'
      } else if (mode === 'counsel_script') {
        finalPrompt =
          prompt.trim() ||
          'Soạn kịch bản gọi điện tư vấn phù hợp hồ sơ lead và tài liệu tuyển sinh.'
      } else if (mode === 'draft_followup') {
        finalPrompt =
          prompt.trim() ||
          'Soạn tin nhắn follow-up ngắn để chốt lịch hẹn / nhắc đăng ký.'
      }
    }

    const result = streamText({
      model: aiModel,
      system: buildSystemPrompt(taskType, context, {
        leadContext,
        crmTone,
        crmNote,
        mode,
      }),
      prompt: finalPrompt,
      abortSignal: AbortSignal.timeout(55_000),
    })

    return result.toDataStreamResponse({
      getErrorMessage: () => AI_MAINTENANCE_MESSAGE,
    })
  } catch (error) {
    console.error(
      '[AI Copilot] Tầng AI gặp sự cố:',
      error instanceof Error ? error.message : error
    )
    return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
  }
}
