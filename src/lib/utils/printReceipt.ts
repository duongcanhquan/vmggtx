// ============================================================
// IN BIÊN LAI THU HỌC PHÍ (client-side)
// Mở cửa sổ in của trình duyệt với biên lai HTML khổ A5 -
// người dùng bấm In hoặc "Save as PDF" để xuất file PDF.
// ============================================================

export type ReceiptData = {
  /** Mã hóa đơn hiển thị (VD: HD-2607A1) */
  invoiceCode: string
  studentName: string
  orgName: string
  /** Số tiền thu ĐỢT NÀY */
  amountPaid: number
  paymentMethod: 'cash' | 'transfer'
  /** Tổng giá trị hóa đơn */
  invoiceTotal: number
  /** Tổng đã thu SAU đợt này */
  paidTotal: number
  /** Còn lại sau đợt này */
  remaining: number
  note?: string
}

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function printReceipt(data: ReceiptData): void {
  const now = new Date()
  const receiptNo = `PT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}-${String(now.getTime()).slice(-5)}`

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Biên lai ${esc(receiptNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 28px; }
  .receipt { max-width: 480px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 14px; padding: 26px; }
  .head { text-align: center; border-bottom: 2px solid #4338ca; padding-bottom: 14px; }
  .head .org { font-size: 13px; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: 1px; }
  .head h1 { font-size: 21px; margin-top: 8px; letter-spacing: 2px; }
  .head .no { margin-top: 4px; font-size: 12px; color: #64748b; }
  table { width: 100%; margin-top: 18px; font-size: 14px; border-collapse: collapse; }
  td { padding: 7px 0; vertical-align: top; }
  td:first-child { color: #64748b; width: 42%; }
  td:last-child { font-weight: 600; text-align: right; }
  .amount { border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; margin-top: 14px; padding: 12px 0; text-align: center; }
  .amount .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .amount .value { font-size: 26px; font-weight: 800; color: #047857; margin-top: 4px; }
  .foot { margin-top: 18px; display: flex; justify-content: space-between; font-size: 13px; }
  .foot .sig { text-align: center; width: 45%; }
  .foot .sig .role { font-weight: 700; }
  .foot .sig .hint { color: #94a3b8; font-size: 11px; margin-top: 34px; }
  .thanks { margin-top: 22px; text-align: center; font-size: 12px; color: #64748b; font-style: italic; }
  @media print { body { padding: 0; } .receipt { border: none; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <p class="org">${esc(data.orgName)}</p>
      <h1>BIÊN LAI THU HỌC PHÍ</h1>
      <p class="no">Số: ${esc(receiptNo)} · Ngày ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
    <table>
      <tr><td>Học viên</td><td>${esc(data.studentName)}</td></tr>
      <tr><td>Hóa đơn</td><td>${esc(data.invoiceCode)}</td></tr>
      ${data.note ? `<tr><td>Nội dung</td><td>${esc(data.note)}</td></tr>` : ''}
      <tr><td>Hình thức</td><td>${data.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</td></tr>
      <tr><td>Tổng hóa đơn</td><td>${VND.format(data.invoiceTotal)}</td></tr>
      <tr><td>Lũy kế đã thu</td><td>${VND.format(data.paidTotal)}</td></tr>
      <tr><td>Còn lại</td><td>${data.remaining > 0 ? VND.format(data.remaining) : 'ĐÃ THU ĐỦ ✓'}</td></tr>
    </table>
    <div class="amount">
      <p class="label">Số tiền thu đợt này</p>
      <p class="value">${VND.format(data.amountPaid)}</p>
    </div>
    <div class="foot">
      <div class="sig"><p class="role">Người nộp tiền</p><p class="hint">(Ký, họ tên)</p></div>
      <div class="sig"><p class="role">Người thu tiền</p><p class="hint">(Ký, họ tên)</p></div>
    </div>
    <p class="thanks">Cảm ơn Quý phụ huynh và học viên đã tin tưởng!</p>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=560,height=760')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
}
