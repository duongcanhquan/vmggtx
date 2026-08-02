/** Constants chia sẻ client + server (không đặt trong 'use server'). */

export const KB_CATEGORIES = [
  { value: 'training', label: 'Đào tạo / bài giảng' },
  { value: 'admissions', label: 'Tuyển sinh / CRM' },
  { value: 'general', label: 'Chung (cơ sở)' },
] as const

export type KbCategory = (typeof KB_CATEGORIES)[number]['value']
