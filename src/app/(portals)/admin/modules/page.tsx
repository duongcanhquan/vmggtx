'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Blocks,
  Building2,
  ChevronRight,
  Globe,
  Info,
  Loader2,
  PackageMinus,
  PackagePlus,
  Power,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { MODULE_CATALOG, type ModuleInfo } from '@/lib/licensing/moduleCatalog'
import {
  getModuleCenterData,
  setLicenseModule,
  setModuleFlag,
  type ModuleCenterData,
  type ModuleFlagRow,
} from './actions'

// ============================================================
// TRUNG TÂM MODULE (chỉ Super Admin)
// - Theo dõi: mô tả cách hoạt động + số liệu sử dụng từng module.
// - Điều khiển: bật/tắt module TOÀN HỆ THỐNG, theo TỪNG CƠ SỞ,
//   hoặc tắt 1 PHẦN (tính năng con) của module.
// ============================================================

type LoadedData = Exclude<ModuleCenterData, { error: string }>

function flagMatch(
  flag: ModuleFlagRow,
  orgId: string | null,
  moduleKey: string,
  featureKey: string | null
) {
  return (
    flag.orgId === orgId && flag.moduleKey === moduleKey && flag.featureKey === featureKey
  )
}

/** Công tắc bật/tắt dạng pill */
function Switch({
  on,
  busy,
  onToggle,
  label,
}: {
  on: boolean
  busy?: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${
        on ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-[22px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

export default function ModuleCenterPage() {
  const [data, setData] = useState<LoadedData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(MODULE_CATALOG[0].key)
  const [busyFlag, setBusyFlag] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getModuleCenterData()
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setData(result)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected: ModuleInfo =
    MODULE_CATALOG.find((m) => m.key === selectedKey) ?? MODULE_CATALOG[0]

  const isDisabled = useCallback(
    (orgId: string | null, moduleKey: string, featureKey: string | null) =>
      data?.disabledFlags.some((f) => flagMatch(f, orgId, moduleKey, featureKey)) ?? false,
    [data]
  )

  /** Số cơ sở đang bị tắt riêng cho 1 module */
  const orgOffCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const flag of data?.disabledFlags ?? []) {
      if (flag.orgId && !flag.featureKey) {
        map.set(flag.moduleKey, (map.get(flag.moduleKey) ?? 0) + 1)
      }
    }
    return map
  }, [data])

  async function toggle(
    orgId: string | null,
    moduleKey: string,
    featureKey: string | null
  ) {
    if (!data) return
    const busyKey = `${orgId ?? 'global'}:${moduleKey}:${featureKey ?? ''}`
    const currentlyDisabled = isDisabled(orgId, moduleKey, featureKey)
    const nextEnabled = currentlyDisabled // đang tắt -> bật lại

    // Optimistic: cập nhật ngay để công tắc phản hồi tức thì
    setBusyFlag(busyKey)
    setData({
      ...data,
      disabledFlags: nextEnabled
        ? data.disabledFlags.filter((f) => !flagMatch(f, orgId, moduleKey, featureKey))
        : [...data.disabledFlags, { orgId, moduleKey, featureKey }],
    })

    const result = await setModuleFlag({
      orgId,
      moduleKey,
      featureKey,
      enabled: nextEnabled,
    })
    setBusyFlag(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      void load() // revert theo dữ liệu thật
      return
    }
    setToast({
      type: 'success',
      message: nextEnabled ? 'Đã bật lại.' : 'Đã tắt — menu và URL tương ứng sẽ bị chặn.',
    })
  }

  /** Ghép / gỡ module khỏi GÓI license của 1 cơ sở */
  async function toggleLicense(campusId: string, granted: boolean) {
    if (!data) return
    const busyKey = `lic:${campusId}:${selected.key}`
    setBusyFlag(busyKey)
    const result = await setLicenseModule({
      orgId: campusId,
      moduleKey: selected.key,
      granted,
    })
    setBusyFlag(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            campuses: prev.campuses.map((c) =>
              c.id === campusId
                ? { ...c, licenseModules: result.licenseModules ?? null }
                : c
            ),
          }
        : prev
    )
    setToast({
      type: 'success',
      message: granted
        ? `Đã ghép "${selected.label}" vào gói của cơ sở — menu sẽ hiện ngay.`
        : `Đã gỡ "${selected.label}" khỏi gói của cơ sở.`,
    })
  }

  if (loading) return <FunLoader label="Đang tải Trung tâm Module…" />
  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
        {loadError}
      </div>
    )
  }
  if (!data) return null

  const globalOff = isDisabled(null, selected.key, null)
  const offGlobalCount = data.disabledFlags.filter(
    (f) => !f.orgId && !f.featureKey
  ).length
  const orgOverrideCount = data.disabledFlags.filter((f) => f.orgId).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
          <Blocks className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Trung tâm Module
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trung tâm thông tin: mỗi module phục vụ gì, vận hành ra sao, đang được dùng
          bao nhiêu — và ghép/gỡ module cho từng cơ sở khi cần.
        </p>
      </div>

      {/* Dải thống kê tổng quan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Module hệ thống', value: MODULE_CATALOG.length, tone: 'text-indigo-600' },
          {
            label: 'Đang bật toàn hệ thống',
            value: MODULE_CATALOG.length - offGlobalCount,
            tone: 'text-emerald-600',
          },
          { label: 'Tắt toàn hệ thống', value: offGlobalCount, tone: 'text-rose-600' },
          { label: 'Điều chỉnh theo cơ sở', value: orgOverrideCount, tone: 'text-amber-600' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-surface px-4 py-3"
          >
            <p className={`font-heading text-2xl font-bold ${stat.tone}`}>
              {stat.value.toLocaleString('vi-VN')}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {data.migrationMissing && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Chưa chạy <span className="font-mono font-semibold">046_module_flags.sql</span>{' '}
            trên database — công tắc sẽ báo lỗi khi lưu. Hãy chạy migration trong Supabase
            SQL Editor.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* ===== Danh sách module ===== */}
        <div className="space-y-1.5 rounded-2xl border border-border bg-surface p-3">
          {MODULE_CATALOG.map((mod) => {
            const usage = data.usage[mod.key]
            const offGlobal = isDisabled(null, mod.key, null)
            const offOrgs = orgOffCount.get(mod.key) ?? 0
            const active = mod.key === selected.key
            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => setSelectedKey(mod.key)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border border-indigo-200 bg-indigo-50'
                    : 'border border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {mod.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {usage ? `${usage.count.toLocaleString('vi-VN')} ${usage.label}` : 'Chưa có số liệu'}
                  </p>
                </div>
                {offGlobal ? (
                  <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                    Tắt hệ thống
                  </span>
                ) : offOrgs > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Tắt {offOrgs} cơ sở
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    Bật
                  </span>
                )}
                <ChevronRight
                  className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-500' : 'text-slate-300'}`}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>

        {/* ===== Chi tiết module ===== */}
        <div className="space-y-4">
          {/* Cách hoạt động + số liệu */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold text-foreground">
                  {selected.label}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{selected.summary}</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <Activity className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                <span className="text-sm font-semibold text-foreground">
                  {data.usage[selected.key]
                    ? `${data.usage[selected.key]!.count.toLocaleString('vi-VN')} ${data.usage[selected.key]!.label}`
                    : 'Chưa có số liệu'}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50/60 px-3.5 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-indigo-950">{selected.howItWorks}</p>
            </div>
          </div>

          {/* Công tắc TOÀN HỆ THỐNG: module + từng tính năng con */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Toàn hệ thống
            </h3>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {globalOff ? 'Module đang TẮT toàn hệ thống' : 'Module đang bật toàn hệ thống'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tắt = mọi cơ sở mất menu và bị chặn URL của module này (Super Admin không bị ảnh hưởng).
                </p>
              </div>
              <Switch
                on={!globalOff}
                busy={busyFlag === `global:${selected.key}:`}
                onToggle={() => void toggle(null, selected.key, null)}
                label={`Bật/tắt ${selected.label} toàn hệ thống`}
              />
            </div>

            {selected.features.length > 0 && (
              <div className="mt-3 space-y-2">
                {selected.features.map((feature) => {
                  const off = isDisabled(null, selected.key, feature.key)
                  return (
                    <div
                      key={feature.key}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{feature.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                      <Switch
                        on={!off}
                        busy={busyFlag === `global:${selected.key}:${feature.key}`}
                        onToggle={() => void toggle(null, selected.key, feature.key)}
                        label={`Bật/tắt ${feature.label} toàn hệ thống`}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bật/tắt theo TỪNG CƠ SỞ */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Theo từng cơ sở
            </h3>
            {data.campuses.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Chưa có cơ sở nào.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {data.campuses.map((campus) => {
                  const hasLicenseRow = campus.licenseModules !== null
                  const inLicense =
                    !hasLicenseRow || campus.licenseModules!.includes(selected.key)
                  const off = isDisabled(campus.id, selected.key, null)
                  const licBusy = busyFlag === `lic:${campus.id}:${selected.key}`
                  return (
                    <div
                      key={campus.id}
                      className="rounded-xl border border-border px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {campus.name}
                          </p>
                          {!inLicense ? (
                            <p className="text-xs font-medium text-amber-600">
                              Chưa ghép vào gói — cơ sở không thấy module này.
                            </p>
                          ) : !hasLicenseRow ? (
                            <p className="text-xs text-muted-foreground">
                              Gói đầy đủ (chưa giới hạn module riêng).
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {inLicense ? (
                            <button
                              type="button"
                              disabled={licBusy}
                              onClick={() => void toggleLicense(campus.id, false)}
                              title={`Gỡ "${selected.label}" khỏi gói của ${campus.name}`}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              {licBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <PackageMinus className="h-3 w-3" aria-hidden="true" />
                              )}
                              Gỡ khỏi gói
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={licBusy}
                              onClick={() => void toggleLicense(campus.id, true)}
                              title={`Ghép "${selected.label}" vào gói của ${campus.name}`}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                            >
                              {licBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <PackagePlus className="h-3 w-3" aria-hidden="true" />
                              )}
                              Ghép vào gói
                            </button>
                          )}
                          {inLicense && off && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                              Đang tắt
                            </span>
                          )}
                          {inLicense && (
                            <Switch
                              on={!off}
                              busy={busyFlag === `${campus.id}:${selected.key}:`}
                              onToggle={() => void toggle(campus.id, selected.key, null)}
                              label={`Bật/tắt ${selected.label} cho ${campus.name}`}
                            />
                          )}
                        </div>
                      </div>

                      {selected.features.length > 0 && inLicense && !off && (
                        <div className="mt-2 flex flex-wrap gap-2 border-t border-dashed border-border pt-2">
                          {selected.features.map((feature) => {
                            const fOff = isDisabled(campus.id, selected.key, feature.key)
                            return (
                              <button
                                key={feature.key}
                                type="button"
                                disabled={
                                  busyFlag === `${campus.id}:${selected.key}:${feature.key}`
                                }
                                onClick={() =>
                                  void toggle(campus.id, selected.key, feature.key)
                                }
                                title={feature.description}
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                                  fOff
                                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                <Power className="h-3 w-3" aria-hidden="true" />
                                {feature.label}
                                {fOff ? ' · tắt' : ''}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
