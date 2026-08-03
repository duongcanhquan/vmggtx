/** Cấp tổ chức trong hệ thống đa tầng: HQ -> Region -> Campus -> Branch */
export type OrgType = 'hq' | 'region' | 'campus' | 'branch'

/** Dữ liệu phẳng đọc từ bảng `organizations` */
export type OrgFlat = {
  id: string
  name: string
  type: OrgType
  parent_id: string | null
  /** Slug URL công khai (campus) → /{slug}/login */
  slug?: string | null
  /** Logo thương hiệu */
  logo_url?: string | null
  logo_key?: string | null
}

/** Node dạng cây sau khi dựng từ dữ liệu phẳng */
export type OrgTreeNode = OrgFlat & { children: OrgTreeNode[] }

// [ORG_MODEL.md] Thuật ngữ thống nhất: campus = ĐƠN VỊ giáo dục gốc
// (Trường/Trung tâm GD), branch = Cơ sở/Trung tâm bên trong Đơn vị.
// hq/region là di sản — chỉ hiển thị, không tạo mới.
export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  hq: 'Hệ thống',
  region: 'Khối (cũ)',
  campus: 'Đơn vị (Trường)',
  branch: 'Cơ sở / Trung tâm',
}

/**
 * Chuyển danh sách phẳng (id + parent_id) thành cây.
 * Node có parent_id không nằm trong danh sách (do RLS cắt bớt) được coi là gốc —
 * nhờ vậy user cấp Cụm sẽ thấy Cụm của mình là gốc của cây.
 */
export function buildOrgTree(flat: OrgFlat[]): OrgTreeNode[] {
  const nodeById = new Map<string, OrgTreeNode>()
  for (const org of flat) {
    nodeById.set(org.id, { ...org, children: [] })
  }

  const roots: OrgTreeNode[] = []
  for (const node of nodeById.values()) {
    const parent = node.parent_id ? nodeById.get(node.parent_id) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/** Tìm node theo id trong cây */
export function findOrgNode(tree: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findOrgNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Trả về danh sách id tổ tiên (không gồm chính nó) của một node - dùng để auto-expand */
export function getAncestorIds(tree: OrgTreeNode[], id: string): string[] {
  const path: string[] = []

  function walk(nodes: OrgTreeNode[], trail: string[]): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        path.push(...trail)
        return true
      }
      if (walk(node.children, [...trail, node.id])) return true
    }
    return false
  }

  walk(tree, [])
  return path
}
