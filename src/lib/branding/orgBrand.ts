import type { OrgTreeNode } from '@/lib/utils/org-tree'

/** src dùng cho <img> — http(s), data:, hoặc /api/org-logo/{id} */
export function resolveLogoSrc(opts: {
  id: string
  logo_url?: string | null
  logo_key?: string | null
}): string | null {
  const url = opts.logo_url?.trim()
  if (url) {
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:') ||
      url.startsWith('/')
    ) {
      return url
    }
  }
  if (opts.logo_key) return `/api/org-logo/${opts.id}`
  return null
}

/** Leo cây: ưu tiên logo của org hiện tại, rồi tổ tiên (cơ sở → đơn vị). */
export function resolveLogoFromTree(
  orgId: string | null,
  tree: OrgTreeNode[]
): string | null {
  if (!orgId) return null
  const byId = new Map<string, OrgTreeNode>()
  function walk(nodes: OrgTreeNode[]) {
    for (const n of nodes) {
      byId.set(n.id, n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree)

  let cursor: string | null = orgId
  for (let i = 0; i < 8 && cursor; i++) {
    const node = byId.get(cursor)
    if (!node) break
    const src = resolveLogoSrc({
      id: node.id,
      logo_url: node.logo_url,
      logo_key: node.logo_key,
    })
    if (src) return src
    cursor = node.parent_id
  }
  return null
}

/** Cập nhật logo_url trên 1 node trong cây (sau upload ở Settings). */
export function patchLogoInTree(
  tree: OrgTreeNode[],
  orgId: string,
  logoUrl: string | null
): OrgTreeNode[] {
  return tree.map((n) => ({
    ...n,
    logo_url: n.id === orgId ? logoUrl : n.logo_url,
    logo_key: n.id === orgId ? (logoUrl ? n.logo_key : null) : n.logo_key,
    children: n.children?.length ? patchLogoInTree(n.children, orgId, logoUrl) : n.children,
  }))
}
