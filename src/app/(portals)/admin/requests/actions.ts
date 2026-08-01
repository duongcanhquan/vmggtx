'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseFormSchema, type TicketFormField } from '@/lib/utils/ticketSchema'

// ============================================================
// WORKFLOW PHÊ DUYỆT E-TICKETING (/admin/requests) - migration 032
// - Kanban board: pending -> in_progress -> approved/rejected -> resolved
// - Approve/Reject ghi vào ticket_approvals (ai duyệt + lý do),
//   người gửi thấy ngay phản hồi ở cổng dịch vụ của mình.
// - Quản lý DANH MỤC MẪU ĐƠN: tạo mẫu mới với form_schema động.
// [ĐA TẦNG] SSR client -> RLS subtree quyết định phạm vi thấy/duyệt.
// ============================================================

const APPROVER_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type TicketStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'resolved'

export type BoardTicket = {
  id: string
  status: TicketStatus
  categoryName: string
  requesterName: string
  requesterRole: string
  assignedToName: string | null
  payload: Record<string, string>
  fieldLabels: Record<string, string>
  createdAt: string
  lastComment: string | null
}

export type BoardCategory = {
  id: string
  name: string
  description: string | null
  audience: 'all' | 'students' | 'teachers'
  active: boolean
  fields: TicketFormField[]
}

export type TicketBoard = {
  tickets: BoardTicket[]
  categories: BoardCategory[]
}

type ActionResult = { error: string } | { error?: undefined }

async function requireApprover(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string | null; role: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !APPROVER_ROLES.includes(profile.role)) {
    return { error: 'Chức năng này dành cho Quản lý cơ sở / Giáo vụ.' }
  }
  return { userId: user.id, orgId: profile.org_id, role: profile.role }
}

const pickName = (value: unknown): string | null => {
  const obj = Array.isArray(value) ? value[0] : value
  return (obj as { full_name?: string; name?: string } | null)?.full_name ??
    (obj as { name?: string } | null)?.name ??
    null
}

/** Toàn bộ tickets + danh mục trong phạm vi RLS của người duyệt */
export async function getTicketBoard(): Promise<
  { error: string } | { error?: undefined; board: TicketBoard }
> {
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const [ticketsResult, categoriesResult] = await Promise.all([
      supabase
        .from('tickets')
        .select(
          `id, status, payload, created_at,
           ticket_categories(name, form_schema),
           requester:profiles!tickets_requester_id_fkey(full_name, role),
           assignee:profiles!tickets_assigned_to_fkey(full_name),
           ticket_approvals(comments, created_at)`
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('ticket_categories')
        .select('id, name, description, audience, active, form_schema')
        .is('deleted_at', null)
        .order('name'),
    ])

    if (ticketsResult.error) {
      if (/tickets|does not exist/i.test(ticketsResult.error.message)) {
        return {
          error: 'Cổng dịch vụ chưa sẵn sàng: database chưa chạy migration 032_ticketing_workflows.sql.',
        }
      }
      return { error: ticketsResult.error.message }
    }

    const tickets: BoardTicket[] = (ticketsResult.data ?? []).map((row) => {
      const category = (Array.isArray(row.ticket_categories)
        ? row.ticket_categories[0]
        : row.ticket_categories) as unknown as { name?: string; form_schema?: unknown } | null
      const requester = (Array.isArray(row.requester)
        ? row.requester[0]
        : row.requester) as unknown as { full_name?: string; role?: string } | null
      const approvals = ((row.ticket_approvals ?? []) as {
        comments: string | null
        created_at: string
      }[])
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

      const fieldLabels: Record<string, string> = {}
      for (const field of parseFormSchema(category?.form_schema)) {
        fieldLabels[field.key] = field.label
      }

      return {
        id: row.id,
        status: row.status as TicketStatus,
        categoryName: category?.name ?? 'Đơn khác',
        requesterName: requester?.full_name ?? 'Người dùng',
        requesterRole: requester?.role ?? '',
        assignedToName: pickName(row.assignee),
        payload: (row.payload ?? {}) as Record<string, string>,
        fieldLabels,
        createdAt: row.created_at,
        lastComment: approvals.find((a) => a.comments)?.comments ?? null,
      }
    })

    const categories: BoardCategory[] = (categoriesResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      audience: row.audience as BoardCategory['audience'],
      active: row.active,
      fields: parseFormSchema(row.form_schema),
    }))

    return { board: { tickets, categories } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Nhận xử lý: pending -> in_progress, gán assigned_to = người bấm */
export async function claimTicket(ticketId: string): Promise<ActionResult> {
  if (!ticketId) return { error: 'Thiếu mã đơn.' }
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error, count } = await supabase
      .from('tickets')
      .update({ status: 'in_progress', assigned_to: auth.userId }, { count: 'exact' })
      .eq('id', ticketId)
      .eq('status', 'pending')
    if (error) return { error: `Không nhận được đơn: ${error.message}` }
    if (count === 0) return { error: 'Đơn đã được người khác nhận hoặc không còn ở trạng thái chờ.' }

    revalidatePath('/admin/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * DUYỆT / TỪ CHỐI: ghi ticket_approvals (approver + lý do) rồi đổi
 * trạng thái ticket. Từ chối BẮT BUỘC có lý do để người gửi hiểu.
 */
export async function decideTicket(
  ticketId: string,
  decision: 'approved' | 'rejected',
  comments: string
): Promise<ActionResult> {
  if (!ticketId) return { error: 'Thiếu mã đơn.' }
  const trimmed = comments.trim()
  if (decision === 'rejected' && trimmed.length < 3) {
    return { error: 'Từ chối cần ghi rõ lý do để người gửi nắm được.' }
  }
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, status')
      .eq('id', ticketId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!ticket) return { error: 'Đơn không tồn tại hoặc ngoài phạm vi.' }
    if (ticket.status !== 'pending' && ticket.status !== 'in_progress') {
      return { error: 'Đơn này đã được quyết định trước đó.' }
    }

    const { error: approvalError } = await supabase.from('ticket_approvals').insert({
      ticket_id: ticketId,
      approver_id: auth.userId,
      status: decision,
      comments: trimmed ? trimmed.slice(0, 1000) : null,
    })
    if (approvalError) return { error: `Không ghi được phê duyệt: ${approvalError.message}` }

    const { error: statusError } = await supabase
      .from('tickets')
      .update({ status: decision, assigned_to: auth.userId })
      .eq('id', ticketId)
    if (statusError) return { error: `Đã ghi phê duyệt nhưng lỗi đổi trạng thái: ${statusError.message}` }

    revalidatePath('/admin/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Đóng hồ sơ: approved -> resolved (đã thực thi xong yêu cầu) */
export async function resolveTicket(ticketId: string): Promise<ActionResult> {
  if (!ticketId) return { error: 'Thiếu mã đơn.' }
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error, count } = await supabase
      .from('tickets')
      .update({ status: 'resolved' }, { count: 'exact' })
      .eq('id', ticketId)
      .eq('status', 'approved')
    if (error) return { error: `Không đóng được hồ sơ: ${error.message}` }
    if (count === 0) return { error: 'Chỉ đóng được đơn ĐÃ DUYỆT.' }

    revalidatePath('/admin/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Tạo mẫu đơn mới với form_schema động (không cần sửa code) */
export async function createTicketCategory(
  name: string,
  description: string,
  audience: 'all' | 'students' | 'teachers',
  fields: TicketFormField[]
): Promise<ActionResult> {
  const trimmedName = name.trim()
  if (trimmedName.length < 3) return { error: 'Tên mẫu đơn cần ít nhất 3 ký tự.' }
  if (fields.length === 0) return { error: 'Mẫu đơn cần ít nhất 1 trường thông tin.' }
  if (fields.some((f) => !f.key.trim() || !f.label.trim())) {
    return { error: 'Mỗi trường cần đủ nhãn hiển thị.' }
  }
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }
    if (!auth.orgId) return { error: 'Tài khoản chưa gắn cơ sở — không xác định được nơi áp dụng mẫu đơn.' }

    const supabase = createClient()
    const { error } = await supabase.from('ticket_categories').insert({
      org_id: auth.orgId,
      name: trimmedName,
      description: description.trim() || null,
      audience,
      form_schema: fields,
      created_by: auth.userId,
    })
    if (error) return { error: `Không tạo được mẫu đơn: ${error.message}` }

    revalidatePath('/admin/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Bật/tắt mẫu đơn (tắt = ẩn khỏi cổng dịch vụ, đơn cũ giữ nguyên) */
export async function toggleTicketCategory(
  categoryId: string,
  active: boolean
): Promise<ActionResult> {
  if (!categoryId) return { error: 'Thiếu mã mẫu đơn.' }
  try {
    const auth = await requireApprover()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error } = await supabase
      .from('ticket_categories')
      .update({ active })
      .eq('id', categoryId)
    if (error) return { error: `Không cập nhật được mẫu đơn: ${error.message}` }

    revalidatePath('/admin/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
