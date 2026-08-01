'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Check,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  CONFIGURABLE_ROLE_LABELS,
  MENU_SECTIONS,
  defaultKeysForRole,
  type ConfigurableRole,
  type MenuKey,
} from '@/lib/auth/menuRegistry'
import {
  getPermissionMatrix,
  saveMenuPermissions,
  type PermissionMatrixData,
} from './actions'

// ============================================================
// MA TRẬN PHÂN QUYỀN TRUY CẬP (/admin/permissions)
// - Hàng = hạng mục menu; Cột = role. Tick = được thấy & truy cập.
// - super_admin: chọn cơ sở, cấp quyền cho cả Quản lý cơ sở.
// - campus_admin: cấp cho cấp dưới, không vượt trần quyền của mình.
// - Ghi đè áp dụng cho TOÀN BỘ cây con của cơ sở được chọn.
// ============================================================

type MatrixState = Record<ConfigurableRole, Set<MenuKey>>

function buildState(data: PermissionMatrixData): MatrixState {
  const state = {} as MatrixState
  for (const role of data.editableRoles) {
    const keys = data.overrides[role] ?? defaultKeysForRole(role)
    state[role] = new Set(keys)
  }
  return state
}

const ORG_TYPE_LABEL: Record<string, string> = {
  hq: 'Trụ sở',
  region: 'Khu vực',
  campus: 'Cơ sở',
  branch: 'Chi nhánh',
}

export default function AdminPermissionsPage() {
  const [data, setData] = useState<PermissionMatrixData | null>(null)
  const [state, setState] = useState<MatrixState | null>(null)
  const [dirtyRoles, setDirtyRoles] = useState<Set<ConfigurableRole>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resettingRole, setResettingRole] = useState<ConfigurableRole | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async (orgId?: string) => {
    setLoading(true)
    setLoadError(null)
    const result = await getPermissionMatrix(orgId)
    if (result.error !== undefined) {
      setLoadError(result.error)
      setLoading(false)
      return
    }
    setData(result)
    setState(buildState(result))
    setDirtyRoles(new Set())
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const capSet = useMemo(
    () => (data?.capKeys ? new Set(data.capKeys) : null),
    [data]
  )

  function toggle(role: ConfigurableRole, key: MenuKey) {
    if (!state) return
    // Trần ủy quyền: campus_admin không tick được key ngoài quyền của mình
    if (capSet && !capSet.has(key)) return
    setState((current) => {
      if (!current) return current
      const next = { ...current, [role]: new Set(current[role]) }
      if (next[role].has(key)) next[role].delete(key)
      else next[role].add(key)
      return next
    })
    setDirtyRoles((current) => new Set(current).add(role))
  }

  async function handleSaveAll() {
    if (!data || !state || dirtyRoles.size === 0) return
    setSaving(true)
    let failed = 0
    for (const role of dirtyRoles) {
      const result = await saveMenuPermissions(data.orgId, role, [...state[role]])
      if (result.error) {
        failed++
        setToast({ type: 'error', message: result.error })
      }
    }
    setSaving(false)
    if (failed === 0) {
      setToast({
        type: 'success',
        message: `Đã lưu phân quyền cho ${dirtyRoles.size} vai trò tại "${data.orgName}". Áp dụng cho toàn bộ đơn vị trực thuộc.`,
      })
      await loadData(data.orgId)
    }
  }

  async function handleReset(role: ConfigurableRole) {
    if (!data) return
    setResettingRole(role)
    const result = await saveMenuPermissions(data.orgId, role, null)
    setResettingRole(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã đặt lại "${CONFIGURABLE_ROLE_LABELS[role]}" về ma trận mặc định.`,
    })
    await loadData(data.orgId)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            Phân quyền truy cập
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick = vai trò được <strong>thấy menu và truy cập</strong> hạng mục.
            Ghi đè áp dụng cho toàn bộ đơn vị trực thuộc.
          </p>
        </div>
        {data && dirtyRoles.size > 0 && (
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={saving}
            className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Lưu thay đổi ({dirtyRoles.size} vai trò)
          </button>
        )}
      </div>

      {/* Chọn cơ sở (chỉ super_admin) */}
      {data?.orgOptions && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="perm-org" className="text-sm font-semibold">
            Cơ sở áp dụng:
          </label>
          <select
            id="perm-org"
            value={data.orgId}
            onChange={(e) => void loadData(e.target.value)}
            className="min-h-10 min-w-56 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {data.orgOptions.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({ORG_TYPE_LABEL[org.type] ?? org.type})
              </option>
            ))}
          </select>
          <p className="w-full text-xs text-muted-foreground sm:w-auto">
            Cấp quyền tại cơ sở nào sẽ kế thừa xuống mọi chi nhánh con của cơ sở đó.
          </p>
        </div>
      )}

      {/* Trần ủy quyền của campus admin */}
      {data && capSet && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Bạn chỉ cấp được các quyền <strong>bản thân đang có</strong>. Ô có ổ khóa
            là hạng mục nằm ngoài quyền của bạn (do Quản trị hệ thống cấp).
          </p>
        </div>
      )}

      {loading && <FunLoader label="Đang tải ma trận phân quyền..." />}

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {!loading && data && state && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-stone-50/70 text-left">
                <th className="px-4 py-3 font-semibold">Hạng mục</th>
                {data.editableRoles.map((role) => {
                  const hasOverride = data.overrides[role] !== undefined
                  return (
                    <th key={role} className="px-3 py-3 text-center">
                      <p className="font-semibold">{CONFIGURABLE_ROLE_LABELS[role]}</p>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            hasOverride
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {hasOverride ? 'Đã tùy chỉnh' : 'Mặc định'}
                        </span>
                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => void handleReset(role)}
                            disabled={resettingRole === role}
                            title="Đặt lại về mặc định"
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-stone-100 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {resettingRole === role ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {MENU_SECTIONS.map((section) => {
                const outOfCap = capSet !== null && !capSet.has(section.key)
                return (
                  <tr
                    key={section.key}
                    className="border-b border-border last:border-b-0 hover:bg-stone-50/60"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{section.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {section.prefixes.join(', ')}
                      </p>
                    </td>
                    {data.editableRoles.map((role) => (
                      <td key={role} className="px-3 py-2.5 text-center">
                        {outOfCap ? (
                          <Lock
                            className="mx-auto h-4 w-4 text-stone-300"
                            aria-label="Ngoài quyền của bạn"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={state[role]?.has(section.key) ?? false}
                            onChange={() => toggle(role, section.key)}
                            aria-label={`${CONFIGURABLE_ROLE_LABELS[role]} - ${section.label}`}
                            className="h-[18px] w-[18px] cursor-pointer accent-indigo-600"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && (
        <p className="text-xs text-muted-foreground">
          Lưu ý: vai trò chưa &quot;Đã tùy chỉnh&quot; dùng ma trận mặc định của hệ
          thống. Quyền có hiệu lực trong vòng ~5 phút sau khi lưu (người dùng đang
          đăng nhập cần chuyển trang để menu cập nhật).
        </p>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
