import { useOrgStore } from './useOrgStore'

/**
 * @deprecated Adapter giữ tương thích với các module cũ (Lớp học, Điểm danh, Tính lương).
 * Kiến trúc đã chuyển sang multi-tier: `selectedCampusId` giờ chính là `currentOrgId`
 * của useOrgStore (giá trị là org_id). Code mới hãy dùng thẳng `useOrgStore`.
 */
type LegacyCampusState = {
  selectedCampusId: string | null
  setCampusId: (campusId: string | null) => void
}

export function useCampusStore<T>(selector: (state: LegacyCampusState) => T): T {
  return useOrgStore((state) =>
    selector({
      selectedCampusId: state.currentOrgId,
      setCampusId: state.setCurrentOrgId,
    })
  )
}
