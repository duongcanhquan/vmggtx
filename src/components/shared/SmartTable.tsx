'use client'

import { useEffect, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

// ============================================================
// SmartTable - Bảng dữ liệu thông minh dùng chung toàn hệ thống.
// Engine: TanStack Table v8 (headless). UI: design system nội bộ
// (Shadcn chưa cài trong dự án nên component tự dựng theo cùng chuẩn).
//
// Tính năng: Search theo cột, Sorting click header, Ẩn/hiện cột,
// Pagination, Row Actions (menu 3 chấm).
// ============================================================

// ---------- Hook: đóng dropdown khi click ra ngoài / nhấn Esc ----------
function useDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss()
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss])

  return ref
}

// ---------- Helper: header có nút sort cho ColumnDef ----------
export function sortableHeader<TData>(label: string) {
  function SortableHeaderCell({ column }: { column: Column<TData, unknown> }) {
    const sorted = column.getIsSorted()
    return (
      <button
        type="button"
        onClick={() => column.toggleSorting(sorted === 'asc')}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 font-semibold transition-colors duration-150 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        {sorted === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : sorted === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
        )}
      </button>
    )
  }
  return SortableHeaderCell
}

// ---------- Row Actions: menu 3 chấm cuối dòng ----------
export type RowAction = {
  label: string
  icon?: LucideIcon
  onClick: () => void
  /** 'destructive' hiển thị màu đỏ (VD: Xóa) */
  variant?: 'default' | 'destructive'
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(() => setOpen(false))

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        aria-label="Mở menu thao tác"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-20 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  action.variant === 'destructive'
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-foreground hover:bg-indigo-50'
                }`}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {action.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- SmartTable ----------
interface SmartTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** accessorKey của cột dùng cho ô tìm kiếm text */
  searchKey?: string
  searchPlaceholder?: string
  emptyMessage?: string
  /** Tùy chọn: class bổ sung cho từng dòng (VD: highlight hóa đơn quá hạn) */
  rowClassName?: (row: TData) => string
}

export function SmartTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Tìm kiếm…',
  emptyMessage = 'Không có dữ liệu.',
  rowClassName,
}: SmartTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false)
  const columnsMenuRef = useDismiss(() => setColumnsMenuOpen(false))

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: { pagination: { pageSize: 10 } },
    state: { sorting, columnFilters, columnVisibility },
  })

  const searchColumn = searchKey ? table.getColumn(searchKey) : undefined
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination

  return (
    <div className="space-y-3">
      {/* ===== Toolbar: Search + Ẩn/hiện cột ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {searchColumn ? (
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={(searchColumn.getFilterValue() as string) ?? ''}
              onChange={(e) => searchColumn.setFilterValue(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : (
          <div />
        )}

        <div ref={columnsMenuRef} className="relative self-start sm:self-auto">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={columnsMenuOpen}
            onClick={() => setColumnsMenuOpen((v) => !v)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Cột hiển thị
          </button>

          {columnsMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 z-20 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg"
            >
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors duration-150 hover:bg-indigo-50"
                  >
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={(e) => column.toggleVisibility(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-indigo-600"
                    />
                    {typeof column.columnDef.meta === 'object' &&
                    column.columnDef.meta !== null &&
                    'label' in column.columnDef.meta
                      ? String((column.columnDef.meta as { label: string }).label)
                      : column.id}
                  </label>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Bảng ===== */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} scope="col" className="px-4 py-3 font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border last:border-b-0 hover:bg-indigo-50/30 ${
                      rowClassName?.(row.original) ?? ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Pagination ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredCount === 0
            ? '0 dòng'
            : `Hiển thị ${pageIndex * pageSize + 1}–${Math.min(
                (pageIndex + 1) * pageSize,
                filteredCount
              )} trong ${filteredCount} dòng`}
        </p>

        <div className="flex items-center gap-2">
          <label htmlFor="smart-table-page-size" className="text-xs text-muted-foreground">
            Số dòng/trang
          </label>
          <select
            id="smart-table-page-size"
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="min-h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[5, 10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-label="Trang trước"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-medium text-foreground">
            {table.getPageCount() === 0 ? 0 : pageIndex + 1}/{table.getPageCount()}
          </span>
          <button
            type="button"
            aria-label="Trang sau"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
