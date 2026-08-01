'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  Blocks,
  Building2,
  CalendarClock,
  ExternalLink,
  GraduationCap,
  School,
  ShieldAlert,
  UserCog,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusPortalPath } from '@/lib/utils/orgSlug'
import { ORG_TYPE_LABELS } from '@/lib/utils/org-tree'
import { MODULE_CATALOG } from '@/lib/licensing/moduleCatalog'
import { FunLoader } from '@/components/shared/FunLoader'
import { getUnitProfile, type UnitProfile } from '../actions'

// ============================================================
// HỒ SƠ ĐƠN VỊ [ORG_MODEL.md G2]
// Super Admin bấm vào 1 Đơn vị để nắm ngay tình hình: bao nhiêu
// admin / nhân viên / giảng viên / học viên (GỘP CẢ CÂY), module
// nào đang hoạt động, license còn hạn không, các Cơ sở bên trong.
// CHỈ XEM con số tổng — chi tiết nghiệp vụ thuộc Admin Đơn vị.
// ============================================================

type LoadedProfile = Exclude<UnitProfile, { error: string }>

export default function UnitProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)
  const [profile, setProfile] = useState<LoadedProfile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getUnitProfile(params.id)
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setProfile(result)
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <FunLoader label="Đang tải hồ sơ Đơn vị…" />
  if (loadError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      </div>
    )
  }
  if (!profile) return null

  const { org, counts, children, license, offModules } = profile
  const licenseExpired =
    license.validUntil !== null &&
    license.validUntil < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

  /** Trạng thái từng module với Đơn vị này */
  function moduleState(key: string): 'active' | 'off' | 'not_in_package' {
    if (license.moduleKeys !== null && !license.moduleKeys.includes(key)) {
      return 'not_in_package'
    }
    if (offModules.includes(key)) return 'off'
    return 'active'
  }
  const activeCount = MODULE_CATALOG.filter((m) => moduleState(m.key) === 'active').length

  const stats = [
    { label: 'Quản lý (Admin)', value: counts.admins, icon: UserCog, tone: 'text-indigo-600' },
    { label: 'Nhân viên', value: counts.staff, icon: Users, tone: 'text-sky-600' },
    { label: 'Giảng viên', value: counts.teachers, icon: GraduationCap, tone: 'text-emerald-600' },
    { label: 'Học viên', value: counts.students, icon: School, tone: 'text-amber-600' },
    { label: 'Lớp học', value: counts.classes, icon: Building2, tone: 'text-violet-600' },
  ]

  return (
    <div className="space-y-6">
      <BackLink />

      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
            <Building2 className="h-6 w-6 shrink-0 text-indigo-600" aria-hidden="true" />
            <span className="truncate">{org.name}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {ORG_TYPE_LABELS[org.type]}
            </span>
            {org.slug && (
              <a
                href={campusPortalPath(org.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                /coso/{org.slug}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
            <span className="text-xs text-muted-foreground">
              Số liệu tính GỘP toàn cây — con người thuộc Đơn vị, cơ sở chỉ là nơi học/làm.
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCurrentOrgId(org.id)
              router.push('/campus-admin/users')
            }}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Quản lý Admin & nhân sự
          </button>
          <Link
            href="/admin/modules"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Blocks className="h-4 w-4" aria-hidden="true" />
            Trung tâm Module
          </Link>
        </div>
      </div>

      {/* ===== Số liệu nhân sự / học viên (gộp cả cây) ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <stat.icon className={`h-4 w-4 ${stat.tone}`} aria-hidden="true" />
            <p className={`mt-1 font-heading text-2xl font-bold ${stat.tone}`}>
              {stat.value.toLocaleString('vi-VN')}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== License + Module đang hoạt động ===== */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              Gói module — {activeCount}/{MODULE_CATALOG.length} đang hoạt động
            </h2>
            {license.status === 'suspended' || licenseExpired ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {license.status === 'suspended' ? 'Đang tạm ngưng' : 'Hết hạn'}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                Đang hiệu lực
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground">
            <span>
              Gói: <strong>{license.planName}</strong>
            </span>
            <span>
              Giới hạn học viên:{' '}
              <strong>
                {license.maxStudents === null
                  ? 'Không giới hạn'
                  : `${counts.students.toLocaleString('vi-VN')} / ${license.maxStudents.toLocaleString('vi-VN')}`}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Hạn dùng: <strong>{license.validUntil ?? 'Vĩnh viễn'}</strong>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {MODULE_CATALOG.map((mod) => {
              const state = moduleState(mod.key)
              return (
                <span
                  key={mod.key}
                  title={
                    state === 'active'
                      ? `${mod.label}: đang hoạt động`
                      : state === 'off'
                        ? `${mod.label}: có trong gói nhưng đang bị TẮT`
                        : `${mod.label}: chưa ghép vào gói`
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    state === 'active'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : state === 'off'
                        ? 'border-rose-200 bg-rose-50 text-rose-600 line-through'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  {mod.label}
                </span>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Xanh = đang hoạt động · Đỏ gạch = trong gói nhưng bị tắt · Xám = chưa ghép vào gói.
            Ghép/gỡ và bật/tắt tại Trung tâm Module.
          </p>
        </div>

        {/* ===== Cơ sở / Trung tâm bên trong ===== */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Cơ sở / Trung tâm bên trong ({children.length})
          </h2>
          {children.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Chưa có cơ sở nào — Admin Đơn vị sẽ tự tạo Cơ sở/Trung tâm bên trong.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{child.name}</p>
                    <p className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[child.type]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <School className="h-3.5 w-3.5" aria-hidden="true" />
                      {child.students} HV
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                      {child.teachers} GV
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/admin/organizations"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Về danh sách Đơn vị
    </Link>
  )
}
