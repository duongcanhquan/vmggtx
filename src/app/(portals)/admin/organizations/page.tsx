'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Building2,
  GraduationCap,
  Loader2,
  Network,
  Plus,
  SearchX,
  Users,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { buildOrgTree, ORG_TYPE_LABELS, type OrgTreeNode } from '@/lib/utils/org-tree'
import {
  createOrganization,
  getOrgManagementData,
  type OrgManagementRow,
} from './actions'

// ============================================================
// QUẢN LÝ CƠ SỞ (Admin Portal) - cây tổ chức đa tầng + thêm đơn vị.
// ============================================================

type OrgNode = OrgTreeNode & { studentCount?: number; classCount?: number }

const TYPE_BADGE: Record<string, string> = {
  hq: 'bg-indigo-100 text-indigo-700',
  region: 'bg-sky-100 text-sky-700',
  campus: 'bg-emerald-100 text-emerald-700',
  branch: 'bg-amber-100 text-amber-700',
}

export default function AdminOrganizationsPage() {
  const [rows, setRows] = useState<OrgManagementRow[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

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
    setIsSuperAdmin(result.isSuperAdmin)
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
    setModalOpen(false)
    void loadData()
  }

  const countById = new Map(rows.map((row) => [row.id, row]))
  const tree = buildOrgTree(rows) as OrgNode[]

  function renderNode(node: OrgNode, depth: number): React.ReactNode {
    const counts = countById.get(node.id)
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-indigo-50/50"
          style={{ marginLeft: depth * 20 }}
        >
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="font-medium text-slate-900">{node.name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[node.type] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {ORG_TYPE_LABELS[node.type]}
          </span>
          <span className="ml-auto flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {counts?.studentCount ?? 0} HV
            </span>
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              {counts?.classCount ?? 0} lớp
            </span>
          </span>
        </div>
        {node.children.map((child) => renderNode(child as OrgNode, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
          <Network className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Quản lý Cơ sở
        </h1>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm đơn vị
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Đang tải cây tổ chức…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      ) : tree.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Không tìm thấy đơn vị nào.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}

      {/* Modal thêm đơn vị */}
      {modalOpen && (
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
              <h2 className="font-display text-lg font-bold text-slate-900">
                Thêm đơn vị mới
              </h2>
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
              Tên đơn vị
              <input
                name="name"
                required
                minLength={3}
                maxLength={120}
                placeholder="VD: Chi nhánh Hà Đông"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Loại đơn vị
              <select
                name="type"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="region">Cụm/Vùng</option>
                <option value="campus">Cơ sở</option>
                <option value="branch">Chi nhánh</option>
              </select>
            </label>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Trực thuộc (đơn vị cha)
              <select
                name="parentId"
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                {rows.map((org) => (
                  <option key={org.id} value={org.id}>
                    {ORG_TYPE_LABELS[org.type]} · {org.name}
                  </option>
                ))}
              </select>
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
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Tạo đơn vị
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
