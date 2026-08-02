'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookMarked, Loader2, Plus, Trash2 } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  listSubjects,
  softDeleteSubject,
  upsertSubject,
  type SubjectRow,
} from './actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function AcademicSubjectsPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<SubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [credits, setCredits] = useState('')
  const [periods, setPeriods] = useState('')
  const [outcomes, setOutcomes] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await listSubjects(orgId)
    setRows(res.data)
    if (res.error) setToast({ type: 'error', message: res.error })
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm() {
    setEditId(null)
    setName('')
    setCode('')
    setCredits('')
    setPeriods('')
    setOutcomes('')
  }

  function startEdit(row: SubjectRow) {
    setEditId(row.id)
    setName(row.name)
    setCode(row.code ?? '')
    setCredits(row.credits == null ? '' : String(row.credits))
    setPeriods(row.total_periods == null ? '' : String(row.total_periods))
    setOutcomes(row.learning_outcomes ?? '')
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const result = await upsertSubject(orgId, {
      id: editId ?? undefined,
      name,
      code,
      credits: credits === '' ? null : Number(credits),
      totalPeriods: periods === '' ? null : Number(periods),
      learningOutcomes: outcomes,
      isActive: true,
    })
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: editId ? 'Đã cập nhật môn học.' : 'Đã thêm môn học.',
    })
    resetForm()
    void load()
  }

  async function onDelete(id: string) {
    if (!orgId) return
    if (!window.confirm('Ẩn môn học này? (soft delete)')) return
    setBusy(true)
    const result = await softDeleteSubject(orgId, id)
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã ẩn môn học.' })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <BookMarked className="h-7 w-7 text-primary" aria-hidden="true" />
          Chương trình môn học
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mã môn, tín chỉ, số tiết và chuẩn đầu ra — không đổi định danh học viên
          (MaSV).
        </p>
      </header>

      {!orgId ? (
        <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
      ) : (
        <>
          <form
            onSubmit={onSave}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <p className="mb-4 text-sm font-semibold">
              {editId ? 'Sửa môn học' : 'Thêm môn học'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sub-name">
                  Tên môn *
                </label>
                <input
                  id="sub-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sub-code">
                  Mã môn
                </label>
                <input
                  id="sub-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="TOAN-10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sub-credits">
                  Tín chỉ
                </label>
                <input
                  id="sub-credits"
                  type="number"
                  step="0.5"
                  min="0"
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sub-periods">
                  Tổng tiết
                </label>
                <input
                  id="sub-periods"
                  type="number"
                  min="0"
                  value={periods}
                  onChange={(e) => setPeriods(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sub-out">
                  Chuẩn đầu ra
                </label>
                <textarea
                  id="sub-out"
                  rows={3}
                  value={outcomes}
                  onChange={(e) => setOutcomes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editId ? 'Lưu' : 'Thêm'}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Hủy sửa
                </button>
              )}
            </div>
          </form>

          {loading ? (
            <FunLoader label="Đang tải môn học…" />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              Chưa có môn học trong phạm vi đơn vị.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Môn</th>
                    <th className="px-3 py-3 font-semibold">Mã</th>
                    <th className="px-3 py-3 font-semibold">TC</th>
                    <th className="px-3 py-3 font-semibold">Tiết</th>
                    <th className="px-3 py-3 font-semibold">TT</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="text-left font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </button>
                        {row.learning_outcomes && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {row.learning_outcomes}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{row.code ?? '—'}</td>
                      <td className="px-3 py-3 tabular-nums">
                        {row.credits ?? '—'}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {row.total_periods ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        {row.is_active ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            Off
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onDelete(row.id)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10"
                          aria-label={`Ẩn ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
