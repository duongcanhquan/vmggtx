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

/** Badge cấp đơn vị — trung tính, sang (không tím chói) */
const TYPE_BADGE_CLASSES: Record<OrgType, string> = {
  hq: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200/80',
  region: 'bg-amber-50/90 text-amber-900/80 ring-1 ring-amber-200/70',
  campus: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80',
  branch: 'bg-emerald-50/90 text-emerald-900/75 ring-1 ring-emerald-200/60',
}

function TypeBadge({ type }: { type: OrgType }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${TYPE_BADGE_CLASSES[type]}`}
    >
      {ORG_TYPE_LABELS[type]}
    </span>
  )
}

const PANEL =
  'rounded-2xl border border-stone-200/90 bg-[#FCFAF7] shadow-[0_12px_40px_-16px_rgba(28,25,23,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]'
const HAIRLINE =
  'h-px w-full bg-gradient-to-r from-transparent via-amber-600/35 to-transparent'

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
        className="flex items-start gap-0.5"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? `Thu gọn ${node.name}` : `Mở rộng ${node.name}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(node.id)}
            className="mt-0.5 flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="mt-0.5 h-8 w-7 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={isSelected ? 'true' : undefined}
          className={`flex min-h-9 flex-1 cursor-pointer items-start justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isSelected
              ? 'bg-stone-900/[0.06] font-semibold text-stone-900 ring-1 ring-amber-600/25'
              : 'text-stone-800 hover:bg-stone-100/80'
          }`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] leading-snug break-words">{node.name}</span>
            <TypeBadge type={node.type} />
          </span>
          {isSelected && (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
          )}
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

  useEffect(() => {
    if (orgTree.length > 0) return
    let cancelled = false
    getOrganizations().then((result) => {
      if (cancelled) return
      if (result.error || result.data.length === 0) {
        initializeOrg([], result.userOrgId ?? null)
        return
      }
      const tree = buildOrgTree(result.data)
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

  useEffect(() => {
    if (!open || !currentOrgId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      getAncestorIds(orgTree, currentOrgId).forEach((id) => next.add(id))
      next.add(currentOrgId)
      return next
    })
  }, [open, currentOrgId, orgTree])

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
  const isLeafUser = !!userNode && userNode.children.length === 0

  if (orgTree.length === 0) {
    return <div className="h-8 w-36 animate-pulse rounded-lg bg-stone-100" aria-hidden="true" />
  }

  if (isLeafUser && userNode) {
    return (
      <div
        className="flex max-w-[min(16rem,42vw)] items-center gap-1.5 rounded-lg border border-stone-200/90 bg-[#FCFAF7] px-2.5 py-1.5 shadow-sm"
        title={userNode.name}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden="true" />
        <span className="text-[11px] font-medium leading-tight text-stone-800 line-clamp-2">
          {userNode.name}
        </span>
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
        title={selectedNode?.name ?? 'Chọn cấp quản lý'}
        className={`flex max-w-[min(14rem,40vw)] cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200/90 bg-[#FCFAF7] px-2.5 py-1.5 text-left shadow-sm transition-colors duration-200 hover:border-amber-600/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open ? 'border-amber-600/45 ring-1 ring-amber-600/20' : ''
        }`}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden="true" />
        {selectedNode ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium leading-tight text-stone-800">
              {selectedNode.name}
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-stone-500">Chọn đơn vị</span>
        )}
        {selectedNode && <TypeBadge type={selectedNode.type} />}
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-stone-400" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.25rem))] ${PANEL}`}
        >
          <div className="px-3.5 pb-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
              Đơn vị đang thao tác
            </p>
            {selectedNode && (
              <p className="mt-1 text-[13px] font-semibold leading-snug text-stone-900 break-words">
                {selectedNode.name}
              </p>
            )}
          </div>
          <div className={HAIRLINE} aria-hidden="true" />
          <div className="p-2">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400">
              Cây tổ chức
            </p>
            {/* Không max-height / overflow — hiện đủ tên, không scrollbar nội bộ */}
            <ul role="listbox" aria-label="Cây tổ chức" className="space-y-0.5">
              {orgTree.map((root) => (
                <TreeItem
                  key={root.id}
                  node={root}
                  depth={0}
                  expanded={expanded}
                  onToggle={(id) =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
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
        </div>
      )}
    </div>
  )
}
