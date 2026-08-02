/** Pure helpers — tạo HTML bảng điểm để in / lưu PDF qua trình duyệt */

export type TranscriptPrintStudent = {
  full_name: string
  scores: Record<string, number | null>
  weighted?: number | null
}

export type TranscriptPrintPayload = {
  className: string
  orgLabel: string
  printedAt: string
  assessments: { id: string; name: string; weight: number; max_score: number }[]
  students: TranscriptPrintStudent[]
}

export function buildTranscriptPrintHtml(payload: TranscriptPrintPayload): string {
  const head = payload.assessments
    .map(
      (a) =>
        `<th style="border:1px solid #cbd5e1;padding:6px;font-size:11px">${escapeHtml(a.name)}<br/><span style="font-weight:400">HS${a.max_score} · ${a.weight}%</span></th>`
    )
    .join('')

  const body = payload.students
    .map((s, i) => {
      const cells = payload.assessments
        .map((a) => {
          const v = s.scores[a.id]
          return `<td style="border:1px solid #e2e8f0;padding:6px;text-align:center">${v == null ? '—' : v}</td>`
        })
        .join('')
      const w =
        s.weighted == null ? '—' : Number(s.weighted).toFixed(1)
      return `<tr><td style="border:1px solid #e2e8f0;padding:6px">${i + 1}</td><td style="border:1px solid #e2e8f0;padding:6px;text-align:left">${escapeHtml(s.full_name)}</td>${cells}<td style="border:1px solid #e2e8f0;padding:6px;text-align:center;font-weight:600">${w}</td></tr>`
    })
    .join('')

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Bang diem - ${escapeHtml(payload.className)}</title>
<style>
  body{font-family:Be Vietnam Pro,Inter,system-ui,sans-serif;color:#0f172a;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  p{font-size:12px;color:#64748b;margin:0 0 16px}
  table{border-collapse:collapse;width:100%}
  @media print{button{display:none!important} body{padding:0}}
</style></head><body>
<button onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;border-radius:8px;border:0;background:#4F46E5;color:#fff;font-weight:600;cursor:pointer">In / Lưu PDF</button>
<h1>Bảng điểm lớp: ${escapeHtml(payload.className)}</h1>
<p>${escapeHtml(payload.orgLabel)} · In lúc ${escapeHtml(payload.printedAt)}</p>
<table>
<thead><tr>
<th style="border:1px solid #cbd5e1;padding:6px">#</th>
<th style="border:1px solid #cbd5e1;padding:6px;text-align:left">Họ tên</th>
${head}
<th style="border:1px solid #cbd5e1;padding:6px">ĐTB</th>
</tr></thead>
<tbody>${body || '<tr><td colspan="99" style="padding:12px;text-align:center">Không có dữ liệu</td></tr>'}</tbody>
</table>
<script>window.onload=function(){/* ready */}</script>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
