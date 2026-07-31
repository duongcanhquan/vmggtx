'use server'

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'
import {
  evaluationSubmitSchema,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'

// ============================================================
// submitEvaluation(token, evaluationData) - Học sinh gửi đánh giá
// giáo viên ẨN DANH (migration 022).
//
// B1. Verify token (không tồn tại / is_used = true -> "Mã không hợp lệ")
// B2. Lấy class_id -> teacher_id, đánh dấu is_used = true
//     (CLAIM NGUYÊN TỬ: update ... where is_used=false - 2 request
//     đua nhau chỉ 1 request thắng)
// B3. [AI FILTER] feedback_text đi qua gpt-4o-mini để lọc ngôn từ
//     độc hại -> { isToxic, cleanText }
// B4. Insert kết quả (text đã clean) bằng ADMIN CLIENT - RLS cố tình
//     không có policy insert nên chỉ Service Role ghi được.
//
// ẨN DANH: dòng insert KHÔNG chứa student_id.
// ============================================================

const toxicFilterSchema = z.object({
  isToxic: z.boolean(),
  cleanText: z.string(),
})

/**
 * [AI FILTER] Lọc ngôn từ chửi bới/xúc phạm khỏi ý kiến tự do.
 * AI lỗi (thiếu key, quota...) -> giữ nguyên văn bản gốc, KHÔNG
 * chặn học sinh gửi đánh giá.
 */
async function filterToxicFeedback(
  feedback: string,
  orgId: string
): Promise<{ isToxic: boolean; cleanText: string }> {
  try {
    const aiConfig = await getAIConfig(orgId)
    const apiKey =
      aiConfig.provider === 'openai' && aiConfig.apiKey
        ? aiConfig.apiKey
        : process.env.OPENAI_API_KEY
    if (!apiKey) return { isToxic: false, cleanText: feedback }

    const openaiClient = createOpenAI({ apiKey })
    const { object } = await generateObject({
      model: openaiClient('gpt-4o-mini'),
      schema: toxicFilterSchema,
      prompt: `Phân tích đoạn text sau (ý kiến học sinh đánh giá giáo viên, tiếng Việt):
"""
${feedback}
"""
Trả về JSON { isToxic: boolean, cleanText: string }.
Nếu có ngôn từ chửi bới, xúc phạm, tục tĩu: đặt isToxic = true và loại bỏ/thay thế các từ đó trong cleanText (giữ nguyên phần góp ý hợp lệ).
Nếu văn bản sạch: isToxic = false và cleanText giữ nguyên văn bản gốc.`,
    })
    return {
      isToxic: object.isToxic,
      cleanText: object.cleanText.trim() || feedback,
    }
  } catch {
    // AI bảo trì -> không chặn luồng đánh giá
    return { isToxic: false, cleanText: feedback }
  }
}

/**
 * Học sinh nộp đánh giá bằng token dùng-1-lần.
 *
 * LUỒNG PUBLIC (link gửi Zalo /evaluations/[token]): KHÔNG bắt đăng
 * nhập - bản thân token là "chìa khóa" bí mật (ngẫu nhiên, dùng 1
 * lần, phát riêng cho từng học sinh). Chống spam bằng CLAIM nguyên
 * tử + khung thời gian đợt khảo sát.
 */
export async function submitEvaluation(
  token: string,
  evaluationData: unknown
): Promise<ActionResult> {
  // Gộp token + data để dùng chung 1 schema Zod
  const parsed = evaluationSubmitSchema.safeParse({
    token,
    ...(typeof evaluationData === 'object' && evaluationData !== null
      ? evaluationData
      : {}),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const admin = createAdminClient()

    // ===== B1 + B2: verify + CLAIM token nguyên tử =====
    const { data: claimed } = await admin
      .from('evaluation_tokens')
      .update({ is_used: true })
      .eq('token', values.token.toUpperCase())
      .eq('is_used', false)
      .select('id, campaign_id, class_id')
      .maybeSingle()
    if (!claimed) {
      return { error: 'Mã không hợp lệ.' }
    }

    /** Trả token lại nếu các bước sau thất bại - không "đốt" mã oan */
    const rollbackToken = () =>
      admin.from('evaluation_tokens').update({ is_used: false }).eq('id', claimed.id)

    // Đợt khảo sát phải đang mở
    const { data: campaign } = await admin
      .from('evaluation_campaigns')
      .select('id, status, start_date, end_date')
      .eq('id', claimed.campaign_id)
      .is('deleted_at', null)
      .maybeSingle()
    const today = new Date().toISOString().slice(0, 10)
    if (
      !campaign ||
      campaign.status !== 'active' ||
      today < (campaign.start_date as string) ||
      today > (campaign.end_date as string)
    ) {
      await rollbackToken()
      return { error: 'Đợt khảo sát đã đóng hoặc ngoài thời gian cho phép.' }
    }

    // class_id -> teacher_id + org_id
    const { data: cls } = await admin
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', claimed.class_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls?.teacher_id) {
      await rollbackToken()
      return { error: 'Lớp học không còn tồn tại hoặc chưa gán giáo viên.' }
    }

    // ===== B3: AI FILTER ngôn từ độc hại =====
    let feedbackText: string | null = values.feedbackText || null
    if (feedbackText) {
      const filtered = await filterToxicFeedback(feedbackText, cls.org_id)
      feedbackText = filtered.cleanText || null
    }

    // ===== B4: INSERT ẨN DANH bằng Admin Client (Service Role) =====
    const { error: insertError } = await admin.from('evaluation_results').insert({
      campaign_id: claimed.campaign_id,
      class_id: claimed.class_id,
      teacher_id: cls.teacher_id,
      org_id: cls.org_id,
      rating_teaching: values.ratingTeaching,
      rating_attitude: values.ratingAttitude,
      rating_punctuality: values.ratingPunctuality,
      feedback_text: feedbackText,
    })
    if (insertError) {
      await rollbackToken()
      return { error: `Không thể lưu đánh giá: ${insertError.message}` }
    }

    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi gửi đánh giá.',
    }
  }
}
