'use server'

import {
  assertUserInCampus as assertCampus,
  getPublicBranchChain as getChain,
  getPublicCampusBySlug as getCampus,
} from '@/lib/campus/publicCampus'

export type { PublicCampus, PublicBranchChain } from '@/lib/campus/publicCampus'

/** Legacy wrappers — ưu tiên import từ @/lib/campus/publicCampus */
export async function getPublicCampusBySlug(slug: string) {
  return getCampus(slug)
}

export async function getPublicBranchChain(campusSlug: string, segments: string[]) {
  return getChain(campusSlug, segments)
}

export async function assertUserInCampus(campusId: string, userId?: string) {
  return assertCampus(campusId, userId)
}
