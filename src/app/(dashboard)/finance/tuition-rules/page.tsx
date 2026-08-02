'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, Loader2, Plus, Trash2, Wand2 } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  generateDraftInvoicesFromRule,
  listStudentsForTuition,
  listTuitionRules,
  softDeleteTuitionRule,
  upsertTuitionRule,
  type BillingMode,
  type TuitionRuleRow,
} from './actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const MODE_LABEL: Record<BillingMode, string> = {
  flat: 'Cố định',
  per_credit: 'Theo tín chỉ',
  monthly: 'Theo tháng',
}

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export default function TuitionRulesPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rules, setRules] = useState<TuitionRuleRow[]>([])
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [mode, setMode] = useState<BillingMode>('flat')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  const [genRuleId, setGenRuleId] = useState('')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')

  const load = useCallback(async () => {
    if (!orgId) {
      setRules([])
      setStudents([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [r, s] = await Promise.all([
      listTuitionRules(orgId),
      listStudentsForTuition(orgId),
    ])
    setRules(r.data)
    setStudents(s.data)
    if (r.error) setToast({ type: 'error', message: r.error })
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm() {
    setEditId(null)
    setName('')
    setMode('flat')
    setAmount('')
    setNote('')
  }

  function startEdit(row: TuitionRuleRow) {
    setEditId(row.id)
    setName(row.name)
    setMode(row.billing_mode)
    setAmount(String(row.amount))
    setNote(row.note ?? '')
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const result = await upsertTuitionRule(orgId, {
      id: editId ?? undefined,
      name,
      billingMode: mode,
      amount: Number(amount),
      note,
      isActive: true,
    })
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: editId ? 'Đã cập nhật.' : 'Đã thêm công thức.' })
    resetForm()
    void load()
  }

  async function onDelete(id: string) {
    if (!orgId) return
    if (!window.confirm('Ẩn công thức này?')) return
    setBusy(true)
    const result = await softDeleteTuitionRule(orgId, id)
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã ẩn công thức.' })
    void load()
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function onGenerate() {
    if (!orgId || !genRuleId) return
    setBusy(true)
    const result = await generateDraftInvoicesFromRule(orgId, {
      ruleId: genRuleId,
      studentIds: selectedStudents,
      dueDate: dueDate || null,
    })
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã tạo ${result.created} hóa đơn nháp (pending).`,
    })
    setSelectedStudents([])
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <header>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <Calculator className="h-7 w-7 text-primary" aria-hidden="true" />
          Công thức học phí
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Định nghĩa mức phí và sinh hóa đơn nháp — không đổi cấu trúc hóa đơn cũ.
        </p>
      </header>

      {!orgId ? (
        <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
      ) : loading ? (
        <FunLoader label="Đang tải công thức…" />
      ) : (
        <>
          <form
            onSubmit={onSave}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <p className="mb-4 text-sm font-semibold">
              {editId ? 'Sửa công thức' : 'Thêm công thức'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tr-name">
                  Tên *
                </label>
                <input
                  id="tr-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tr-mode">
                  Kiểu
                </label>
                <select
                  id="tr-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as BillingMode)}
                  className={inputClass}
                >
                  <option value="flat">Cố định</option>
                  <option value="per_credit">Theo tín chỉ</option>
                  <option value="monthly">Theo tháng</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tr-amount">
                  Số tiền *
                </label>
                <input
                  id="tr-amount"
                  required
                  type="number"
                  min="0"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="tr-note">
                  Ghi chú
                </label>
                <input
                  id="tr-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
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

          {rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              Chưa có công thức học phí.
            </div>
          ) : (
            <ul className="space-y-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(rule)}
                    className="text-left"
                  >
                    <p className="font-heading font-bold text-primary hover:underline">
                      {rule.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {MODE_LABEL[rule.billing_mode]} · {CURRENCY.format(rule.amount)}
                      {rule.note ? ` · ${rule.note}` : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(rule.id)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Ẩn
                  </button>
                </li>
              ))}
            </ul>
          )}

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
              <Wand2 className="h-5 w-5 text-amber-600" aria-hidden="true" />
              Sinh hóa đơn nháp
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-rule">
                  Công thức
                </label>
                <select
                  id="gen-rule"
                  value={genRuleId}
                  onChange={(e) => setGenRuleId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Chọn —</option>
                  {rules
                    .filter((r) => r.is_active)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="gen-due">
                  Hạn thanh toán
                </label>
                <input
                  id="gen-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mb-2 mt-4 text-sm font-medium">
              Học viên ({selectedStudents.length} đã chọn)
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-2">
              {students.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Không có học viên.</p>
              ) : (
                <ul className="space-y-1">
                  {students.map((st) => (
                    <li key={st.id}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-indigo-50">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(st.id)}
                          onChange={() => toggleStudent(st.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm">{st.full_name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              disabled={busy || !genRuleId || selectedStudents.length === 0}
              onClick={() => void onGenerate()}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Tạo hóa đơn pending
            </button>
          </section>
        </>
      )}
    </div>
  )
}
