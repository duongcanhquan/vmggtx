'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  BookMarked,
  Building2,
  FileText,
  FileUp,
  Filter,
  Inbox,
  Loader2,
  Settings2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { FunLoader } from '@/components/shared/FunLoader'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { findOrgNode } from '@/lib/utils/org-tree'
import {
  getKbClasses,
  getKbSubjects,
  getKnowledgeBaseDocs,
  processDocumentForAI,
  type KnowledgeDoc,
} from './actions'
import { KB_CATEGORIES } from './constants'

// ============================================================
// KHO TRI THỨC AI — nạp theo org đang chọn + môn (subjects) + category
// Filter danh sách: cơ sở · môn · lớp · category
// ============================================================

const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export default function KnowledgeBasePage() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const orgTree = useOrgStore((s) => s.orgTree)
  const currentOrgName = currentOrgId
    ? findOrgNode(orgTree, currentOrgId)?.name
    : null

  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loadError, setLoadError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [uploading, startUpload] = useTransition()
  const [toast, setToast] = useState<ToastData | null>(null)
  const [fileName, setFileName] = useState('')
  const [formCategory, setFormCategory] = useState<string>('training')
  const [filterSubjectId, setFilterSubjectId] = useState('')
  const [filterClassId, setFilterClassId] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const loadData = useCallback(async () => {
    if (!currentOrgId) {
      setDocs([])
      setClasses([])
      setSubjects([])
      setLoadError('Chưa chọn cơ sở trên thanh tổ chức (góc trên).')
      setLoading(false)
      return
    }
    setLoading(true)
    const [docsResult, classesResult, subjectsResult] = await Promise.all([
      getKnowledgeBaseDocs(currentOrgId, {
        subjectId: filterSubjectId || null,
        classId: filterClassId || null,
        category: filterCategory || null,
      }),
      getKbClasses(currentOrgId),
      getKbSubjects(currentOrgId),
    ])
    setDocs(docsResult.data)
    setIsDemo(docsResult.demo)
    setLoadError(docsResult.error)
    setClasses(classesResult)
    setSubjects(subjectsResult)
    setLoading(false)
  }, [currentOrgId, filterSubjectId, filterClassId, filterCategory])

  useEffect(() => {
    loadData()
  }, [loadData])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentOrgId) {
      setToast({
        type: 'error',
        message: 'Chưa chọn cơ sở. Chọn tổ chức trên thanh rồi nạp lại.',
      })
      return
    }
    const formData = new FormData(event.currentTarget)
    formData.set('orgId', currentOrgId)

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
      setFormCategory('training')
      loadData()
    })
  }

  const subjectRequired = formCategory === 'training'

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <BookMarked className="h-7 w-7 text-secondary" aria-hidden="true" />
              Kho tri thức AI
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Nạp tài liệu theo cơ sở đang chọn — Gia sư AI chỉ trả lời từ kho này.
            </p>
          </div>
          <Link
            href="/settings/ai"
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Cấu hình AI / hướng dẫn
          </Link>
        </div>

        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900"
        >
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Cơ sở đang nạp:{' '}
              {currentOrgId ? (
                <span>{currentOrgName || 'Đã chọn'}</span>
              ) : (
                <span className="text-rose-700">Chưa chọn — chọn trên thanh tổ chức</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-indigo-800/80">
              Đổi cơ sở trên thanh chọn tổ chức rồi lọc / nạp lại. Tài liệu gắn đúng{' '}
              <code className="rounded bg-indigo-100 px-1 font-mono text-[11px]">org_id</code>{' '}
              của cơ sở đó.
            </p>
          </div>
        </div>

        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Cách ly theo cơ sở. Category <strong>Đào tạo</strong> bắt buộc chọn môn từ danh
            mục Subjects; <strong>Tuyển sinh</strong> / <strong>Chung</strong> dùng cho CRM
            hoặc tài liệu toàn cơ sở.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
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
                htmlFor="kb-category"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Category <span className="text-destructive">*</span>
              </label>
              <select
                id="kb-category"
                name="category"
                required
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {KB_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="kb-subject"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Môn học (danh mục Subjects)
                {subjectRequired && <span className="text-destructive"> *</span>}
              </label>
              <select
                id="kb-subject"
                name="subjectId"
                required={subjectRequired}
                defaultValue=""
                disabled={!currentOrgId || subjects.length === 0}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <option value="">
                  {subjectRequired ? '— Chọn môn —' : '— Không gắn môn —'}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {subjects.length === 0 && currentOrgId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Chưa có môn active.{' '}
                  <Link href="/academic/subjects" className="text-primary underline">
                    Quản lý môn học
                  </Link>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="kb-class"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Gắn vào lớp / học phần (tùy chọn)
              </label>
              <select
                id="kb-class"
                name="classId"
                defaultValue=""
                disabled={!currentOrgId}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <option value="">Toàn cơ sở</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="kb-grade"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Cấp / khối (ghi chú, tùy chọn)
              </label>
              <input
                id="kb-grade"
                name="gradeLevel"
                type="text"
                placeholder="VD: Khối 12"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={uploading || !currentOrgId}
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

          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                <Filter className="h-5 w-5 text-secondary" aria-hidden="true" />
                Tài liệu{' '}
                <span className="text-sm font-medium text-muted-foreground">
                  ({docs.length} file)
                </span>
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="filter-subject" className="mb-1 block text-xs font-semibold">
                  Lọc môn
                </label>
                <select
                  id="filter-subject"
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Tất cả môn</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filter-class" className="mb-1 block text-xs font-semibold">
                  Lọc lớp
                </label>
                <select
                  id="filter-class"
                  value={filterClassId}
                  onChange={(e) => setFilterClassId(e.target.value)}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Tất cả lớp</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filter-cat" className="mb-1 block text-xs font-semibold">
                  Lọc category
                </label>
                <select
                  id="filter-cat"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Tất cả</option>
                  {KB_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <FunLoader label="Đang tải…" />
            ) : loadError ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {loadError}
              </p>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {isDemo
                    ? 'Đăng nhập để xem kho tri thức.'
                    : 'Không có tài liệu khớp bộ lọc / kho trống.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {docs.map((doc) => (
                  <li
                    key={`${doc.orgId}:${doc.fileName}:${doc.category}:${doc.subjectId ?? ''}:${doc.classId ?? ''}:${doc.createdAt}`}
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
                        {doc.orgName} · {doc.categoryLabel} · {doc.subject} ·{' '}
                        {doc.className ?? 'Toàn cơ sở'} · {doc.author} ·{' '}
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
