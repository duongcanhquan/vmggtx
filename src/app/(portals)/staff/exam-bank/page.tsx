'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BookMarked,
  Clock,
  FileText,
  Loader2,
  Plus,
  Save,
  SearchX,
  Trash2,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  createExamBankItem,
  deleteExamBankItem,
  getExamBank,
  type ExamBankItem,
} from './actions'

// ============================================================
// NGÂN HÀNG ĐỀ (Staff Portal) - kho đề thi/đề kiểm tra của cơ sở.
// ============================================================

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export default function ExamBankPage() {
  const [items, setItems] = useState<ExamBankItem[]>([])
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getExamBank()
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setItems(result.items)
    setSubjects(result.subjects)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await createExamBankItem(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã thêm đề vào ngân hàng.' })
    setModalOpen(false)
    void loadData()
  }

  async function handleDelete(item: ExamBankItem) {
    if (!window.confirm(`Xóa đề "${item.title}" khỏi ngân hàng?`)) return
    setDeletingId(item.id)
    const result = await deleteExamBankItem(item.id)
    setDeletingId(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã xóa đề thi.' })
    void loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
          <BookMarked className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Ngân hàng đề
        </h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm đề mới
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Đang tải ngân hàng đề…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Chưa có đề nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base font-bold text-slate-900">{item.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-600">
                      {item.subjectName}
                    </span>
                    {item.gradeLevel && <span>{item.gradeLevel}</span>}
                    {item.durationMinutes !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {item.durationMinutes} phút
                      </span>
                    )}
                    <span>Tạo {dateFmt.format(new Date(item.createdAt))}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60"
                  aria-label={`Xóa đề ${item.title}`}
                >
                  {deletingId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              {item.description && (
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              )}

              {item.content && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {expandedId === item.id ? 'Thu gọn nội dung' : 'Xem nội dung đề'}
                  </button>
                  {expandedId === item.id && (
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                      {item.content}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal thêm đề */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreate}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">Thêm đề mới</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Tiêu đề đề thi
              <input
                name="title"
                required
                minLength={3}
                maxLength={200}
                placeholder="Tên đề thi…"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Môn học
                <select
                  name="subjectId"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— Chưa gắn môn —</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Thời lượng (phút)
                <input
                  name="durationMinutes"
                  type="number"
                  min={5}
                  max={600}
                  placeholder="VD: 45"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Khối / cấp độ
              <input
                name="gradeLevel"
                maxLength={60}
                placeholder="VD: Lớp 12"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Mô tả ngắn
              <input
                name="description"
                maxLength={500}
                placeholder="Mô tả ngắn…"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Nội dung đề (hoặc link tài liệu)
              <textarea
                name="content"
                rows={6}
                maxLength={20000}
                placeholder="Nội dung hoặc link…"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Lưu vào ngân hàng
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
