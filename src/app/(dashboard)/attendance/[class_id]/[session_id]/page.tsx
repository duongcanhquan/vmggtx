'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
} from 'lucide-react'
import {
  getAttendancePolicy,
  submitAttendance,
  type AttendancePolicy,
  type AttendanceStatus,
  type AttendanceRecord,
} from '../../actions'

// MOCK 3 học viên - sau này thay bằng danh sách ghi danh của lớp (Supabase SSR client)
const MOCK_STUDENTS = [
  { id: 'stu-001', name: 'Nguyễn Văn An' },
  { id: 'stu-002', name: 'Trần Thị Bình' },
  { id: 'stu-003', name: 'Lê Minh Cường' },
]

const STATUS_OPTIONS: {
  value: AttendanceStatus
  label: string
  checkedClass: string
}[] = [
  {
    value: 'present',
    label: 'Có mặt',
    checkedClass:
      'peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-700',
  },
  {
    value: 'excused',
    label: 'Vắng phép',
    checkedClass:
      'peer-checked:border-amber-600 peer-checked:bg-amber-50 peer-checked:text-amber-700',
  },
  {
    value: 'absent',
    label: 'Vắng không phép',
    checkedClass:
      'peer-checked:border-rose-600 peer-checked:bg-rose-50 peer-checked:text-rose-700',
  },
]

type PageProps = {
  params: { class_id: string; session_id: string }
}

export default function AttendanceSessionPage({ params }: PageProps) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    () => Object.fromEntries(MOCK_STUDENTS.map((s) => [s.id, 'present']))
  )
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null)
  const [isPending, startTransition] = useTransition()

  // Chính sách điểm danh trễ - CẤU HÌNH ĐỘNG phân giải qua
  // settingsResolver (Cá nhân -> Cơ sở -> Cụm -> HQ -> default)
  useEffect(() => {
    let cancelled = false
    getAttendancePolicy(params.session_id).then((result) => {
      if (!cancelled) setPolicy(result)
    })
    return () => {
      cancelled = true
    }
  }, [params.session_id])

  function handleSave() {
    setMessage(null)
    const records: AttendanceRecord[] = MOCK_STUDENTS.map((student) => ({
      studentId: student.id,
      status: statuses[student.id],
    }))

    startTransition(async () => {
      const result = await submitAttendance(params.session_id, records)
      if ('error' in result && result.error) {
        setMessage({ type: 'error', text: result.error })
      } else if ('success' in result) {
        setMessage({
          type: 'success',
          text:
            result.absentCount > 0
              ? `Đã lưu điểm danh. ${result.absentCount} học viên vắng không phép — hệ thống đang gửi thông báo tự động.`
              : 'Đã lưu điểm danh. Cả lớp không có ai vắng không phép.',
        })
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/attendance"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-primary">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Điểm danh buổi học
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Lớp <span className="font-mono text-xs">{params.class_id}</span> — Buổi{' '}
              <span className="font-mono text-xs">{params.session_id}</span>
            </p>
          </div>
        </div>
      </div>

      {policy && (
        <p className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Điểm danh trễ tối đa{' '}
          <strong>{policy.allowLateCheckinMinutes} phút</strong>
          {policy.source === 'inherited' && ' (kế thừa từ cấp trên)'}
          {policy.source === 'default' && ' (mặc định hệ thống)'}.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-3.5 font-semibold">Học viên</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_STUDENTS.map((student) => (
              <tr key={student.id} className="border-b border-border last:border-0">
                <td className="px-5 py-4 align-top">
                  <p className="font-medium text-foreground">{student.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{student.id}</p>
                </td>
                <td className="px-5 py-4">
                  <fieldset>
                    <legend className="sr-only">Trạng thái điểm danh của {student.name}</legend>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((option) => (
                        <label key={option.value} className="cursor-pointer">
                          <input
                            type="radio"
                            name={`status-${student.id}`}
                            value={option.value}
                            checked={statuses[student.id] === option.value}
                            onChange={() =>
                              setStatuses((prev) => ({
                                ...prev,
                                [student.id]: option.value,
                              }))
                            }
                            className="peer sr-only"
                          />
                          <span
                            className={`inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${option.checkedClass}`}
                          >
                            {option.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            message.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm sm:w-auto"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? 'Đang lưu...' : 'Lưu điểm danh'}
      </button>
    </div>
  )
}
