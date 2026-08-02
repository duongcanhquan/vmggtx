'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { getOrganizations } from '@/lib/actions/organizations'
import {
  buildOrgTree,
  findOrgNode,
  getAncestorIds,
  ORG_TYPE_LABELS,
  type OrgTreeNode,
  type OrgType,
} from '@/lib/utils/org-tree'

const TYPE_BADGE_CLASSES: Record<OrgType, string> = {
  hq: 'bg-indigo-50 text-indigo-700',
  region: 'bg-violet-50 text-violet-700',
  campus: 'bg-sky-50 text-sky-700',
  branch: 'bg-emerald-50 text-emerald-700',
}

function TypeBadge({ type }: { type: OrgType }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE_CLASSES[type]}`}
    >
      {ORG_TYPE_LABELS[type]}
    </span>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  currentOrgId,
}: {
  node: OrgTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  currentOrgId: string | null
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  const isSelected = currentOrgId === node.id

  return (
    <li>
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `Thu gọn ${node.name}` : `Mở rộng ${node.name}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.id)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-slate-100 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={isSelected ? 'true' : undefined}
          className={`flex min-h-10 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isSelected
              ? 'bg-indigo-50 font-semibold text-primary'
              : 'text-foreground hover:bg-slate-50'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <span className="truncate">{node.name}</span>
            <TypeBadge type={node.type} />
          </span>
          {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
        </button>
      </div>

      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              currentOrgId={currentOrgId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OrgTreeSelector() {
  const { currentOrgId, userOrgId, orgTree, setCurrentOrgId, initializeOrg } = useOrgStore()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  // Nạp cây tổ chức: ưu tiên DB (RLS tự cắt theo quyền), fallback mock khi DB trống
  useEffect(() => {
    if (orgTree.length > 0) return
    let cancelled = false
    getOrganizations().then((result) => {
      if (cancelled) return
      // Production: không mock cây giả khi DB trống/lỗi — để UI empty rõ ràng
      if (result.error || result.data.length === 0) {
        initializeOrg([], result.userOrgId ?? null)
        return
      }
      const tree = buildOrgTree(result.data)
      // userOrgId = profiles.org_id (không lấy tree[0] — có thể là HQ tổ tiên)
      const rootId =
        result.userOrgId && findOrgNode(tree, result.userOrgId)
          ? result.userOrgId
          : (tree[0]?.id ?? null)
      initializeOrg(tree, rootId)
    })
    return () => {
      cancelled = true
    }
  }, [orgTree.length, initializeOrg])

  // Mở popover: tự expand đường dẫn tới org đang chọn
  useEffect(() => {
    if (!open || !currentOrgId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      getAncestorIds(orgTree, currentOrgId).forEach((id) => next.add(id))
      next.add(currentOrgId)
      return next
    })
  }, [open, currentOrgId, orgTree])

  // Đóng khi click ra ngoài hoặc bấm Escape
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectedNode = currentOrgId ? findOrgNode(orgTree, currentOrgId) : null
  const userNode = userOrgId ? findOrgNode(orgTree, userOrgId) : null
  // User cấp thấp nhất (không có org con) => hiển thị tĩnh, không sổ xuống được
  const isLeafUser = !!userNode && userNode.children.length === 0

  if (orgTree.length === 0) {
    return <div className="h-11 w-48 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
  }

  if (isLeafUser && userNode) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm shadow-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium text-foreground">{userNode.name}</span>
        <TypeBadge type={userNode.type} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Chọn cấp quản lý"
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm shadow-sm transition-colors duration-200 hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {selectedNode ? (
          <span className="flex items-center gap-2">
            <span className="max-w-40 truncate font-medium text-foreground sm:max-w-56">
              {selectedNode.name}
            </span>
            <TypeBadge type={selectedNode.type} />
          </span>
        ) : (
          <span className="text-muted-foreground">Chọn cấp quản lý</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-lg">
          <p className="px-2.5 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cây tổ chức của bạn
          </p>
          <ul role="listbox" aria-label="Cây tổ chức">
            {orgTree.map((root) => (
              <TreeItem
                key={root.id}
                node={root}
                depth={0}
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) {
                      next.delete(id)
                    } else {
                      next.add(id)
                    }
                    return next
                  })
                }
                onSelect={(id) => {
                  setCurrentOrgId(id)
                  setOpen(false)
                }}
                currentOrgId={currentOrgId}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
