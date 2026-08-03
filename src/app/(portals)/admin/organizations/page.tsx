'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Building2,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Loader2,
  Network,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusPortalPath, slugifyOrgName } from '@/lib/utils/orgSlug'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { buildOrgTree, ORG_TYPE_LABELS, type OrgTreeNode } from '@/lib/utils/org-tree'
import {
  createOrganization,
  deleteOrganization,
  getOrgManagementData,
  updateOrganization,
  type OrgManagementRow,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// QUẢN LÝ CƠ SỞ (Admin Portal) - cây tổ chức đa tầng.
// [RANH GIỚI] Super Admin: CHỈ quản lý cấp Đơn vị (Trường) —
// tạo/sửa/xóa Đơn vị, xem các nhánh bên trong nhưng KHÔNG sửa được
// (đó là việc của Admin Đơn vị). Campus Admin: thêm/sửa/xóa đơn vị
// TRONG cây con của mình (không xóa được cơ sở gốc của chính mình).
// ============================================================

type OrgNode = OrgTreeNode & { studentCount?: number; classCount?: number }

const TYPE_BADGE: Record<string, string> = {
  hq: 'bg-indigo-100 text-indigo-700',
  region: 'bg-sky-100 text-sky-700',
  campus: 'bg-emerald-100 text-emerald-700',
  branch: 'bg-amber-100 text-amber-700',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)
  const [rows, setRows] = useState<OrgManagementRow[]>([])
  const [canManage, setCanManage] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [myOrgId, setMyOrgId] = useState<string | null>(null)
  // null = không giới hạn (super_admin); mảng = chỉ các org trong cây con
  const [manageableIds, setManageableIds] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Modal tạo: null = đóng; string = parentId chọn sẵn; '' = tự chọn
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [editOrg, setEditOrg] = useState<OrgManagementRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // [ORG_MODEL.md G1] chỉ 2 loại: campus = Đơn vị (Trường), branch = Cơ sở/Trung tâm
  const [createType, setCreateType] = useState<'campus' | 'branch'>('branch')
  const [createName, setCreateName] = useState('')
  const [createSlug, setCreateSlug] = useState('')
  const [editSlug, setEditSlug] = useState('')
  // Cây bấm-mới-sổ: Super Admin mặc định chỉ thấy gốc + Đơn vị cấp 1
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getOrgManagementData()
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setRows(result.orgs)
    setCanManage(result.canManage)
    setIsSuperAdmin(result.isSuperAdmin)
    setMyOrgId(result.myOrgId)
    setManageableIds(result.manageableIds)
    // Super Admin: gập các nhánh bên trong Đơn vị (bấm vào Đơn vị mới sổ ra
    // để XEM). Admin Đơn vị: mở sẵn toàn bộ cây của mình.
    setExpandedIds(
      result.isSuperAdmin
        ? new Set(result.orgs.filter((org) => org.parent_id === null).map((o) => o.id))
        : new Set(result.orgs.map((org) => org.id))
    )
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await createOrganization(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo đơn vị mới.' })
    setCreateParentId(null)
    void loadData()
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await updateOrganization(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã cập nhật đơn vị.' })
    setEditOrg(null)
    void loadData()
  }

  async function handleDelete(node: OrgNode) {
    const ok = window.confirm(
      `Xóa đơn vị "${node.name}"?\n\nChỉ xóa được khi đơn vị không còn đơn vị con, học viên hay lớp học. Thao tác là XÓA MỀM (khôi phục được qua kỹ thuật).`
    )
    if (!ok) return
    setDeletingId(node.id)
    const result = await deleteOrganization(node.id)
    setDeletingId(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa đơn vị "${node.name}".` })
    void loadData()
  }

  const countById = new Map(rows.map((row) => [row.id, row]))
  const tree = buildOrgTree(rows) as OrgNode[]
  // Đơn vị NGOÀI cây con (cấp trên hiển thị để vẽ cây) -> chỉ xem
  const inMyScope = (id: string) => manageableIds === null || manageableIds.includes(id)
  const manageableRows = rows.filter((org) => inMyScope(org.id))
  // [RANH GIỚI CẤP 1 — THEO CẤU TRÚC] gốc hệ thống + con trực tiếp của gốc.
  // Không dựa cột type vì dữ liệu cũ có thể gắn nhầm 'campus' cho nhánh sâu.
  const rootIdSet = new Set(tree.map((node) => node.id))
  const isTopLevel = (node: OrgNode) =>
    rootIdSet.has(node.id) || (node.parent_id !== null && rootIdSet.has(node.parent_id))
  // Đơn vị (Trường) nằm ở gốc hệ thống; Cơ sở/Trung tâm nằm trong Đơn vị
  const parentOptions =
    createType === 'campus'
      ? rows.filter((org) => org.parent_id === null)
      : manageableRows.filter((org) => org.type === 'campus' || org.type === 'branch')

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(node: OrgNode, depth: number): React.ReactNode {
    const counts = countById.get(node.id)
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)
    const isMyRoot = node.id === myOrgId
    const isDeleting = deletingId === node.id
    // [RANH GIỚI CẤP 1 — THEO CẤU TRÚC] Super Admin chỉ thao tác gốc hệ thống
    // + Đơn vị cấp 1 (con trực tiếp của gốc). MỌI nhánh sâu hơn — dù dữ liệu
    // cũ gắn type gì — đều do Admin Đơn vị quản lý, Super Admin chỉ xem.
    const superViewOnly = isSuperAdmin && !isTopLevel(node)
    const canTouch = canManage && inMyScope(node.id) && !superViewOnly
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-indigo-50/50"
          style={{ marginLeft: depth * 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              title={isExpanded ? 'Thu gọn nhánh con' : `Xem ${node.children.length} nhánh con`}
              aria-label={isExpanded ? `Thu gọn ${node.name}` : `Mở rộng ${node.name}`}
              aria-expanded={isExpanded}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 truncate font-medium text-slate-900">{node.name}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[node.type] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {ORG_TYPE_LABELS[node.type]}
          </span>
          {isMyRoot && (
            <span className="shrink-0 rounded-full bg-[#5d68e8]/15 px-2 py-0.5 text-[11px] font-semibold text-[#3c3ac0]">
              Đơn vị của bạn
            </span>
          )}
          {canManage && !inMyScope(node.id) && (
            <span
              className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
              title="Đơn vị cấp trên - bạn chỉ xem, không sửa được"
            >
              Cấp trên · chỉ xem
            </span>
          )}
          {superViewOnly && (
            <span
              className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
              title="Cơ sở/Trung tâm bên trong Đơn vị do Admin Đơn vị tự tổ chức — Super Admin chỉ xem"
            >
              Admin Đơn vị quản lý · chỉ xem
            </span>
          )}
          {node.type === 'campus' && counts?.slug && (
            <a
              href={campusPortalPath(counts.slug)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Mở cổng ${campusPortalPath(counts.slug)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              /{counts.slug}/login
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {counts?.studentCount ?? 0} HV
            </span>
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              {counts?.classCount ?? 0} lớp
            </span>
          </span>

          {/* Thao tác: hồ sơ / quản lý admin / thêm con / sửa / xóa - CHỈ trong phạm vi */}
          {hasChildren && !isExpanded && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-500">
              {node.children.length} nhánh con
            </span>
          )}
          {canTouch && (
            <span className="flex shrink-0 items-center gap-1">
              {(node.type === 'campus' ||
                (node.parent_id !== null && rootIdSet.has(node.parent_id))) && (
                <>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/organizations/${node.id}`)}
                    title={`Hồ sơ Đơn vị: ${node.name}`}
                    aria-label={`Hồ sơ Đơn vị ${node.name}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-indigo-100 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hồ sơ
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/admin/organizations/${node.id}#admins`)
                    }
                    title={`Tạo / sửa / xóa Admin của ${node.name}`}
                    aria-label={`Quản lý Admin của ${node.name}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                    Admin
                  </button>
                </>
              )}
              {/* Nhân sự chi tiết (campus_admin): chỉ khi không phải super xem cấp 1 */}
              {!(
                node.type === 'campus' ||
                (node.parent_id !== null && rootIdSet.has(node.parent_id))
              ) && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentOrgId(node.id)
                    router.push('/campus-admin/users')
                  }}
                  title={`Nhân sự của ${node.name}`}
                  aria-label={`Nhân sự ${node.name}`}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-emerald-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserCog className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {/* Thêm nhánh con: chỉ Admin Đơn vị — Super Admin không tổ chức bên trong */}
              {!isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateParentId(node.id)
                    setCreateType('branch')
                    setCreateName('')
                    setCreateSlug('')
                  }}
                  title="Thêm đơn vị con"
                  aria-label={`Thêm đơn vị con cho ${node.name}`}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const row = countById.get(node.id) ?? null
                  setEditOrg(row)
                  setEditSlug(row?.slug ?? (row ? slugifyOrgName(row.name) : ''))
                }}
                title="Sửa / đổi tên"
                aria-label={`Sửa đơn vị ${node.name}`}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-amber-100 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(node)}
                disabled={isMyRoot || hasChildren || isDeleting || node.type === 'hq'}
                title={
                  node.type === 'hq'
                    ? 'Không thể xóa gốc hệ thống'
                    : isMyRoot
                      ? 'Không thể xóa Đơn vị gốc của chính bạn'
                      : hasChildren
                        ? 'Còn đơn vị trực thuộc - không thể xóa'
                        : 'Xóa đơn vị (xóa mềm)'
                }
                aria-label={`Xóa đơn vị ${node.name}`}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </span>
          )}
        </div>
        {isExpanded && node.children.map((child) => renderNode(child as OrgNode, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
          <Network className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          {isSuperAdmin ? 'Quản lý Đơn vị' : 'Cơ sở & Trung tâm'}
        </h1>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreateParentId('')
              setCreateType(isSuperAdmin ? 'campus' : 'branch')
              setCreateName('')
              setCreateSlug('')
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isSuperAdmin ? 'Thêm Đơn vị (Trường)' : 'Thêm Cơ sở / Trung tâm'}
          </button>
        )}
      </div>

      {canManage && !loading && (
        <p className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
          {isSuperAdmin
            ? 'Bạn quản lý ở CẤP ĐƠN VỊ (Trường): tạo/sửa/xóa Đơn vị. Nút Admin mở hồ sơ để tạo·sửa·xóa tài khoản Admin của Đơn vị. Gói module cấu hình tại Gói dịch vụ. Các Cơ sở/Trung tâm bên trong chỉ xem.'
            : 'Bên trong Đơn vị bạn được tạo tối đa 3 cấp: Đơn vị → Cơ sở → Trung tâm. Học viên, giảng viên đều thuộc Đơn vị — cơ sở chỉ là nơi học/làm việc.'}
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải cây tổ chức…" />
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      ) : tree.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-muted-foreground">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Không tìm thấy đơn vị nào.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}

      {/* ===== Modal thêm đơn vị ===== */}
      {createParentId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                {createType === 'campus' ? 'Thêm Đơn vị (Trường)' : 'Thêm Cơ sở / Trung tâm'}
              </h2>
              <button
                type="button"
                onClick={() => setCreateParentId(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Tên đơn vị
              <input
                name="name"
                required
                minLength={3}
                maxLength={120}
                placeholder="VD: Chi nhánh Hà Đông"
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value)
                  if (createType === 'campus') {
                    setCreateSlug(slugifyOrgName(e.target.value))
                  }
                }}
                className={inputClass}
              />
            </label>

            {/* Super Admin CHỈ tạo Đơn vị (Trường); Admin Đơn vị chỉ tạo Cơ sở/Trung tâm */}
            <input type="hidden" name="type" value={isSuperAdmin ? 'campus' : 'branch'} />
            {isSuperAdmin && (
              <p className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                Đơn vị (Trường) là pháp nhân gốc, có cổng và gói module riêng. Cơ sở /
                Trung tâm bên trong do <strong>Admin của Đơn vị</strong> tự tổ chức.
              </p>
            )}

            {createType === 'campus' && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Mã đường dẫn (slug)
                <input
                  name="slug"
                  required
                  minLength={2}
                  maxLength={48}
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value.toLowerCase())}
                  placeholder="vd: cau-giay"
                  className={`${inputClass} font-mono`}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Cổng đăng nhập:{' '}
                  <span className="font-mono text-indigo-600">
                    /{createSlug || '…'}/login
                  </span>
                </span>
              </label>
            )}

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Trực thuộc
              <select
                name="parentId"
                required
                defaultValue={createParentId || undefined}
                className={inputClass}
              >
                {parentOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {ORG_TYPE_LABELS[org.type]} · {org.name}
                  </option>
                ))}
              </select>
              {createType === 'campus' && (
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Đơn vị (Trường) nằm ở cấp gốc hệ thống.
                </span>
              )}
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateParentId(null)}
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
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Tạo đơn vị
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Modal sửa đơn vị ===== */}
      {editOrg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleUpdate}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="font-heading text-lg font-bold text-slate-900">
                Sửa đơn vị
              </h2>
              <button
                type="button"
                onClick={() => setEditOrg(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <input type="hidden" name="orgId" value={editOrg.id} />

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Tên đơn vị
              <input
                name="name"
                required
                minLength={3}
                maxLength={120}
                defaultValue={editOrg.name}
                className={inputClass}
              />
            </label>

            {editOrg.type === 'hq' ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Đây là <strong>gốc hệ thống</strong> — không thể đổi loại đơn vị.
              </p>
            ) : isSuperAdmin && editOrg.type === 'campus' ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Loại: <strong>Đơn vị (Trường)</strong> — pháp nhân gốc, không đổi loại.
              </p>
            ) : (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Loại đơn vị
                <select
                  name="type"
                  defaultValue={editOrg.type === 'region' ? '' : editOrg.type}
                  className={inputClass}
                >
                  {editOrg.type === 'region' && (
                    <option value="">Giữ nguyên: Khối (cũ)</option>
                  )}
                  <option value="campus">Đơn vị (Trường)</option>
                  <option value="branch">Cơ sở / Trung tâm</option>
                </select>
              </label>
            )}

            {(editOrg.type === 'campus' || editOrg.slug) && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Mã đường dẫn (slug)
                <input
                  name="slug"
                  required
                  minLength={2}
                  maxLength={48}
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                  className={`${inputClass} font-mono`}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Cổng:{' '}
                  <a
                    href={campusPortalPath(editSlug || 'x')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-indigo-600 hover:underline"
                  >
                    /{editSlug || '…'}/login
                  </a>
                </span>
              </label>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOrg(null)}
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
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                )}
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
