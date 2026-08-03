'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  EyeOff,
  Loader2,
  Plus,
  Unlock,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { ExamOpsTabs } from '@/components/shared/ExamOpsTabs'
import {
  createExamAssessment,
  listExamGradeClasses,
  setClassGradesPublished,
  type ExamClassGradeRow,
} from './actions'

export default function ExamGradesPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<ExamClassGradeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      setError('Chưa chọn đơn vị trên thanh tổ chức.')
      return
    }
    setLoading(true)
    const result = await listExamGradeClasses(orgId)
    setRows(result.data)
    setError(result.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handlePublish(classId: string, publish: boolean) {
    setBusyId(classId)
    const result = await setClassGradesPublished(classId, publish)
    setBusyId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: publish
        ? 'Đã công bố điểm — HV/PH có thể xem.'
        : 'Đã thu hồi công bố — HV/PH không còn thấy điểm.',
    })
    void reload()
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const fd = new FormData(event.currentTarget)
    const result = await createExamAssessment({
      classId: String(fd.get('classId') ?? ''),
      name: String(fd.get('name') ?? ''),
      weight: String(fd.get('weight') ?? '1'),
      maxScore: String(fd.get('maxScore') ?? '10'),
      isOfficialExam: fd.get('isOfficialExam') === 'on',
      examCode: String(fd.get('examCode') ?? ''),
      gradingDeadline: String(fd.get('gradingDeadline') ?? ''),
    })
    setSaving(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo cột điểm / kỳ thi.' })
    setShowForm(false)
    void reload()
  }

  return (
    <div className="space-y-5">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Quản lý &amp; công bố điểm</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Khảo thí giữ quyền cao nhất: tạo cột điểm chính thức, công bố hoặc thu hồi điểm
            trên cổng HV/PH. Chốt sổ (khóa) vẫn dùng màn Kỳ thi / Xét duyệt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tạo cột điểm
        </button>
      </div>

      <ExamOpsTabs />

      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"
        >
          <h2 className="text-sm font-bold text-indigo-950">Cột điểm / kỳ thi mới</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-semibold">
              Lớp học phần
              <select
                name="classId"
                required
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">— Chọn lớp —</option>
                {rows.map((row) => (
                  <option key={row.classId} value={row.classId}>
                    {row.className}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Tên cột / kỳ thi
              <input
                name="name"
                required
                placeholder="VD: Giữa kỳ 1 · Mã đề A"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Mã kỳ thi (tuỳ chọn)
              <input
                name="examCode"
                placeholder="CK-2026-01"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Hệ số
              <input
                name="weight"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={1}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Điểm tối đa
              <input
                name="maxScore"
                type="number"
                step="0.5"
                min="1"
                defaultValue={10}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Hạn nhập điểm
              <input
                name="gradingDeadline"
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" name="isOfficialExam" defaultChecked className="h-4 w-4" />
            Kỳ thi chính thức (Khảo thí kiểm soát)
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Lưu cột điểm
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <FunLoader label="Đang tải lớp khảo thí…" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Chưa có lớp trong phạm vi đơn vị đang chọn.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.classId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{row.className}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.assessmentCount} cột điểm · {row.studentCount} HV · sổ:{' '}
                  {row.lockStatus === 'locked' ? 'đã chốt' : 'đang mở'}
                  {row.isPublished && row.publishedAt
                    ? ` · công bố ${new Date(row.publishedAt).toLocaleString('vi-VN')}`
                    : ' · chưa công bố'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/teacher/grades/${row.classId}`}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  Nhập điểm
                </Link>
                {row.isPublished ? (
                  <button
                    type="button"
                    disabled={busyId === row.classId}
                    onClick={() => void handlePublish(row.classId, false)}
                    className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800"
                  >
                    {busyId === row.classId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Thu hồi công bố
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === row.classId}
                    onClick={() => void handlePublish(row.classId, true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"
                  >
                    {busyId === row.classId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Công bố điểm
                  </button>
                )}
                {row.lockStatus === 'locked' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    <Unlock className="h-3 w-3" aria-hidden="true" />
                    Đã khóa sổ
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
