'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  BookMarked,
  FileText,
  FileUp,
  Inbox,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { RoleGuard } from '@/components/shared/RoleGuard'
import {
  getKnowledgeBaseDocs,
  getMyOrgClasses,
  processDocumentForAI,
  type KnowledgeDoc,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// KHO TRI THỨC AI (/ai/knowledge-base)
// Giáo viên/Staff nạp tài liệu (PDF/TXT/MD) -> hệ thống chunking
// + embedding + lưu vector GẮN CHẶT org_id (Data Isolation).
// Gia sư AI của cơ sở chỉ trả lời từ kho tri thức của CHÍNH cơ sở.
// ============================================================

const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export default function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, startUpload] = useTransition()
  const [toast, setToast] = useState<ToastData | null>(null)
  const [fileName, setFileName] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [docsResult, classesResult] = await Promise.all([
      getKnowledgeBaseDocs(),
      getMyOrgClasses(),
    ])
    setDocs(docsResult.data)
    setIsDemo(docsResult.demo)
    setClasses(classesResult)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startUpload(async () => {
      const result = await processDocumentForAI(formData)
      if (result.error !== undefined) {
        setToast({ type: 'error', message: result.error })
        return
      }
      setToast({
        type: 'success',
        message: `Đã nạp "${result.fileName}" vào kho tri thức (${result.chunkCount} đoạn).`,
      })
      formRef.current?.reset()
      setFileName('')
      loadData()
    })
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin', 'academic_staff', 'teacher']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Giáo viên / Giáo vụ / Quản lý được truy cập Kho tri thức AI.
        </p>
      }
    >
      <div className="space-y-6">
        {/* ===== Header ===== */}
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <BookMarked className="h-7 w-7 text-secondary" aria-hidden="true" />
            Kho tri thức AI
          </h1>
        </div>

        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Tài liệu được <strong>cách ly tuyệt đối theo cơ sở</strong>.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          {/* ===== Form upload ===== */}
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-2"
          >
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <UploadCloud className="h-5 w-5 text-primary" aria-hidden="true" />
              Nạp tài liệu mới
            </h2>

            <div>
              <label
                htmlFor="kb-file"
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background p-4 text-center transition-colors duration-150 hover:border-primary hover:bg-indigo-50/50"
              >
                <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                {fileName ? (
                  <span className="text-sm font-semibold text-foreground">{fileName}</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-foreground">
                      Chọn file PDF, TXT hoặc MD
                    </span>
                    <span className="text-xs text-muted-foreground">Tối đa 8MB</span>
                  </>
                )}
              </label>
              <input
                id="kb-file"
                name="file"
                type="file"
                accept=".pdf,.txt,.md"
                required
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />
            </div>

            <div>
              <label
                htmlFor="kb-class"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Gắn vào lớp (tùy chọn)
              </label>
              <select
                id="kb-class"
                name="classId"
                defaultValue=""
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Toàn cơ sở</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="kb-subject"
                  className="mb-1.5 block text-sm font-semibold text-foreground"
                >
                  Môn học
                </label>
                <input
                  id="kb-subject"
                  name="subject"
                  type="text"
                  placeholder="VD: Toán"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label
                  htmlFor="kb-grade"
                  className="mb-1.5 block text-sm font-semibold text-foreground"
                >
                  Cấp học
                </label>
                <input
                  id="kb-grade"
                  name="gradeLevel"
                  type="text"
                  placeholder="VD: Khối 12"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Đang xử lý (chunking + embedding)…
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  Nạp vào kho tri thức
                </>
              )}
            </button>
          </form>

          {/* ===== Danh sách tài liệu ===== */}
          <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-3">
            <h2 className="font-heading text-lg font-bold">
              Tài liệu của cơ sở{' '}
              <span className="text-sm font-medium text-muted-foreground">
                ({docs.length} file)
              </span>
            </h2>

            {loading ? (
              <FunLoader label="Đang tải…" />
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {isDemo
                    ? 'Đăng nhập để xem kho tri thức.'
                    : 'Kho tri thức trống.'}
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {docs.map((doc) => (
                  <li
                    key={doc.fileName}
                    className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-secondary">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {doc.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doc.author} · {doc.subject} ·{' '}
                        {doc.className ?? 'Toàn cơ sở'} ·{' '}
                        {DATE_FORMATTER.format(new Date(doc.createdAt))}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary">
                      {doc.chunkCount} đoạn
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
