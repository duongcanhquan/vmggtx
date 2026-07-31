/**
 * Tích hợp n8n qua Webhook.
 * Dùng để bắn thông báo tự động (Zalo/SMS/Email...) khi học viên vắng không phép.
 */

type AbsencePayload = {
  event: 'student_absence'
  sessionId: string
  date: string
  absentStudentIds: string[]
}

export type ParentWarningNotification = {
  warningId: string
  studentId: string
  studentName: string
  studentPhone: string | null
  className: string
  warningType: 'attendance' | 'grade'
  description: string
}

type ParentWarningPayload = {
  event: 'parent_warning_zalo'
  sentAt: string
  warnings: ParentWarningNotification[]
}

/**
 * Gửi danh sách học viên vắng KHÔNG PHÉP tới n8n Webhook.
 * Hàm này được gọi dạng fire-and-forget (không block luồng lưu điểm danh),
 * vì vậy mọi lỗi chỉ log lại, không ném ra ngoài.
 */
export async function notifyAbsenceToN8n(
  studentIds: string[],
  sessionId: string,
  date: string
): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[n8n] Bỏ qua thông báo vắng mặt: chưa cấu hình N8N_WEBHOOK_URL')
    return
  }

  if (studentIds.length === 0) return

  const payload: AbsencePayload = {
    event: 'student_absence',
    sessionId,
    date,
    absentStudentIds: studentIds,
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Không để webhook chậm kéo dài request
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error(`[n8n] Webhook trả về lỗi HTTP ${response.status}`)
    }
  } catch (err) {
    console.error('[n8n] Không gửi được thông báo vắng mặt:', err)
  }
}

/**
 * Bắn cảnh báo học vụ (vắng nhiều / học yếu) sang n8n để n8n gửi
 * tin nhắn Zalo cho Phụ huynh.
 *
 * Trả về true/false để Server Action biết có cập nhật status
 * cảnh báo thành 'notified' hay không (khác notifyAbsenceToN8n
 * vốn là fire-and-forget).
 */
export async function notifyParentWarningsToN8n(
  warnings: ParentWarningNotification[]
): Promise<{ ok: boolean; message: string }> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL

  if (!webhookUrl) {
    return {
      ok: false,
      message: 'Chưa cấu hình N8N_WEBHOOK_URL - không thể gửi Zalo cho phụ huynh.',
    }
  }
  if (warnings.length === 0) {
    return { ok: false, message: 'Không có cảnh báo nào để gửi.' }
  }

  const payload: ParentWarningPayload = {
    event: 'parent_warning_zalo',
    sentAt: new Date().toISOString(),
    warnings,
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return { ok: false, message: `n8n webhook trả về lỗi HTTP ${response.status}.` }
    }
    return { ok: true, message: `Đã gửi ${warnings.length} cảnh báo sang n8n (Zalo).` }
  } catch (err) {
    console.error('[n8n] Không gửi được cảnh báo phụ huynh:', err)
    return { ok: false, message: 'Không kết nối được n8n webhook.' }
  }
}
