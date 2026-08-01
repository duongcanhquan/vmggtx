'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { SmartTable, sortableHeader } from '@/components/shared/SmartTable'
import { SectionTabs } from '@/components/shared/SectionTabs'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { importStudentRowSchema } from '@/lib/validation/schemas'
import { bulkImportStudents, type BulkImportRowOutcome } from '../actions'

// ============================================================
// MASS IMPORT Học sinh (/students/import) - ĐÀO TẠO KÉP (035)
//
// Luồng: Tải file mẫu -> Kéo/thả Excel/CSV -> parse NGAY TRÊN
// TRÌNH DUYỆT (papaparse/xlsx) -> preview SmartTable "Bản nháp"
// -> validate Zod từng dòng (dòng lỗi tô ĐỎ) -> chỉ khi sạch 100%
// mới hiện nút "Tiến hành Import" -> Server Action upsert theo MaSV.
//
// [ĐIỀU KIỆN BẮT BUỘC] File PHẢI có cột tiêu đề chính xác `MaSV`
// (phân biệt hoa thường). Thiếu -> CHẶN NGAY, báo đỏ, không preview.
//
// org_id KHÔNG có trong file: server ép org_id = cơ sở đang chọn.
// ============================================================

type PreviewRow = {
  index: number
  maSV: string
  fullName: string
  email: string
  phone: string
  address: string
  errors: string[]
}

const MASV_HEADER = 'MaSV'
const MASV_HEADER_ERROR =
  'File import không hợp lệ. Cột định danh bắt buộc phải có tiêu đề là MaSV'

const TEMPLATE_HEADERS = [MASV_HEADER, 'Họ tên', 'Email', 'Số điện thoại', 'Địa chỉ']
const TEMPLATE_SAMPLE_ROWS = [
  ['HS2026001', 'Nguyễn Văn An', 'an.nguyen@example.com', '0912345678', 'Hà Nội'],
  ['HS2026002', 'Trần Thị Bình', 'binh.tran@example.com', '0987654321', 'TP. Hồ Chí Minh'],
]

/** Bỏ dấu tiếng Việt + lowercase để so khớp tên cột linh hoạt */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

const HEADER_FIELD_MAP: Record<string, keyof Omit<PreviewRow, 'index' | 'errors'>> = {
  masv: 'maSV',
  'ma sv': 'maSV',
  'ho ten': 'fullName',
  'ho va ten': 'fullName',
  ten: 'fullName',
  fullname: 'fullName',
  full_name: 'fullName',
  email: 'email',
  'thu dien tu': 'email',
  'so dien thoai': 'phone',
  'dien thoai': 'phone',
  sdt: 'phone',
  phone: 'phone',
  'dia chi': 'address',
  address: 'address',
}

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s.-]/g, '').replace(/^\+84/, '0')
}

/** Map 1 dòng raw từ file -> PreviewRow + validate Zod ngay trên UI */
function toPreviewRow(raw: Record<string, unknown>, index: number): PreviewRow {
  const mapped = { maSV: '', fullName: '', email: '', phone: '', address: '' }
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_FIELD_MAP[normalizeHeader(header)]
    if (field) mapped[field] = String(value ?? '').trim()
  }
  mapped.phone = normalizePhone(mapped.phone)

  const parsed = importStudentRowSchema.safeParse(mapped)
  return {
    index,
    ...mapped,
    errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
  }
}

/** Đánh dấu lỗi các dòng có MaSV trùng nhau NGAY trong file */
function markDuplicateMaSV(rows: PreviewRow[]): PreviewRow[] {
  const countByCode = new Map<string, number>()
  for (const row of rows) {
    if (row.maSV) countByCode.set(row.maSV, (countByCode.get(row.maSV) ?? 0) + 1)
  }
  return rows.map((row) =>
    row.maSV && (countByCode.get(row.maSV) ?? 0) > 1
      ? { ...row, errors: [...row.errors, `MaSV "${row.maSV}" bị trùng lặp trong file.`] }
      : row
  )
}

export default function StudentImportPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [rows, setRows] = useState<PreviewRow[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    successCount: number
    failedCount: number
    rows: BulkImportRowOutcome[]
  } | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const errorRowCount = useMemo(
    () => rows.filter((row) => row.errors.length > 0).length,
    [rows]
  )
  const allValid = rows.length > 0 && errorRowCount === 0

  // ---------- Tải file mẫu ----------
  async function downloadTemplateXlsx() {
    const XLSX = await import('xlsx')
    const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS])
    sheet['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 24 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'HocSinh')
    XLSX.writeFile(workbook, 'mau-import-hoc-sinh.xlsx')
  }

  function downloadTemplateCsv() {
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]
      .map((cells) => cells.join(','))
      .join('\n')
    // BOM để Excel mở file CSV tiếng Việt không vỡ font
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'mau-import-hoc-sinh.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // ---------- Parse file trên trình duyệt ----------
  const handleFile = useCallback(async (file: File) => {
    setParsing(true)
    setImportResult(null)
    setHeaderError(null)
    try {
      const extension = file.name.toLowerCase().split('.').pop() ?? ''
      let rawRows: Record<string, unknown>[] = []
      let rawHeaders: string[] = []

      if (extension === 'csv') {
        const Papa = (await import('papaparse')).default
        rawRows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: 'greedy',
            complete: (result) => {
              rawHeaders = (result.meta.fields ?? []).map((h) => String(h).trim())
              resolve(result.data)
            },
            error: (error) => reject(error),
          })
        })
      } else if (extension === 'xlsx' || extension === 'xls') {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        // Dòng 1 = tiêu đề cột (giữ nguyên hoa/thường để kiểm tra MaSV)
        const headerRow = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
          header: 1,
        })[0]
        rawHeaders = (headerRow ?? []).map((cell) => String(cell ?? '').trim())
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: '',
        })
      } else {
        setToast({
          type: 'error',
          message: 'Chỉ hỗ trợ file .csv, .xlsx, .xls — hãy dùng file mẫu.',
        })
        return
      }

      // [ĐIỀU KIỆN BẮT BUỘC] Header phải có cột đúng chính xác `MaSV`
      // (phân biệt hoa thường). Sai/thiếu -> CHẶN NGAY, không preview.
      if (!rawHeaders.includes(MASV_HEADER)) {
        setRows([])
        setFileName(file.name)
        setHeaderError(MASV_HEADER_ERROR)
        setToast({ type: 'error', message: MASV_HEADER_ERROR })
        return
      }

      if (rawRows.length === 0) {
        setToast({ type: 'error', message: 'File không có dòng dữ liệu nào.' })
        return
      }
      if (rawRows.length > 200) {
        setToast({
          type: 'error',
          message: `File có ${rawRows.length} dòng — mỗi lần import tối đa 200 dòng.`,
        })
        return
      }

      setRows(markDuplicateMaSV(rawRows.map(toPreviewRow)))
      setFileName(file.name)
    } catch (error) {
      setToast({
        type: 'error',
        message: `Không đọc được file: ${error instanceof Error ? error.message : 'lỗi không rõ'}`,
      })
    } finally {
      setParsing(false)
    }
  }, [])

  function resetAll() {
    setRows([])
    setFileName(null)
    setImportResult(null)
    setHeaderError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---------- Import thật (chỉ khi 100% dòng hợp lệ) ----------
  async function handleImport() {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cơ sở ở góc trên bên phải.' })
      return
    }
    setImporting(true)
    const payload = rows.map((row) => ({
      maSV: row.maSV,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      address: row.address,
    }))
    const result = await bulkImportStudents(payload, currentOrgId)
    setImporting(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setImportResult(result)
    setToast({
      type: result.failedCount === 0 ? 'success' : 'error',
      message: `Import xong: thành công ${result.successCount} dòng, thất bại ${result.failedCount} dòng.`,
    })
  }

  // ---------- Cột preview ----------
  const columns = useMemo<ColumnDef<PreviewRow>[]>(
    () => [
      {
        accessorKey: 'index',
        meta: { label: 'STT' },
        header: 'STT',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'maSV',
        meta: { label: 'MaSV' },
        header: sortableHeader<PreviewRow>('MaSV'),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-indigo-700">
            {row.original.maSV || <em className="text-rose-500">(thiếu MaSV)</em>}
          </span>
        ),
      },
      {
        accessorKey: 'fullName',
        meta: { label: 'Họ tên' },
        header: sortableHeader<PreviewRow>('Họ tên'),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.fullName || <em className="text-rose-500">(thiếu tên)</em>}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        meta: { label: 'Email' },
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email || '—'}</span>
        ),
      },
      {
        accessorKey: 'phone',
        meta: { label: 'SĐT' },
        header: 'SĐT',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.phone || '—'}</span>
        ),
      },
      {
        accessorKey: 'address',
        meta: { label: 'Địa chỉ' },
        header: 'Địa chỉ',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.address || '—'}</span>
        ),
      },
      {
        id: 'status',
        enableHiding: false,
        header: 'Kiểm tra',
        cell: ({ row }) =>
          row.original.errors.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Hợp lệ
            </span>
          ) : (
            <ul className="space-y-0.5">
              {row.original.errors.map((error) => (
                <li
                  key={error}
                  className="flex items-start gap-1 text-xs font-medium text-rose-600"
                >
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </li>
              ))}
            </ul>
          ),
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div>
        <Link
          href="/students"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại Quản lý Học sinh
        </Link>
        <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <FileSpreadsheet className="h-7 w-7 text-primary" aria-hidden="true" />
          Import Học sinh từ Excel/CSV
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Học sinh được gán vào cơ sở đang chọn.
        </p>
        <div className="mt-3">
          <SectionTabs
            tabs={[
              { label: 'Danh sách học sinh', href: '/students' },
              { label: 'Import Excel/CSV', href: '/students/import' },
            ]}
          />
        </div>
      </div>

      {/* ===== Bước 1: Template + Dropzone ===== */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Bước 1 · Tải file mẫu
          </h2>
          <button
            type="button"
            onClick={downloadTemplateXlsx}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            File mẫu Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={downloadTemplateCsv}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            File mẫu CSV
          </button>
          <p className="text-xs text-muted-foreground">
            Cột bắt buộc: <strong className="text-foreground">MaSV</strong> (đúng chính
            xác hoa/thường), Họ tên, Email, Số điện thoại. Địa chỉ tùy chọn.
          </p>
        </div>

        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Kéo thả hoặc bấm để chọn file Excel/CSV"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) handleFile(file)
          }}
          className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dragging
              ? 'border-primary bg-indigo-50'
              : 'border-border bg-surface hover:border-primary/60 hover:bg-indigo-50/50'
          }`}
        >
          {parsing ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium text-muted-foreground">Đang đọc file…</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-9 w-9 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                Bước 2 · Kéo/thả file vào đây hoặc bấm để chọn
              </p>
              <p className="text-xs text-muted-foreground">
                Hỗ trợ .xlsx, .xls, .csv — tối đa 200 dòng/lần
              </p>
              {fileName && (
                <p className="mt-1 rounded-lg bg-indigo-50 px-3 py-1 font-mono text-xs text-primary">
                  {fileName}
                </p>
              )}
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>
      </div>

      {/* ===== Báo đỏ: file thiếu cột định danh MaSV ===== */}
      {headerError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-4"
        >
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <p className="font-heading text-sm font-bold text-rose-700">{headerError}</p>
            <p className="mt-1 text-xs text-rose-600">
              Mở file{fileName ? ` "${fileName}"` : ''}, đổi tiêu đề cột mã định danh thành
              đúng chính xác <strong>MaSV</strong> (phân biệt hoa thường) rồi upload lại —
              hoặc tải file mẫu ở Bước 1.
            </p>
          </div>
        </div>
      )}

      {/* ===== Bước 3: Preview "Bản nháp" ===== */}
      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-bold">
                Bản nháp — {rows.length} dòng
              </h2>
              {errorRowCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {errorRowCount} dòng lỗi — sửa file rồi upload lại
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Tất cả hợp lệ — sẵn sàng import
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Làm lại
              </button>
              {/* CHỈ hiện khi không còn dòng đỏ */}
              {allValid && !importResult && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  )}
                  Tiến hành Import {rows.length} học sinh
                </button>
              )}
            </div>
          </div>

          <SmartTable
            columns={columns}
            data={rows}
            searchKey="fullName"
            searchPlaceholder="Tìm theo họ tên…"
            emptyMessage="Không có dòng dữ liệu."
            rowClassName={(row) =>
              row.errors.length > 0 ? 'bg-rose-50/70 hover:bg-rose-50' : ''
            }
          />
        </div>
      )}

      {/* ===== Kết quả import ===== */}
      {importResult && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-heading text-lg font-bold">Kết quả Import</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Thành công {importResult.successCount} dòng
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${
                importResult.failedCount > 0
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-slate-50 text-muted-foreground'
              }`}
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Thất bại {importResult.failedCount} dòng
            </span>
          </div>

          {importResult.rows.some((row) => row.outcome !== 'inserted') && (
            <ul className="mt-3.5 space-y-1.5 border-t border-border pt-3.5">
              {importResult.rows
                .filter((row) => row.outcome !== 'inserted')
                .map((row) => (
                  <li
                    key={row.rowIndex}
                    className={`flex items-start gap-2 text-sm ${
                      row.outcome === 'failed' ? 'text-rose-600' : 'text-amber-700'
                    }`}
                  >
                    {row.outcome === 'failed' ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      Dòng {row.rowIndex + 1} · {row.fullName}: {row.message}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
