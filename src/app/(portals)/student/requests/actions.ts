'use server'

import { createClient } from '@/lib/supabase/server'
import {
  parseFormSchema,
  sanitizeTicketPayload,
  validateTicketPayload,
  type TicketFormField,
} from '@/lib/utils/ticketSchema'

// ============================================================
// CỔNG DỊCH VỤ (E-Ticketing) - phía NGƯỜI GỬI (HS/GV) - migration 032
// - Danh mục mẫu đơn lấy theo org của người đăng nhập (RLS
//   member_select), form UI sinh động từ form_schema (jsonb).
// - Submit -> insert tickets (RLS: requester_id = auth.uid()).
// - Người gửi theo dõi trạng thái + lý do duyệt/từ chối của staff.
// ============================================================

export type ServiceCategory = {
  id: string
  name: string
  description: string | null
  fields: TicketFormField[]
}

export type MyTicket = {
  id: string
  categoryName: string
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'resolved'
  payload: Record<string, string>
  createdAt: string
  /** Phản hồi mới nhất của người duyệt (lý do duyệt / từ chối) */
  decisionComment: string | null
}

export type ServiceDeskData = {
  categories: ServiceCategory[]
  myTickets: MyTicket[]
}

/** Danh mục mẫu đơn + đơn của tôi. audience = cổng đang đứng (students/teachers) */
export async function getServiceDesk(
  audience: 'students' | 'teachers'
): Promise<{ error: string } | { error?: undefined; data: ServiceDeskData }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const [categoriesResult, ticketsResult] = await Promise.all([
      supabase
        .from('ticket_categories')
        .select('id, name, description, audience, form_schema')
        .in('audience', ['all', audience])
        .eq('active', true)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('tickets')
        .select(
          'id, status, payload, created_at, ticket_categories(name), ticket_approvals(comments, created_at)'
        )
        .eq('requester_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (categoriesResult.error) {
      if (/ticket_categories|does not exist/i.test(categoriesResult.error.message)) {
        return {
          error: 'Cổng dịch vụ chưa sẵn sàng: database chưa chạy migration 032_ticketing_workflows.sql.',
        }
      }
      return { error: categoriesResult.error.message }
    }

    const categories: ServiceCategory[] = (categoriesResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      fields: parseFormSchema(row.form_schema),
    }))

    const myTickets: MyTicket[] = (ticketsResult.data ?? []).map((row) => {
      const category = Array.isArray(row.ticket_categories)
        ? row.ticket_categories[0]
        : row.ticket_categories
      const approvals = ((row.ticket_approvals ?? []) as {
        comments: string | null
        created_at: string
      }[])
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      return {
        id: row.id,
        categoryName: (category as { name?: string } | null)?.name ?? 'Đơn khác',
        status: row.status as MyTicket['status'],
        payload: (row.payload ?? {}) as Record<string, string>,
        createdAt: row.created_at,
        decisionComment: approvals.find((a) => a.comments)?.comments ?? null,
      }
    })

    return { data: { categories, myTickets } }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Gửi đơn: validate payload theo form_schema ở SERVER rồi insert tickets */
export async function submitTicket(
  categoryId: string,
  payload: Record<string, string>
): Promise<{ error: string } | { error?: undefined }> {
  if (!categoryId) return { error: 'Vui lòng chọn loại đơn.' }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // RLS member_select: chỉ thấy category active thuộc org của mình
    const { data: category } = await supabase
      .from('ticket_categories')
      .select('id, org_id, form_schema')
      .eq('id', categoryId)
      .maybeSingle()
    if (!category) return { error: 'Mẫu đơn không tồn tại hoặc đã bị tắt.' }

    const fields = parseFormSchema(category.form_schema)
    const validationError = validateTicketPayload(fields, payload)
    if (validationError) return { error: validationError }

    const { error } = await supabase.from('tickets').insert({
      org_id: category.org_id,
      category_id: categoryId,
      requester_id: user.id,
      status: 'pending',
      payload: sanitizeTicketPayload(fields, payload),
    })
    if (error) {
      if (/tickets|does not exist/i.test(error.message) && /relation/i.test(error.message)) {
        return { error: 'Cổng dịch vụ chưa sẵn sàng (thiếu migration 032).' }
      }
      return { error: `Không gửi được đơn: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
