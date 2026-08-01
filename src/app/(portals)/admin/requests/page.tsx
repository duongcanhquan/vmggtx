'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Hand,
  LayoutList,
  ListPlus,
  Plus,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  TicketCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { TICKET_STATUS_META, type TicketFormField } from '@/lib/utils/ticketSchema'
import {
  claimTicket,
  createTicketCategory,
  decideTicket,
  getTicketBoard,
  resolveTicket,
  toggleTicketCategory,
  type BoardTicket,
  type TicketBoard,
  type TicketStatus,
} from './actions'

// ============================================================
// Kanban phê duyệt E-Ticketing (/admin/requests)
// Cột: Chờ xử lý -> Đang xử lý -> Đã duyệt / Từ chối -> Hoàn tất.
// Approve/Reject kèm lý do -> người gửi thấy phản hồi ở cổng
// dịch vụ. Kèm phần QUẢN LÝ MẪU ĐƠN (form_schema động).
// ============================================================

const COLUMNS: TicketStatus[] = ['pending', 'in_progress', 'approved', 'rejected', 'resolved']

const ROLE_LABEL: Record<string, string> = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  parent: 'Phụ huynh',
  academic_staff: 'Giáo vụ',
  admission_staff: 'Tuyển sinh',
  campus_admin: 'QL cơ sở',
}

const FIELD_TYPE_OPTIONS: { value: TicketFormField['type']; label: string }[] = [
  { value: 'text', label: 'Chữ ngắn' },
  { value: 'textarea', label: 'Đoạn văn' },
  { value: 'date', label: 'Ngày' },
  { value: 'number', label: 'Số' },
]

function slugifyKey(label: string, index: number): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || `field_${index + 1}`
}

// ---------- Modal duyệt / từ chối ----------
function DecisionModal({
  ticket,
  decision,
  onClose,
  onDone,
}: {
  ticket: BoardTicket
  decision: 'approved' | 'rejected'
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isReject = decision === 'rejected'

  const submit = async () => {
    setSaving(true)
    setError(null)
    const result = await decideTicket(ticket.id, decision, comment)
    setSaving(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone(isReject ? 'Đã từ chối đơn — người gửi nhận được lý do.' : 'Đã duyệt đơn.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-bold">
            {isReject ? 'Từ chối đơn' : 'Duyệt đơn'}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {ticket.categoryName} · {ticket.requesterName}
        </p>

        <label className="mt-4 block text-sm font-medium">
          {isReject ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú cho người gửi (tùy chọn)'}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={isReject ? 'VD: Thiếu minh chứng, vui lòng bổ sung...' : 'VD: Đã duyệt, liên hệ văn phòng để hoàn tất...'}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || (isReject && comment.trim().length < 3)}
          className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 ${
            isReject ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {isReject ? (
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? 'Đang lưu…' : isReject ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
        </button>
      </div>
    </div>
  )
}

// ---------- Quản lý mẫu đơn ----------
function CategoryManager({
  board,
  onChanged,
  onToast,
}: {
  board: TicketBoard
  onChanged: () => void
  onToast: (toast: ToastData) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<'all' | 'students' | 'teachers'>('all')
  const [rows, setRows] = useState<{ label: string; type: TicketFormField['type']; required: boolean }[]>([
    { label: '', type: 'text', required: true },
  ])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const fields: TicketFormField[] = rows
      .filter((row) => row.label.trim())
      .map((row, index) => ({
        key: slugifyKey(row.label, index),
        label: row.label.trim(),
        type: row.type,
        required: row.required,
      }))
    const result = await createTicketCategory(name, description, audience, fields)
    setSaving(false)
    if (result.error !== undefined) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã tạo mẫu đơn mới — hiển thị ngay trên cổng dịch vụ.' })
    setName('')
    setDescription('')
    setRows([{ label: '', type: 'text', required: true }])
    onChanged()
  }

  const handleToggle = async (categoryId: string, active: boolean) => {
    const result = await toggleTicketCategory(categoryId, active)
    if (result.error !== undefined) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onChanged()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="flex items-center gap-2 font-heading text-base font-bold">
          <Settings2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Quản lý mẫu đơn ({board.categories.length})
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-2">
          {/* Danh sách mẫu đơn hiện có */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <LayoutList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Mẫu đơn hiện có
            </h3>
            <ul className="mt-2.5 space-y-2">
              {board.categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${category.active ? '' : 'text-muted-foreground line-through'}`}>
                      {category.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {category.audience === 'all'
                        ? 'HS + GV'
                        : category.audience === 'students'
                          ? 'Học sinh'
                          : 'Giáo viên'}{' '}
                      · {category.fields.length} trường
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(category.id, !category.active)}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      category.active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {category.active ? 'Đang bật' : 'Đã tắt'}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Tạo mẫu đơn mới - builder form_schema */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <ListPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Tạo mẫu đơn mới
            </h3>
            <div className="mt-2.5 space-y-2.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên mẫu đơn (VD: Xin cấp lại thẻ học viên)"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả ngắn (tùy chọn)"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Dành cho: Học sinh + Giáo viên</option>
                <option value="students">Dành cho: Học sinh</option>
                <option value="teachers">Dành cho: Giáo viên</option>
              </select>

              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, label: e.target.value } : r))
                      )
                    }
                    placeholder={`Trường ${index + 1} (VD: Lý do)`}
                    className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <select
                    value={row.type}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, type: e.target.value as TicketFormField['type'] } : r
                        )
                      )
                    }
                    className="min-h-10 w-28 shrink-0 rounded-xl border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.required}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, required: e.target.checked } : r))
                        )
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    Bắt buộc
                  </label>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      aria-label="Xóa trường"
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRows((prev) => [...prev, { label: '', type: 'text', required: false }])}
                  className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm trường
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving || name.trim().length < 3}
                  className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Đang tạo…' : 'Tạo mẫu đơn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------- Trang chính: Kanban ----------
export default function AdminRequestsPage() {
  const [board, setBoard] = useState<TicketBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [decision, setDecision] = useState<{
    ticket: BoardTicket
    decision: 'approved' | 'rejected'
  } | null>(null)

  const load = useCallback(async () => {
    const result = await getTicketBoard()
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setBoard(result.board)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byStatus = useMemo(() => {
    const groups: Record<TicketStatus, BoardTicket[]> = {
      pending: [],
      in_progress: [],
      approved: [],
      rejected: [],
      resolved: [],
    }
    for (const ticket of board?.tickets ?? []) {
      groups[ticket.status].push(ticket)
    }
    return groups
  }, [board])

  const runAction = async (action: () => Promise<{ error?: string }>, successMessage: string) => {
    const result = await action()
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: successMessage })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <TicketCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          Cổng dịch vụ — Phê duyệt
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kanban đơn/yêu cầu của học sinh &amp; giáo viên. Duyệt / từ chối kèm lý do — người
          gửi nhận phản hồi ngay trên cổng của họ.
        </p>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : board ? (
        <>
          <CategoryManager board={board} onChanged={() => void load()} onToast={setToast} />

          {/* ===== Kanban board ===== */}
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1100px] grid-cols-5 gap-3">
              {COLUMNS.map((status) => {
                const meta = TICKET_STATUS_META[status]
                const tickets = byStatus[status]
                return (
                  <section
                    key={status}
                    aria-label={meta.label}
                    className="rounded-2xl border border-border bg-muted/40 p-3"
                  >
                    <h2 className="flex items-center justify-between px-1 text-sm font-bold">
                      <span>{meta.label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                        {tickets.length}
                      </span>
                    </h2>
                    <ul className="mt-2.5 space-y-2.5">
                      {tickets.length === 0 ? (
                        <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                          Trống
                        </li>
                      ) : (
                        tickets.map((ticket) => (
                          <li key={ticket.id} className="rounded-xl border border-border bg-surface p-3 shadow-sm">
                            <p className="text-sm font-semibold">{ticket.categoryName}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {ticket.requesterName}
                              {ROLE_LABEL[ticket.requesterRole] && (
                                <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
                                  {ROLE_LABEL[ticket.requesterRole]}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(ticket.createdAt).toLocaleString('vi-VN')}
                            </p>

                            {Object.entries(ticket.payload).length > 0 && (
                              <dl className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
                                {Object.entries(ticket.payload).map(([key, value]) => (
                                  <div key={key} className="flex gap-1">
                                    <dt className="shrink-0 font-medium">
                                      {ticket.fieldLabels[key] ?? key}:
                                    </dt>
                                    <dd className="min-w-0 break-words">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}

                            {ticket.assignedToName && (
                              <p className="mt-1.5 text-[11px] text-indigo-600">
                                Xử lý: {ticket.assignedToName}
                              </p>
                            )}
                            {ticket.lastComment && (
                              <p className="mt-1.5 rounded-lg bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                                {ticket.lastComment}
                              </p>
                            )}

                            {/* Hành động theo cột */}
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runAction(() => claimTicket(ticket.id), 'Đã nhận xử lý đơn.')
                                  }
                                  className="flex min-h-8 items-center gap-1 rounded-lg bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                >
                                  <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                                  Nhận xử lý
                                </button>
                              )}
                              {(status === 'pending' || status === 'in_progress') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setDecision({ ticket, decision: 'approved' })}
                                    className="flex min-h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                                    Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDecision({ ticket, decision: 'rejected' })}
                                    className="flex min-h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                                    Từ chối
                                  </button>
                                </>
                              )}
                              {status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runAction(() => resolveTicket(ticket.id), 'Đã đóng hồ sơ.')
                                  }
                                  className="flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Hoàn tất
                                </button>
                              )}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                )
              })}
            </div>
          </div>
        </>
      ) : null}

      {decision && (
        <DecisionModal
          ticket={decision.ticket}
          decision={decision.decision}
          onClose={() => setDecision(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            void load()
          }}
        />
      )}
    </div>
  )
}
