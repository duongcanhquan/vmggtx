'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  FileSignature,
  Inbox,
  MessageSquareQuote,
  Send,
  TicketCheck,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { TICKET_STATUS_META, type TicketFormField } from '@/lib/utils/ticketSchema'
import {
  getServiceDesk,
  submitTicket,
  type MyTicket,
  type ServiceCategory,
} from '@/app/(portals)/student/requests/actions'

// ============================================================
// CỔNG DỊCH VỤ dùng chung cho Student/Teacher Portal.
// - Chọn loại đơn -> UI form SINH ĐỘNG từ form_schema (jsonb).
// - Gửi xong theo dõi trạng thái + phản hồi của người duyệt
//   ngay tại đây (kèm toast khi có kết quả mới).
// ============================================================

const RESULT_SEEN_KEY = 'gdtx-ticket-results-seen'

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: TicketFormField
  value: string
  onChange: (value: string) => void
}) {
  const base =
    'mt-1.5 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <label className="block text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-0.5 text-rose-500">*</span>}
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={field.placeholder}
          className={`${base} py-2.5`}
        />
      ) : field.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${base} min-h-11`}>
          <option value="">— Chọn —</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={2000}
          placeholder={field.placeholder}
          className={`${base} min-h-11`}
        />
      )}
    </label>
  )
}

export function ServiceDesk({ audience }: { audience: 'students' | 'teachers' }) {
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [myTickets, setMyTickets] = useState<MyTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ServiceCategory | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(async () => {
    const result = await getServiceDesk(audience)
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setCategories(result.data.categories)
      setMyTickets(result.data.myTickets)

      // Toast khi có kết quả duyệt MỚI kể từ lần xem trước
      try {
        const seenRaw = localStorage.getItem(RESULT_SEEN_KEY)
        const seen: string[] = seenRaw ? JSON.parse(seenRaw) : []
        const decided = result.data.myTickets.filter(
          (t) => t.status === 'approved' || t.status === 'rejected' || t.status === 'resolved'
        )
        const fresh = decided.find((t) => !seen.includes(`${t.id}:${t.status}`))
        if (fresh) {
          setToast({
            type: fresh.status === 'rejected' ? 'error' : 'success',
            message: `Đơn "${fresh.categoryName}" đã có kết quả: ${TICKET_STATUS_META[fresh.status].label}${
              fresh.decisionComment ? ` — ${fresh.decisionComment}` : ''
            }`,
          })
        }
        localStorage.setItem(
          RESULT_SEEN_KEY,
          JSON.stringify(decided.map((t) => `${t.id}:${t.status}`).slice(0, 100))
        )
      } catch {
        // localStorage bị chặn (private mode) -> bỏ qua, không chặn UI
      }
    }
    setLoading(false)
  }, [audience])

  useEffect(() => {
    void load()
  }, [load])

  // key -> label (đọc từ form_schema) để hiển thị payload thân thiện
  const fieldLabels: Record<string, string> = {}
  for (const category of categories) {
    for (const field of category.fields) {
      fieldLabels[field.key] = field.label
    }
  }

  const openForm = (category: ServiceCategory) => {
    setSelected(category)
    setValues({})
    setFormError(null)
  }

  const submit = async () => {
    if (!selected) return
    setSending(true)
    setFormError(null)
    const result = await submitTicket(selected.id, values)
    setSending(false)
    if (result.error !== undefined) {
      setFormError(result.error)
      return
    }
    setSelected(null)
    setToast({ type: 'success', message: 'Đã gửi đơn — bộ phận phụ trách sẽ xử lý sớm nhất.' })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <TicketCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          Cổng dịch vụ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gửi yêu cầu (nghỉ phép, phúc khảo, hoàn phí…) và theo dõi kết quả duyệt tại đây.
        </p>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : selected ? (
        /* ===== Form động theo form_schema ===== */
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Chọn loại đơn khác
          </button>
          <h2 className="mt-3 font-heading text-lg font-bold">{selected.name}</h2>
          {selected.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{selected.description}</p>
          )}
          <div className="mt-4 space-y-3">
            {selected.fields.map((field) => (
              <DynamicField
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
              />
            ))}
            {selected.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Mẫu đơn này không yêu cầu thông tin thêm — bấm gửi để tạo đơn.
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {sending ? 'Đang gửi…' : 'Gửi đơn'}
          </button>
        </div>
      ) : (
        /* ===== Danh mục mẫu đơn ===== */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              Cơ sở chưa cấu hình mẫu đơn nào.
            </p>
          ) : (
            categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => openForm(category)}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <FileSignature className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {category.name}
                  </span>
                  {category.description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {category.description}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* ===== Đơn của tôi ===== */}
      {!loading && !loadError && (
        <section>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
            Đơn của tôi ({myTickets.length})
          </h2>
          {myTickets.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              Bạn chưa gửi đơn nào.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {myTickets.map((ticket) => {
                const meta = TICKET_STATUS_META[ticket.status]
                return (
                  <li key={ticket.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{ticket.categoryName}</p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Gửi lúc {new Date(ticket.createdAt).toLocaleString('vi-VN')}
                    </p>
                    {Object.entries(ticket.payload).length > 0 && (
                      <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {Object.entries(ticket.payload).map(([key, value]) => (
                          <div key={key} className="flex gap-1.5">
                            <dt className="shrink-0 font-medium">{fieldLabels[key] ?? key}:</dt>
                            <dd className="min-w-0 break-words">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {ticket.decisionComment && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-foreground">
                        <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
                        <span>
                          <span className="font-semibold">Phản hồi: </span>
                          {ticket.decisionComment}
                        </span>
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
