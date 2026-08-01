import Link from 'next/link'
import {
  BadgeCheck,
  BarChart3,
  Blocks,
  Building2,
  CalendarClock,
  ExternalLink,
  GraduationCap,
  PackageOpen,
  Settings,
  ShieldAlert,
  Users,
  Vote,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { planLabel } from '@/lib/licensing/packages'
import { MODULE_CATALOG } from '@/lib/licensing/moduleCatalog'

// ============================================================
// /admin — trang đầu Admin Portal.
// - super_admin: TỔNG QUAN HỆ THỐNG — bao nhiêu Đơn vị, license
//   nào sắp hết hạn, mỗi Đơn vị dùng bao nhiêu module/học viên.
// - campus_admin: Trung tâm Điều hành (link nhanh) như cũ.
// ============================================================

export const dynamic = 'force-dynamic'

const CAMPUS_LINKS = [
  { href: '/campus-admin/users', label: 'Nhân sự', icon: Users },
  { href: '/settings', label: 'Cài đặt cơ sở', icon: Settings },
  { href: '/academic/campaigns', label: 'Đợt khảo sát', icon: Vote },
  { href: '/finance/invoices', label: 'Học phí', icon: Wallet },
  { href: '/hr/contracts', label: 'Hợp đồng GV', icon: Building2 },
  { href: '/classes', label: 'Lớp học', icon: GraduationCap },
]

type UnitRow = {
  id: string
  name: string
  slug: string | null
  students: number
  teachers: number
  planName: string | null
  moduleCount: number | null // null = gói đầy đủ
  maxStudents: number | null
  validUntil: string | null
  status: string
}

async function loadSuperOverview(): Promise<{
  units: UnitRow[]
  totals: { students: number; teachers: number; expiringSoon: number }
  offGlobalCount: number
}> {
  const admin = createAdminClient()

  // Cây org (slug fail-soft nếu chưa chạy 045)
  let orgs: { id: string; name: string; type: string; parent_id: string | null; slug?: string | null }[] = []
  {
    const withSlug = await admin
      .from('organizations')
      .select('id, name, type, parent_id, slug')
      .is('deleted_at', null)
      .order('name')
    if (withSlug.error) {
      const fallback = await admin
        .from('organizations')
        .select('id, name, type, parent_id')
        .is('deleted_at', null)
        .order('name')
      orgs = (fallback.data ?? []) as typeof orgs
    } else {
      orgs = (withSlug.data ?? []) as typeof orgs
    }
  }

  const [profilesRes, licensesRes, flagsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('role, org_id')
      .in('role', ['student', 'teacher'])
      .is('deleted_at', null),
    admin
      .from('tenant_licenses')
      .select('org_id, plan_name, module_keys, max_students, valid_until, status'),
    admin
      .from('module_flags')
      .select('org_id, module_key, feature_key')
      .eq('enabled', false)
      .is('org_id', null)
      .is('feature_key', null),
  ])

  // Đếm học viên/GV theo org, rồi GỘP theo cây con của từng Đơn vị
  const studentsByOrg = new Map<string, number>()
  const teachersByOrg = new Map<string, number>()
  for (const row of profilesRes.data ?? []) {
    if (!row.org_id) continue
    const map = row.role === 'student' ? studentsByOrg : teachersByOrg
    map.set(row.org_id, (map.get(row.org_id) ?? 0) + 1)
  }

  const childrenByParent = new Map<string, string[]>()
  for (const org of orgs) {
    if (!org.parent_id) continue
    const list = childrenByParent.get(org.parent_id) ?? []
    list.push(org.id)
    childrenByParent.set(org.parent_id, list)
  }
  function subtreeIds(rootId: string): string[] {
    const result: string[] = []
    const stack = [rootId]
    while (stack.length > 0) {
      const id = stack.pop()!
      result.push(id)
      for (const child of childrenByParent.get(id) ?? []) stack.push(child)
    }
    return result
  }

  const licenseByOrg = new Map(
    (licensesRes.data ?? []).map((row) => [row.org_id as string, row])
  )

  // [RANH GIỚI CẤP 1] Đơn vị khách hàng = con TRỰC TIẾP của gốc hệ thống
  // (theo cấu trúc cây — nhánh cấp 2-3 gộp vào subtree của Đơn vị mẹ)
  const rootOrgIds = new Set(orgs.filter((org) => !org.parent_id).map((org) => org.id))
  const units: UnitRow[] = orgs
    .filter((org) => org.parent_id !== null && rootOrgIds.has(org.parent_id))
    .map((org) => {
      const ids = subtreeIds(org.id)
      const license = licenseByOrg.get(org.id)
      return {
        id: org.id,
        name: org.name,
        slug: org.slug ?? null,
        students: ids.reduce((sum, id) => sum + (studentsByOrg.get(id) ?? 0), 0),
        teachers: ids.reduce((sum, id) => sum + (teachersByOrg.get(id) ?? 0), 0),
        planName: license ? (license.plan_name as string) : null,
        moduleCount: license ? ((license.module_keys as string[]) ?? []).length : null,
        maxStudents: license?.max_students ?? null,
        validUntil: license?.valid_until ?? null,
        status: license?.status ?? 'active',
      }
    })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  const expiringSoon = units.filter(
    (unit) =>
      unit.status === 'suspended' ||
      (unit.validUntil !== null && unit.validUntil <= soon)
  ).length

  return {
    units,
    totals: {
      students: units.reduce((sum, unit) => sum + unit.students, 0),
      teachers: units.reduce((sum, unit) => sum + unit.teachers, 0),
      expiringSoon,
    },
    offGlobalCount: flagsRes.error ? 0 : (flagsRes.data ?? []).length,
  }
}

function LicenseBadge({ unit, today }: { unit: UnitRow; today: string }) {
  if (unit.status === 'suspended') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Tạm ngưng
      </span>
    )
  }
  if (unit.validUntil !== null && unit.validUntil < today) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Hết hạn
      </span>
    )
  }
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  if (unit.validUntil !== null && unit.validUntil <= soon) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Sắp hết hạn
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Hoạt động
    </span>
  )
}

export default async function AdminPortalPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isSuper = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    isSuper = profile?.role === 'super_admin'
  }

  // ===== Campus Admin: Trung tâm Điều hành (link nhanh) =====
  if (!isSuper) {
    return (
      <div className="space-y-6">
        <div className="bento-card-dark p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#a5b5f7]">
            Admin Portal
          </p>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Trung tâm Điều hành
          </h1>
          <div className="gold-hairline mt-3 w-40" aria-hidden="true" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPUS_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className="bento-card flex items-center gap-3 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="bento-icon bg-stone-100 text-stone-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-heading text-sm font-bold">{link.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // ===== Super Admin: TỔNG QUAN HỆ THỐNG =====
  const { units, totals, offGlobalCount } = await loadSuperOverview()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

  const stats = [
    { label: 'Đơn vị (Trường)', value: units.length, tone: 'text-indigo-600', icon: Building2 },
    { label: 'Tổng học viên', value: totals.students, tone: 'text-emerald-600', icon: Users },
    { label: 'Tổng giảng viên', value: totals.teachers, tone: 'text-sky-600', icon: GraduationCap },
    {
      label: 'Cần chú ý (hết hạn / tạm ngưng ≤30 ngày)',
      value: totals.expiringSoon,
      tone: totals.expiringSoon > 0 ? 'text-rose-600' : 'text-slate-400',
      icon: CalendarClock,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="bento-card-dark p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#a5b5f7]">
          Super Admin
        </p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Tổng quan Hệ thống
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-300">
          {units.length.toLocaleString('vi-VN')} Đơn vị đang vận hành ·{' '}
          {MODULE_CATALOG.length - offGlobalCount}/{MODULE_CATALOG.length} module bật toàn
          hệ thống. Việc vận hành bên trong từng Đơn vị do Admin Đơn vị phụ trách.
        </p>
        <div className="gold-hairline mt-3 w-40" aria-hidden="true" />
      </div>

      {/* Dải chỉ số */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-2xl border border-border bg-surface px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`font-heading text-2xl font-bold ${stat.tone}`}>
                  {stat.value.toLocaleString('vi-VN')}
                </p>
                <Icon className="h-5 w-5 text-slate-300" aria-hidden="true" />
              </div>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Bảng Đơn vị */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Đơn vị (Trường)</th>
              <th className="px-4 py-3">Học viên</th>
              <th className="px-4 py-3">Giảng viên</th>
              <th className="px-4 py-3">Gói dịch vụ</th>
              <th className="px-4 py-3">Hạn dùng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Hồ sơ</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  Chưa có Đơn vị nào — sang{' '}
                  <Link href="/admin/modules" className="font-semibold text-indigo-600 hover:underline">
                    Module &amp; Gói dịch vụ
                  </Link>{' '}
                  để khởi tạo Đơn vị đầu tiên.
                </td>
              </tr>
            )}
            {units.map((unit) => (
              <tr key={unit.id} className="border-b border-slate-50 hover:bg-indigo-50/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{unit.name}</p>
                  {unit.slug && (
                    <a
                      href={`/coso/${unit.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs font-semibold text-violet-700 hover:underline"
                    >
                      /coso/{unit.slug}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {unit.students.toLocaleString('vi-VN')}
                  {unit.maxStudents ? ` / ${unit.maxStudents.toLocaleString('vi-VN')}` : ''}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {unit.teachers.toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {unit.planName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <PackageOpen className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      {planLabel(unit.planName)} · {unit.moduleCount} module
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Blocks className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      Gói đầy đủ ({MODULE_CATALOG.length} module)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{unit.validUntil ?? 'Vĩnh viễn'}</td>
                <td className="px-4 py-3">
                  <LicenseBadge unit={unit} today={today} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <Link
                      href={`/admin/organizations/${unit.id}`}
                      title={`Hồ sơ Đơn vị: ${unit.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                    >
                      <BarChart3 className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
