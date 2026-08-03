'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { ExamOpsTabs } from '@/components/shared/ExamOpsTabs'
import {
  addPathwayMilestone,
  createPathway,
  enrollStudentToPathway,
  getPathwayDetail,
  listPathways,
  markMilestoneDone,
  searchStudentsForPathway,
  type PathwayDetail,
  type PathwayRow,
} from './actions'

export default function LearningPathwaysPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<PathwayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PathwayDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [studentQ, setStudentQ] = useState('')
  const [studentHits, setStudentHits] = useState<{ id: string; name: string; code: string }[]>(
    []
  )

  const reload = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      setError('Chưa chọn đơn vị.')
      return
    }
    setLoading(true)
    const result = await listPathways(orgId)
    setRows(result.data)
    setError(result.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    getPathwayDetail(selectedId).then((res) => {
      setDetail(res.data)
      if (res.error) setToast({ type: 'error', message: res.error })
      setDetailLoading(false)
    })
  }, [selectedId])

  useEffect(() => {
    if (!orgId || studentQ.trim().length < 2) {
      setStudentHits([])
      return
    }
    const t = setTimeout(() => {
      void searchStudentsForPathway(orgId, studentQ).then((res) => {
        setStudentHits(res.data)
        if (res.error) setToast({ type: 'error', message: res.error })
      })
    }, 250)
    return () => clearTimeout(t)
  }, [orgId, studentQ])

  async function handleCreatePathway(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orgId) return
    const fd = new FormData(event.currentTarget)
    const result = await createPathway({
      orgId,
      name: String(fd.get('name') ?? ''),
      code: String(fd.get('code') ?? ''),
      description: String(fd.get('description') ?? ''),
    })
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo lộ trình.' })
    event.currentTarget.reset()
    void reload()
  }

  async function handleAddMilestone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orgId || !selectedId) return
    const fd = new FormData(event.currentTarget)
    const result = await addPathwayMilestone({
      orgId,
      pathwayId: selectedId,
      title: String(fd.get('title') ?? ''),
      description: String(fd.get('description') ?? ''),
      sortOrder: String(fd.get('sortOrder') ?? '0'),
      minScore: String(fd.get('minScore') ?? ''),
    })
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã thêm mốc.' })
    event.currentTarget.reset()
    const refreshed = await getPathwayDetail(selectedId)
    setDetail(refreshed.data)
    void reload()
  }

  return (
    <div className="space-y-5">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      <div>
        <h1 className="font-heading text-2xl font-bold">Lộ trình học tập học viên</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Định nghĩa chương trình theo mốc (đầu ra / điểm tối thiểu), ghi danh HV và cập nhật tiến
          độ — gắn với quản lý điểm khảo thí.
        </p>
      </div>
      <ExamOpsTabs />

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <FunLoader label="Đang tải lộ trình…" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <form
              onSubmit={(e) => void handleCreatePathway(e)}
              className="rounded-2xl border border-border bg-surface p-3"
            >
              <p className="text-xs font-bold uppercase text-muted-foreground">Tạo lộ trình</p>
              <input
                name="name"
                required
                placeholder="Tên chương trình"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                name="code"
                placeholder="Mã (VD: CNTT-K26)"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <textarea
                name="description"
                rows={2}
                placeholder="Mô tả ngắn"
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="mt-2 inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tạo
              </button>
            </form>

            <ul className="space-y-1.5">
              {rows.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Chưa có lộ trình.
                </li>
              ) : (
                rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        selectedId === row.id
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-border bg-surface hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-sm font-semibold">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.code || '—'} · {row.milestoneCount} mốc · {row.enrollmentCount} HV
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">Chọn một lộ trình để quản lý mốc và HV.</p>
            ) : detailLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
              </div>
            ) : !detail ? (
              <p className="text-sm text-rose-600">Không tải được chi tiết.</p>
            ) : (
              <div className="space-y-5">
                <section>
                  <h2 className="text-sm font-bold">Mốc lộ trình</h2>
                  <ol className="mt-2 space-y-1.5">
                    {detail.milestones.map((m, i) => (
                      <li
                        key={m.id}
                        className="rounded-xl border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">
                          {i + 1}. {m.title}
                        </span>
                        {m.minScore != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ≥ {m.minScore} điểm
                          </span>
                        )}
                        {m.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                  <form
                    onSubmit={(e) => void handleAddMilestone(e)}
                    className="mt-3 grid gap-2 sm:grid-cols-2"
                  >
                    <input
                      name="title"
                      required
                      placeholder="Tên mốc mới"
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    />
                    <input
                      name="minScore"
                      type="number"
                      step="0.1"
                      placeholder="Điểm tối thiểu"
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    />
                    <input
                      name="sortOrder"
                      type="number"
                      defaultValue={detail.milestones.length}
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    />
                    <input
                      name="description"
                      placeholder="Mô tả"
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 sm:col-span-2"
                    >
                      Thêm mốc
                    </button>
                  </form>
                </section>

                <section>
                  <h2 className="text-sm font-bold">Học viên trên lộ trình</h2>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input
                      value={studentQ}
                      onChange={(e) => setStudentQ(e.target.value)}
                      placeholder="Tìm HV theo tên / MaSV để ghi danh…"
                      className="w-full rounded-xl border border-border py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  {studentHits.length > 0 && (
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border">
                      {studentHits.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                            onClick={() => {
                              if (!orgId || !selectedId) return
                              void enrollStudentToPathway({
                                orgId,
                                pathwayId: selectedId,
                                studentId: s.id,
                              }).then(async (res) => {
                                if (res.error) {
                                  setToast({ type: 'error', message: res.error })
                                  return
                                }
                                setToast({ type: 'success', message: `Đã ghi danh ${s.name}.` })
                                setStudentQ('')
                                setStudentHits([])
                                const refreshed = await getPathwayDetail(selectedId)
                                setDetail(refreshed.data)
                                void reload()
                              })
                            }}
                          >
                            <span>{s.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {s.code || '—'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="mt-3 space-y-2">
                    {detail.enrollments.length === 0 ? (
                      <li className="text-xs text-muted-foreground">Chưa ghi danh HV nào.</li>
                    ) : (
                      detail.enrollments.map((en) => (
                        <li
                          key={en.id}
                          className="rounded-xl border border-border px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">{en.studentName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {en.progressDone}/{en.progressTotal} mốc · {en.status}
                              </p>
                            </div>
                            {detail.milestones[0] && (
                              <button
                                type="button"
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800"
                                onClick={() => {
                                  if (!orgId) return
                                  const done = new Set(en.doneMilestoneIds)
                                  const next = detail.milestones.find((m) => !done.has(m.id))
                                  if (!next) {
                                    setToast({
                                      type: 'success',
                                      message: 'HV đã hoàn thành mọi mốc.',
                                    })
                                    return
                                  }
                                  void markMilestoneDone({
                                    orgId,
                                    enrollmentId: en.id,
                                    milestoneId: next.id,
                                  }).then(async (res) => {
                                    if (res.error) {
                                      setToast({ type: 'error', message: res.error })
                                      return
                                    }
                                    setToast({
                                      type: 'success',
                                      message: `Đã hoàn thành: ${next.title}`,
                                    })
                                    const refreshed = await getPathwayDetail(selectedId!)
                                    setDetail(refreshed.data)
                                  })
                                }}
                              >
                                Hoàn thành mốc tiếp
                              </button>
                            )}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
