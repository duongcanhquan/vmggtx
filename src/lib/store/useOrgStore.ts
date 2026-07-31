import { create } from 'zustand'
import type { OrgTreeNode } from '@/lib/utils/org-tree'

/**
 * Store SỐNG CÒN của hệ thống multi-tier.
 * - `currentOrgId`: tổ chức đang XEM (mọi số liệu lọc theo org này + con/cháu).
 * - `userOrgId`: tổ chức GỐC mà user trực thuộc (profiles.org_id) — giới hạn trên của quyền.
 * - `orgTree`: toàn bộ cây tổ chức user có quyền xem (đã được RLS cắt tỉa từ server).
 */
interface OrgState {
  currentOrgId: string | null
  userOrgId: string | null
  orgTree: OrgTreeNode[]
  setCurrentOrgId: (orgId: string | null) => void
  /** Nạp cây + org gốc của user sau khi fetch; giữ nguyên currentOrgId nếu user đã chọn trước đó */
  initializeOrg: (tree: OrgTreeNode[], userOrgId: string | null) => void
}

export const useOrgStore = create<OrgState>((set) => ({
  currentOrgId: null,
  userOrgId: null,
  orgTree: [],
  setCurrentOrgId: (orgId) => set({ currentOrgId: orgId }),
  initializeOrg: (tree, userOrgId) =>
    set((state) => ({
      orgTree: tree,
      userOrgId,
      currentOrgId: state.currentOrgId ?? userOrgId,
    })),
}))
