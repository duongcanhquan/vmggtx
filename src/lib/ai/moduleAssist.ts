/**
 * Cấu hình AI theo module vận hành (FAB + panel).
 * taskType 'module_assist' + kbCategory → RAG ưu tiên category tương ứng trong KB.
 */

export const MODULE_KEYS = [
  'admissions',
  'training',
  'admin',
  'exams',
  'hr',
  'finance',
  'general',
] as const

export type ModuleAiKey = (typeof MODULE_KEYS)[number]

export type ModuleAiPreset = {
  key: ModuleAiKey
  title: string
  subtitle: string
  /** Gửi lên /api/ai/copilot */
  taskType: 'module_assist' | 'crm_assist' | 'hr_query' | 'lesson_plan'
  kbCategory: string
  suggestions: string[]
  placeholder: string
}

export const MODULE_AI_PRESETS: Record<ModuleAiKey, ModuleAiPreset> = {
  admissions: {
    key: 'admissions',
    title: 'AI Tuyển sinh',
    subtitle: 'Hỏi FAQ học phí, chương trình, lịch khai giảng (RAG category=admissions).',
    taskType: 'crm_assist',
    kbCategory: 'admissions',
    suggestions: [
      'Học phí và ưu đãi chương trình phổ biến hiện nay?',
      'Lịch khai giảng / lịch test đầu vào tuần này?',
      'Cách trả lời phụ huynh hỏi về lộ trình chuyển cấp?',
    ],
    placeholder: 'Hỏi về học phí, chương trình, lịch khai giảng…',
  },
  training: {
    key: 'training',
    title: 'AI Đào tạo',
    subtitle: 'Hỗ trợ lịch học, chương trình, quy trình học vụ (KB training/general).',
    taskType: 'module_assist',
    kbCategory: 'training',
    suggestions: [
      'Tóm tắt quy trình xếp lớp / chuyển lớp theo tài liệu nội bộ.',
      'Gợi ý checklist chuẩn bị đầu học kỳ cho giáo vụ.',
      'Các bước xử lý học viên nghỉ dài ngày?',
    ],
    placeholder: 'Hỏi về đào tạo, TKB, quy trình học vụ…',
  },
  admin: {
    key: 'admin',
    title: 'AI Hành chính / CSVC',
    subtitle: 'Quy chế đặt phòng, xe, tài sản, thông báo nội bộ.',
    taskType: 'module_assist',
    kbCategory: 'admin',
    suggestions: [
      'Quy trình đặt phòng họp / phòng học?',
      'Ai được duyệt mượn xe cơ sở?',
      'Checklist bàn giao tài sản cuối năm?',
    ],
    placeholder: 'Hỏi quy chế CSVC, hành chính…',
  },
  exams: {
    key: 'exams',
    title: 'AI Khảo thí',
    subtitle: 'Quy chế thi, công bố điểm, lộ trình học (KB exams/general).',
    taskType: 'module_assist',
    kbCategory: 'exams',
    suggestions: [
      'Quy trình lập lịch thi và phân công coi thi?',
      'Khi nào được công bố điểm cho học viên?',
      'Checklist trước kỳ thi cuối kỳ?',
    ],
    placeholder: 'Hỏi về khảo thí, công bố điểm…',
  },
  hr: {
    key: 'hr',
    title: 'AI Nhân sự',
    subtitle: 'Quy chế phép, chấm công, hợp đồng (KB hr — dùng hr_query).',
    taskType: 'hr_query',
    kbCategory: 'hr',
    suggestions: [
      'Số ngày phép năm và cách xin nghỉ?',
      'Quy định chấm công / đi muộn?',
      'Tóm tắt quy trình ký hợp đồng lao động mới.',
    ],
    placeholder: 'Hỏi quy chế nhân sự, phép, chấm công…',
  },
  finance: {
    key: 'finance',
    title: 'AI Tài chính',
    subtitle: 'Học phí, hóa đơn, quy tắc thu (KB finance/general).',
    taskType: 'module_assist',
    kbCategory: 'finance',
    suggestions: [
      'Quy trình xuất hóa đơn học phí?',
      'Các bước xử lý nợ học phí quá hạn?',
      'Tóm tắt quy tắc học phí theo tài liệu nội bộ.',
    ],
    placeholder: 'Hỏi về học phí, hóa đơn, công nợ…',
  },
  general: {
    key: 'general',
    title: 'Trợ lý AI cơ sở',
    subtitle: 'Hỏi theo kho tri thức chung của đơn vị đang chọn.',
    taskType: 'module_assist',
    kbCategory: 'general',
    suggestions: [
      'Cơ sở này có những quy định nội bộ nào nổi bật?',
      'Gợi ý câu hỏi nên nạp thêm vào kho tri thức AI.',
    ],
    placeholder: 'Hỏi bất kỳ theo tài liệu KB của cơ sở…',
  },
}

/** Map pathname dashboard / staff portal → module AI. */
export function resolveModuleAiFromPath(pathname: string): ModuleAiPreset {
  const p = pathname.toLowerCase()
  if (p.startsWith('/crm') || p.includes('/admissions')) {
    return MODULE_AI_PRESETS.admissions
  }
  if (
    p.startsWith('/exam') ||
    p.includes('/exam-') ||
    p.includes('/khao-thi') ||
    p.startsWith('/staff/exam') ||
    p.includes('/learning-pathway') ||
    p.includes('/results-approval') ||
    p.includes('/assessments') ||
    p.startsWith('/reports/exams') ||
    p.includes('/transcripts')
  ) {
    return MODULE_AI_PRESETS.exams
  }
  if (
    p.startsWith('/facilities') ||
    p.startsWith('/assets') ||
    p.startsWith('/announcements') ||
    p.startsWith('/staff/facilities') ||
    p.startsWith('/staff/admin') ||
    p.includes('/admin-ops')
  ) {
    return MODULE_AI_PRESETS.admin
  }
  if (
    p.startsWith('/academic') ||
    p.startsWith('/schedule') ||
    p.startsWith('/attendance') ||
    p.startsWith('/students') ||
    p.startsWith('/staff/classes') ||
    p.startsWith('/staff/timetable') ||
    p.startsWith('/staff/schedule') ||
    p.startsWith('/staff/training') ||
    p.includes('/lms') ||
    p.includes('/warnings') ||
    p.includes('/campaigns')
  ) {
    return MODULE_AI_PRESETS.training
  }
  if (p.startsWith('/hr') || p.includes('/payroll') || p.includes('/salary')) {
    return MODULE_AI_PRESETS.hr
  }
  if (p.startsWith('/finance') || p.includes('/invoice') || p.includes('/tuition')) {
    return MODULE_AI_PRESETS.finance
  }
  if (p.startsWith('/ai')) {
    return MODULE_AI_PRESETS.general
  }
  return MODULE_AI_PRESETS.general
}
