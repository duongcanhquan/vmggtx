'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { ExamOpsTabs } from '@/components/shared/ExamOpsTabs'
import { getExamExportBoard, type ExamExportRoom } from './actions'

function toCsv(room: ExamExportRoom): string {
  const lines = [
    'SBD,HoTen,MaSV,SDT,Phong,BaiThi,Lop,BatDau,KetThuc',
    ...room.students.map((s) =>
      [
        s.sbd,
        `"${s.fullName.replace(/"/g, '""')}"`,
        s.studentCode,
        s.phone ?? '',
        room.room,
        `"${room.assessmentName.replace(/"/g, '""')}"`,
        `"${room.className.replace(/"/g, '""')}"`,
        room.startTime,
        room.endTime,
      ].join(',')
    ),
  ]
  return lines.join('\n')
}

function downloadCsv(room: ExamExportRoom) {
  const blob = new Blob([toCsv(room)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `thi-${room.room}-${room.scheduleId.slice(0, 8)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function printRoom(room: ExamExportRoom) {
  const rows = room.students
    .map(
      (s) =>
        `<tr><td>${s.sbd}</td><td>${s.fullName}</td><td>${s.studentCode}</td><td>${s.phone ?? ''}</td></tr>`
    )
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Danh sách thi ${room.room}</title>
  <style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px}h1{font-size:18px}</style>
  </head><body>
  <h1>Phòng ${room.room} · ${room.assessmentName}</h1>
  <p>Lớp: ${room.className}<br/>Thời gian: ${new Date(room.startTime).toLocaleString('vi-VN')} – ${new Date(room.endTime).toLocaleString('vi-VN')}<br/>Giám thị: ${room.proctors.join(', ') || '—'}</p>
  <table><thead><tr><th>SBD</th><th>Họ tên</th><th>MaSV</th><th>SĐT</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export default function ExamExportPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rooms, setRooms] = useState<ExamExportRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!orgId) {
      setRooms([])
      setLoading(false)
      setError('Chưa chọn đơn vị.')
      return
    }
    setLoading(true)
    const result = await getExamExportBoard(orgId)
    setRooms(result.data)
    setError(result.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Xuất thông tin thi cử</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Danh sách thí sinh theo phòng (SBD tự sinh), giám thị, khung giờ — in hoặc tải CSV.
        </p>
      </div>
      <ExamOpsTabs />

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <FunLoader label="Đang gom danh sách phòng thi…" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : rooms.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Chưa có lịch thi trong phạm vi đơn vị. Tạo lịch tại &quot;Lịch &amp; giám thị&quot;.
        </p>
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => (
            <li key={room.scheduleId} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Phòng {room.room} · {room.assessmentName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {room.className} · {new Date(room.startTime).toLocaleString('vi-VN')} →{' '}
                    {new Date(room.endTime).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {room.capacity ? ` · sức chứa ${room.capacity}` : ''} · {room.students.length}{' '}
                    thí sinh
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Giám thị: {room.proctors.join(', ') || 'Chưa phân công'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => printRoom(room)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    In danh sách
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCsv(room)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    CSV
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
