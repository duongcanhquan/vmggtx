import type { MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// CATALOG MODULE - nguồn sự thật cho Trung tâm Module (/admin/modules)
// Mỗi module: mô tả CÁCH HOẠT ĐỘNG + danh sách TÍNH NĂNG CON có thể
// bật/tắt riêng (module_flags - migration 046).
// - feature.key ghép thành cờ "moduleKey.featureKey" (VD 'students.import').
// - feature.routePrefix (nếu có) để middleware chặn URL khi bị tắt.
// ============================================================

export interface ModuleFeature {
  key: string
  label: string
  description: string
  /** Prefix URL để middleware chặn khi feature bị tắt (tùy chọn) */
  routePrefix?: string
}

/** Nhóm module — dùng làm TAB ở Trung tâm Module cho dễ theo dõi */
export type ModuleGroupKey = 'students' | 'academic' | 'teachers' | 'finance' | 'system'

export const MODULE_GROUPS: { key: ModuleGroupKey; label: string; description: string }[] = [
  { key: 'students', label: 'Học viên & Tuyển sinh', description: 'Hồ sơ, CRM lead, thông báo tới gia đình.' },
  { key: 'academic', label: 'Đào tạo & Khảo thí', description: 'Lớp học, điểm danh, kỳ thi, cảnh báo học vụ.' },
  { key: 'teachers', label: 'Giáo viên & Nhân sự', description: 'Lịch dạy, đơn từ, đánh giá, tài khoản nhân viên.' },
  { key: 'finance', label: 'Tài chính & Tài sản', description: 'Học phí, lương, hợp đồng, tài sản khấu hao.' },
  { key: 'system', label: 'Hệ thống & AI', description: 'Kho tri thức AI, cài đặt, tổ chức, phân quyền.' },
]

export interface ModuleInfo {
  key: MenuKey
  label: string
  /** Nhóm hiển thị (tab) ở Trung tâm Module */
  group: ModuleGroupKey
  /** Mô tả ngắn: module phục vụ gì */
  summary: string
  /** Cách hoạt động: luồng nghiệp vụ chính */
  howItWorks: string
  features: ModuleFeature[]
}

export const MODULE_CATALOG: ModuleInfo[] = [
  {
    key: 'students',
    label: 'Hồ sơ Học sinh',
    group: 'students',
    summary: 'Quản lý hồ sơ, mã học viên (MaSV), nhập liệu hàng loạt bằng Excel.',
    howItWorks:
      'Giáo vụ/tuyển sinh tạo hồ sơ từng em hoặc import Excel (bắt buộc cột MaSV). Mã học viên sinh tự động theo quy tắc riêng của từng cơ sở. Hồ sơ gắn cơ sở, lớp, phụ huynh và theo suốt vòng đời học tập.',
    features: [
      {
        key: 'import',
        label: 'Import Excel',
        description: 'Nhập học sinh hàng loạt, kiểm tra trùng MaSV ngay trên file.',
        routePrefix: '/students/import',
      },
      {
        key: 'student_codes',
        label: 'Quy tắc mã học viên',
        description: 'Mỗi cơ sở tự định nghĩa quy tắc sinh MaSV (tiền tố, năm, số thứ tự).',
      },
    ],
  },
  {
    key: 'crm',
    label: 'Tuyển sinh (CRM)',
    group: 'students',
    summary: 'Pipeline lead từ tiếp nhận đến nhập học, báo cáo theo người tuyển sinh.',
    howItWorks:
      'Nhân viên tuyển sinh ghi nhận lead, theo dõi trạng thái (mới → liên hệ → hẹn → nhập học), ghi log hoạt động. Trưởng bộ phận xem báo cáo chuyển đổi theo nhân viên, nguồn, thời gian.',
    features: [
      { key: 'pipeline', label: 'Pipeline lead', description: 'Kanban trạng thái + log chăm sóc từng lead.' },
      { key: 'reports', label: 'Báo cáo tuyển sinh', description: 'Tổng kết theo người tuyển sinh, nguồn, tỉ lệ chốt.' },
    ],
  },
  {
    key: 'announcements',
    label: 'Thông báo chung',
    group: 'students',
    summary: 'Phát thông báo toàn cơ sở tới phụ huynh, học viên, giáo viên.',
    howItWorks:
      'Quản lý/giáo vụ soạn thông báo, chọn đối tượng nhận (tất cả / PH / HV / GV). Thông báo hiện trong cổng tương ứng và sổ liên lạc điện tử.',
    features: [],
  },
  {
    key: 'classes',
    label: 'Lớp học & Gia sư AI',
    group: 'academic',
    summary: 'Quản lý lớp, sĩ số tối đa, ghi danh; Gia sư AI trả lời theo tài liệu lớp.',
    howItWorks:
      'Giáo vụ mở lớp, gán giáo viên và lịch học, kiểm soát sĩ số. Học viên ghi danh/chuyển lớp/bảo lưu. Gia sư AI dùng RAG trên tài liệu bài giảng của đúng lớp đó.',
    features: [
      { key: 'enrollment', label: 'Ghi danh & vòng đời', description: 'Ghi danh, chuyển lớp, bảo lưu, thôi học có ghi chú.' },
      { key: 'tutor_ai', label: 'Gia sư AI theo lớp', description: 'Chatbot RAG trả lời từ tài liệu bài giảng của lớp.' },
    ],
  },
  {
    key: 'attendance',
    label: 'Điểm danh & Sổ liên lạc',
    group: 'academic',
    summary: 'Điểm danh buổi học, nhận xét lớp/học sinh, dặn dò phụ huynh, điểm hành vi.',
    howItWorks:
      'Giáo viên điểm danh từng buổi, ghi nhận xét và dặn dò — nội dung đổ về sổ liên lạc điện tử của phụ huynh. Điểm hành vi cộng/trừ tự động kích hoạt cảnh báo tâm lý khi dưới ngưỡng.',
    features: [
      { key: 'contact_book', label: 'Sổ liên lạc điện tử', description: 'Nhận xét học sinh, nhận xét lớp, dặn dò phụ huynh mỗi buổi.' },
      { key: 'behavior', label: 'Điểm hành vi', description: 'Cộng/trừ điểm rèn luyện, tự tạo ticket tư vấn khi dưới ngưỡng.' },
    ],
  },
  {
    key: 'staff_ops',
    label: 'Giáo vụ & Khảo thí',
    group: 'academic',
    summary: 'Kỳ thi, coi thi, duyệt điểm, bảng điểm, phòng học/cơ sở vật chất.',
    howItWorks:
      'Giáo vụ tạo kỳ thi, phân giám thị, quản lý đề. Điểm nhập xong chuyển duyệt, khóa sổ theo hạn. Học viên xin phúc khảo/thi lại — giáo vụ duyệt và xếp lịch thi lại tự động.',
    features: [
      { key: 'exams', label: 'Kỳ thi & coi thi', description: 'Lịch thi, phân giám thị, ngân hàng đề, mã đề.' },
      { key: 'reexam', label: 'Phúc khảo / thi lại', description: 'Học viên đăng ký, giáo vụ duyệt và tạo kỳ thi lại.' },
      { key: 'facilities', label: 'Phòng & cơ sở vật chất', description: 'Đặt phòng, chống trùng lịch ở tầng database.' },
    ],
  },
  {
    key: 'academic_warnings',
    label: 'Cảnh báo học vụ',
    group: 'academic',
    summary: 'Tự động cảnh báo vắng nhiều, điểm kém, nguy cơ bỏ học.',
    howItWorks:
      'Hệ thống quét điểm danh + điểm số, gắn cờ học viên vượt ngưỡng vắng hoặc điểm thấp. Cảnh báo hiện cho giáo vụ và phụ huynh để can thiệp sớm.',
    features: [],
  },
  {
    key: 'reports',
    label: 'Báo cáo & Phân tích',
    group: 'academic',
    summary: 'Hub báo cáo bento theo vai trò: vận hành, học vụ, khảo thí.',
    howItWorks:
      'Quản lý / Giáo vụ / Kế toán mở /reports xem KPI và biểu đồ đa chiều (chuyên cần, cảnh báo, điểm, doanh thu). Giáo viên và phụ huynh xem báo cáo riêng trên portal.',
    features: [
      { key: 'campus', label: 'Ops Cockpit', description: 'HV, lớp, chuyên cần, công nợ.' },
      { key: 'academic', label: 'Early warning', description: 'Xu hướng cảnh báo học vụ.' },
      { key: 'exams', label: 'Khảo thí', description: 'Phân bố điểm / đậu-rớt.' },
    ],
  },
  {
    key: 'teachers',
    label: 'Hồ sơ Giảng viên',
    group: 'teachers',
    summary: 'Danh bạ giảng viên và gán/gỡ lớp (classes.teacher_id).',
    howItWorks:
      'Giáo vụ xem danh sách giáo viên trong cây tổ chức, gán giáo viên chủ nhiệm lớp hoặc gỡ khi đổi phân công. Menu vận hành riêng khỏi lịch dạy.',
    features: [
      {
        key: 'assign_class',
        label: 'Gán lớp cho GV',
        description: 'Gán/gỡ teacher_id trên lớp học.',
      },
    ],
  },
  {
    key: 'teacher_schedule',
    label: 'Lịch dạy & Xếp lịch',
    group: 'teachers',
    summary: 'Kênh 2 chiều: giáo viên đề xuất lịch/xin nghỉ, giáo vụ duyệt và xếp.',
    howItWorks:
      'Giáo viên gửi đề xuất lịch dạy hoặc xin nghỉ trên cổng riêng. Giáo vụ duyệt: tìm giáo viên dạy thay hoặc hủy/tạo buổi bù, hệ thống tự kiểm tra trùng lịch.',
    features: [
      { key: 'proposals', label: 'Đề xuất & xin nghỉ', description: 'Giáo viên tự gửi đề xuất, theo dõi trạng thái duyệt.' },
      { key: 'makeup', label: 'Buổi học bù', description: 'Tạo buổi bù liên kết buổi đã hủy.' },
    ],
  },
  {
    key: 'teacher_requests',
    label: 'Duyệt đơn giáo viên',
    group: 'teachers',
    summary: 'Tiếp nhận và duyệt các loại đơn từ của giáo viên.',
    howItWorks:
      'Giáo viên nộp đơn (nghỉ phép, đổi lịch, đề xuất...) — giáo vụ xem, duyệt hoặc từ chối kèm ghi chú, giáo viên nhận phản hồi ngay trên cổng.',
    features: [],
  },
  {
    key: 'evaluations',
    label: 'Đánh giá giáo viên',
    group: 'teachers',
    summary: 'Đợt khảo sát chất lượng giảng dạy, phụ huynh/học viên chấm ẩn danh.',
    howItWorks:
      'Quản lý mở đợt khảo sát, hệ thống phát link token ẩn danh cho học viên/phụ huynh. Kết quả tổng hợp thành báo cáo điểm trung bình từng giáo viên.',
    features: [],
  },
  {
    key: 'staff_users',
    label: 'Tài khoản & Nhân viên',
    group: 'teachers',
    summary: 'Tạo và quản lý tài khoản nhân sự: giáo vụ, kế toán, giáo viên...',
    howItWorks:
      'Quản lý cơ sở tạo tài khoản, gán vai trò và cơ sở làm việc. Vai trò quyết định menu và quyền thao tác (kết hợp ma trận phân quyền).',
    features: [],
  },
  {
    key: 'payroll_contracts',
    label: 'Lương & Hợp đồng',
    group: 'finance',
    summary: 'Hợp đồng giáo viên, tính lương theo buổi dạy thực tế, dự báo ngân sách.',
    howItWorks:
      'Hợp đồng khai báo đơn giá/buổi. Kỳ lương chỉ tính buổi đã hoàn thành VÀ có điểm danh. Dự báo ngân sách chạy trên lịch dạy tương lai để quản lý chủ động dòng tiền.',
    features: [
      { key: 'payroll', label: 'Kỳ tính lương', description: 'Tính thù lao theo buổi completed có điểm danh.', routePrefix: '/finance/payroll' },
      { key: 'forecast', label: 'Dự báo ngân sách', description: 'Ước tính chi lương tháng tới từ lịch đã xếp.', routePrefix: '/admin/budget' },
    ],
  },
  {
    key: 'finance_invoices',
    label: 'Học phí & Công nợ',
    group: 'finance',
    summary: 'Hóa đơn học phí, thu tiền in biên lai, nhắc phí tự động, báo cáo tuổi nợ.',
    howItWorks:
      'Kế toán phát hành hóa đơn theo lớp/học viên, thu tiền và in biên lai PDF. Hệ thống tự nhắc phí qua thông báo + sổ liên lạc, báo cáo công nợ chia nhóm 0-7 / 8-30 / >30 ngày.',
    features: [
      { key: 'receipts', label: 'Biên lai PDF', description: 'In/xuất biên lai ngay sau khi thu tiền.' },
      { key: 'reminders', label: 'Nhắc phí tự động', description: 'Thông báo đến phụ huynh khi hóa đơn sắp/quá hạn.' },
      { key: 'aging', label: 'Báo cáo tuổi nợ', description: 'Phân tích công nợ theo nhóm ngày quá hạn.' },
    ],
  },
  {
    key: 'assets',
    label: 'Tài sản & Khấu hao',
    group: 'finance',
    summary: 'Sổ tài sản, khấu hao đường thẳng, điều chuyển giữa các đơn vị.',
    howItWorks:
      'Mỗi tài sản có nguyên giá, thời gian khấu hao — hệ thống tự tính giá trị còn lại. Điều chuyển tài sản giữa cơ sở/chi nhánh/lớp đều ghi log đầy đủ.',
    features: [
      { key: 'depreciation', label: 'Khấu hao', description: 'Tính khấu hao đường thẳng, giá trị còn lại theo thời gian.' },
      { key: 'transfer', label: 'Điều chuyển', description: 'Chuyển tài sản giữa đơn vị, ghi log người chuyển/nhận.' },
    ],
  },
  {
    key: 'ai_kb',
    label: 'Kho tri thức AI',
    group: 'system',
    summary: 'Nạp tài liệu vào kho tri thức, AI trả lời theo đúng dữ liệu của cơ sở.',
    howItWorks:
      'Tài liệu upload được tách đoạn và nhúng vector theo từng cơ sở (org_id). Trợ lý AI và Gia sư AI chỉ truy xuất tri thức của đúng cơ sở đó — không lẫn dữ liệu giữa các đơn vị.',
    features: [],
  },
  {
    key: 'settings_org',
    label: 'Cài đặt Cơ sở',
    group: 'system',
    summary: 'Cá nhân hóa cơ sở: quy tắc mã HV, trường tùy chỉnh, AI, giao diện.',
    howItWorks:
      'Admin cơ sở tự cấu hình mọi thứ trong phạm vi của mình. Cài đặt kế thừa xuống chi nhánh con, chi nhánh có thể ghi đè riêng.',
    features: [],
  },
  {
    key: 'organizations',
    label: 'Cơ sở & Chi nhánh',
    group: 'system',
    summary: 'Cây tổ chức tối đa 3 cấp dưới mỗi cơ sở, mỗi cơ sở có cổng /coso riêng.',
    howItWorks:
      'Admin cơ sở tạo/sửa chi nhánh trong cây con của mình. Mỗi cơ sở có slug riêng cho 3 cổng đăng nhập (quản trị / học viên / phụ huynh).',
    features: [],
  },
  {
    key: 'permissions',
    label: 'Phân quyền truy cập',
    group: 'system',
    summary: 'Ma trận phân quyền menu theo vai trò, trong phạm vi module được cấp.',
    howItWorks:
      'Admin cơ sở tick quyền cho giáo vụ/tuyển sinh/kế toán/giáo viên. Không thể cấp vượt quá module mà Super Admin đã mở cho cơ sở (delegation cap).',
    features: [],
  },
]

export const MODULE_BY_KEY = new Map(MODULE_CATALOG.map((m) => [m.key, m]))

/** Cờ feature dạng "moduleKey.featureKey" */
export function featureFlagKey(moduleKey: MenuKey, featureKey: string): string {
  return `${moduleKey}.${featureKey}`
}

/** Các feature có routePrefix - dùng cho middleware chặn URL khi bị tắt */
export const FEATURE_ROUTES: { flag: string; routePrefix: string }[] =
  MODULE_CATALOG.flatMap((mod) =>
    mod.features
      .filter((f) => f.routePrefix)
      .map((f) => ({ flag: featureFlagKey(mod.key, f.key), routePrefix: f.routePrefix! }))
  )
