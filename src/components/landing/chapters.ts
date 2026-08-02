import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Building2,
  GraduationCap,
  HeartHandshake,
  Settings2,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'

export type ChapterSlug =
  | 'linh-hoat'
  | 'dao-tao'
  | 'con-nguoi'
  | 'hoc-tap-ai'
  | 'van-hanh'

export type Chapter = {
  slug: ChapterSlug
  title: string
  eyebrow: string
  teaser: string
  heroImage: string
  heroAlt: string
  icon: LucideIcon
  accent: string
  sections: {
    title: string
    body: string
    bullets: string[]
  }[]
}

/** Nhóm tính năng chi tiết — hiển thị trên hub (không chỉ tóm tắt) */
export const FEATURE_GROUPS: {
  title: string
  chapter: ChapterSlug
  items: string[]
}[] = [
  {
    title: 'Đa cơ sở & cấu hình',
    chapter: 'linh-hoat',
    items: [
      'Cây tổ chức nhiều cấp: trường → cơ sở → trung tâm / chi nhánh',
      'Cổng đăng nhập riêng theo từng cơ sở (/coso/…)',
      'Dữ liệu gắn đúng đơn vị — không lẫn giữa các cơ sở',
      '3 quy tắc đặt mã học viên — mỗi cơ sở tự chọn',
      'Trường thông tin riêng (custom fields) theo đơn vị',
      'Bật / tắt module theo gói dịch vụ đã mua',
      'Dashboard kéo-thả, lưu góc nhìn bảng theo từng người',
      'Chuyển học viên / giảng viên giữa các cơ sở',
      'Sẵn sàng mở rộng, sát nhập mà giữ lịch sử học tập & học phí',
    ],
  },
  {
    title: 'Đào tạo · Điểm danh · Khảo thí',
    chapter: 'dao-tao',
    items: [
      'Tạo / sửa lớp, sĩ số tối đa, gán giảng viên',
      'Ghi danh, chuyển lớp, bảo lưu, thôi học, hoàn thành',
      'Điểm danh buổi học: có mặt / vắng / muộn / có phép',
      'Sổ đầu bài: nhận xét học sinh, nhận xét lớp, dặn dò phụ huynh',
      'Ghi nhận hành vi (+/− điểm) + cảnh báo sớm bỏ học',
      'Lịch dạy hai chiều: giáo viên đề xuất / xin nghỉ — giáo vụ duyệt',
      'Dạy thay, dạy bù gắn buổi hủy',
      'Lịch thi, mã đề, phân công giám thị',
      'Khóa sổ điểm, đăng ký thi lại / phúc khảo, duyệt kết quả',
      'Import học viên Excel (bắt buộc cột MaSV)',
    ],
  },
  {
    title: 'Học viên · Giảng viên · Phụ huynh',
    chapter: 'con-nguoi',
    items: [
      'Hồ sơ học viên 360°: lớp, điểm danh, điểm, học phí, hành vi',
      'Sửa thông tin định danh (họ tên, SĐT, địa chỉ, MaSV)',
      'Danh bạ giảng viên + gán / gỡ nhiều lớp cùng lúc',
      'Hợp đồng & tính lương theo buổi đã dạy + điểm danh',
      'Dự báo ngân sách lương theo lịch tháng tới',
      'Phân quyền theo vai trò + gán quyền kiêm nhiệm từng người',
      'Sổ liên lạc phụ huynh: lịch, điểm, học phí, thông báo',
      'Nhắc học phí tự động trên cổng & sổ liên lạc',
      'Thông báo toàn cơ sở',
    ],
  },
  {
    title: 'LMS · AI · Học tập số',
    chapter: 'hoc-tap-ai',
    items: [
      'Bài giảng: upload file / gắn YouTube',
      'Bài tập về nhà + bài tập theo bài giảng',
      'Quiz / kiểm tra online — chấm điểm phía máy chủ',
      'Theo dõi ai đã xem bài, ai nộp bài, ai chưa học',
      'AI hỗ trợ giáo viên soạn đề cương / câu hỏi',
      'AI Tutor trả lời trong phạm vi kiến thức của cơ sở (RAG)',
      'Kho tri thức AI riêng từng đơn vị',
      'Cổng học viên xem bài, nộp bài, hỏi AI',
    ],
  },
  {
    title: 'Tài chính · Tuyển sinh · Hành chính',
    chapter: 'van-hanh',
    items: [
      'Hóa đơn học phí, thu tiền, biên lai in / PDF',
      'Báo cáo công nợ theo tuổi nợ (0–7 / 8–30 / >30 ngày)',
      'Hủy / điều chỉnh hóa đơn có kiểm soát',
      'CRM tuyển sinh: lead, chiến dịch, theo người phụ trách',
      'Báo cáo chuyển đổi tuyển sinh',
      'Quản lý tài sản, khấu hao, luân chuyển giữa đơn vị / lớp',
      'Đơn từ / ticket dịch vụ nội bộ',
      'Báo cáo tổng quan biểu đồ (lớp, điểm danh, nghỉ học…)',
    ],
  },
]

export const CHAPTERS: Chapter[] = [
  {
    slug: 'linh-hoat',
    title: 'Linh hoạt theo từng cơ sở',
    eyebrow: 'Cá nhân hóa · Cấu hình · Chuyển đổi số',
    teaser:
      'Mỗi đơn vị vận hành theo cách riêng — vẫn thống nhất dữ liệu khi cần sát nhập, mở rộng hay giữ độc lập.',
    heroImage: '/landing/campus.webp',
    heroAlt: 'Khuôn viên trường với học sinh đang di chuyển',
    icon: Settings2,
    accent: 'from-teal-400/30 to-sky-500/10',
    sections: [
      {
        title: 'Cấu hình theo thực tế địa bàn',
        body: 'Không ép mọi nơi dùng một khuôn cứng. Bạn chỉnh những gì vận hành hàng ngày cần khác nhau.',
        bullets: [
          '3 quy tắc đặt mã học viên — cơ sở tự chọn',
          'Custom fields cho hồ sơ học viên / nhân sự',
          'Bật / tắt module theo gói đã mua',
          'Dashboard kéo-thả + lưu góc nhìn bảng riêng',
          'Thông báo, biểu mẫu đơn từ theo đơn vị',
        ],
      },
      {
        title: 'Độc lập nhưng không cô lập',
        body: 'Chi nhánh tự chạy việc ngày; khi cần, vẫn nhìn được bức tranh chung.',
        bullets: [
          'Cây tổ chức: trường → cơ sở → trung tâm / nhánh',
          'Dữ liệu gắn org_id — không lẫn tenant',
          'Cổng /coso/[slug]/login riêng từng cơ sở',
          'Phân quyền theo vai trò + kiêm nhiệm từng người',
          'Báo cáo tổng quan theo phạm vi quản lý',
        ],
      },
      {
        title: 'Mở rộng · Sát nhập · Tái cấu trúc',
        body: 'Đổi mô hình tổ chức mà không mất lịch sử học tập và tài chính.',
        bullets: [
          'Thêm cơ sở / trung tâm dưới đơn vị gốc',
          'Chuyển học viên giữa các cơ sở',
          'Chuyển giảng viên / nhân sự giữa các đơn vị',
          'Giữ điểm danh, điểm số, công nợ khi tổ chức đổi',
          'Phù hợp chuyển đổi số từng bước, không “big bang”',
        ],
      },
    ],
  },
  {
    slug: 'dao-tao',
    title: 'Đào tạo khép kín',
    eyebrow: 'Lớp học · Điểm danh · Khảo thí',
    teaser:
      'Từ xếp lớp đến sổ điểm, từ điểm danh đến liên lạc phụ huynh — một chuỗi liền mạch.',
    heroImage: '/landing/teacher.webp',
    heroAlt: 'Giáo viên đang giảng bài trước lớp',
    icon: GraduationCap,
    accent: 'from-sky-400/30 to-blue-600/10',
    sections: [
      {
        title: 'Lớp học & ghi danh',
        body: 'Giáo vụ nắm sĩ số, phân công và vòng đời học viên trong lớp.',
        bullets: [
          'Tạo / sửa lớp, đặt sĩ số tối đa',
          'Gán giảng viên phụ trách',
          'Ghi danh nhanh từ danh sách học viên',
          'Chuyển lớp, bảo lưu, thôi học, hoàn thành',
          'Import Excel bắt buộc cột MaSV',
        ],
      },
      {
        title: 'Điểm danh & sổ đầu bài',
        body: 'Buổi học được ghi nhận đầy đủ — không chỉ tick có mặt.',
        bullets: [
          'Có mặt / vắng / muộn / có phép',
          'Nhận xét học sinh + nhận xét lớp',
          'Dặn dò phụ huynh ngay trong buổi',
          'Ghi hành vi (+/− điểm rèn luyện)',
          'Cảnh báo sớm khi điểm hành vi / vắng quá ngưỡng',
        ],
      },
      {
        title: 'Lịch dạy & khảo thí',
        body: 'Kênh hai chiều với giáo viên; quy trình thi minh bạch.',
        bullets: [
          'Giáo viên đề xuất lịch / xin nghỉ',
          'Giáo vụ duyệt, xếp dạy thay / dạy bù',
          'Lịch thi, mã đề, phân công giám thị',
          'Khóa sổ điểm theo hạn',
          'Thi lại / phúc khảo có trạng thái duyệt',
        ],
      },
    ],
  },
  {
    slug: 'con-nguoi',
    title: 'Con người là trung tâm',
    eyebrow: 'Học viên · Giảng viên · Phụ huynh',
    teaser:
      'Hồ sơ 360°, phân công lớp, sổ liên lạc — phục vụ con người trước, quy trình sau.',
    heroImage: '/landing/students.webp',
    heroAlt: 'Nhóm học sinh đang cùng học và trao đổi',
    icon: Users,
    accent: 'from-amber-400/30 to-orange-500/10',
    sections: [
      {
        title: 'Học viên',
        body: 'Một nơi để hiểu đủ hành trình học — tư vấn kịp thời.',
        bullets: [
          'Hồ sơ 360°: lớp, điểm danh, điểm, học phí, hành vi',
          'MaSV + thông tin liên hệ chỉnh sửa được',
          'Lịch sử ghi danh / chuyển lớp',
          'Cảnh báo học vụ & hành vi',
          'Theo dõi tiến độ LMS',
        ],
      },
      {
        title: 'Giảng viên & nhân sự',
        body: 'Giảm giấy tờ, tăng thời gian cho lớp học.',
        bullets: [
          'Danh bạ giảng viên + gán nhiều lớp',
          'Sửa hồ sơ liên hệ nhanh',
          'Lịch dạy & đơn đề xuất / xin nghỉ',
          'Hợp đồng + tính lương theo buổi đã điểm danh',
          'Dự báo ngân sách lương tháng tới',
          'Gán quyền kiêm nhiệm theo từng người',
        ],
      },
      {
        title: 'Phụ huynh',
        body: 'Kết nối gia đình — trên điện thoại, không phức tạp.',
        bullets: [
          'Xem lịch học của con',
          'Xem điểm & nhận xét',
          'Theo dõi học phí / công nợ',
          'Nhận thông báo vắng học & dặn dò',
          'Nhắc học phí tự động',
        ],
      },
    ],
  },
  {
    slug: 'hoc-tap-ai',
    title: 'Học tập số & AI đồng hành',
    eyebrow: 'LMS · Bài tập · Trợ lý thông minh',
    teaser:
      'Bài giảng, bài tập, kiểm tra online — AI hỗ trợ thầy cô và học viên trong phạm vi bài thật.',
    heroImage: '/landing/learning.webp',
    heroAlt: 'Học viên đang tập trung học trên máy tính',
    icon: Bot,
    accent: 'from-emerald-400/30 to-teal-600/10',
    sections: [
      {
        title: 'LMS đủ dùng mỗi ngày',
        body: 'Giáo viên đưa bài — học viên học và nộp — giáo vụ theo dõi.',
        bullets: [
          'Bài giảng file + YouTube',
          'Bài tập về nhà / theo bài giảng',
          'Quiz chấm tự động phía máy chủ',
          'Theo dõi đã xem / chưa xem / đã nộp',
          'Cổng học viên mobile-friendly',
        ],
      },
      {
        title: 'AI sát bài, không “bay” kiến thức',
        body: 'Trợ lý dựa trên kho tri thức của đúng cơ sở bạn.',
        bullets: [
          'AI gợi ý đề cương / câu hỏi cho giáo viên',
          'AI Tutor trả lời trong phạm vi bài giảng (RAG)',
          'Kho tri thức riêng từng đơn vị',
          'Timeout & fallback an toàn khi AI lỗi',
          'Không trộn dữ liệu giữa các cơ sở',
        ],
      },
      {
        title: 'Kiểm soát học tập',
        body: 'Biết sớm ai đang bỏ dở — can thiệp trước kỳ thi.',
        bullets: [
          'Bảng tiến độ theo lớp / bài',
          'Cảnh báo học viên ít tương tác',
          'Liên kết với điểm danh & điểm số',
        ],
      },
    ],
  },
  {
    slug: 'van-hanh',
    title: 'Vận hành nhà trường',
    eyebrow: 'Học phí · Tuyển sinh · Tài sản · Thông báo',
    teaser:
      'Phần “không lên bảng” quyết định trường chạy êm: tiền, tuyển sinh, tài sản, thông tin nội bộ.',
    heroImage: '/landing/family.webp',
    heroAlt: 'Phụ huynh và học sinh xem thông tin nhà trường',
    icon: Wallet,
    accent: 'from-rose-400/25 to-amber-500/10',
    sections: [
      {
        title: 'Học phí & công nợ',
        body: 'Thu rõ ràng — phụ huynh hiểu — kế toán kiểm soát được.',
        bullets: [
          'Tạo / hủy hóa đơn có kiểm soát',
          'Thu tiền + biên lai in / PDF',
          'Công nợ theo tuổi nợ 0–7 / 8–30 / >30 ngày',
          'Nhắc học phí tự động (cổng + sổ liên lạc)',
          'Báo cáo thu theo kỳ',
        ],
      },
      {
        title: 'Tuyển sinh CRM',
        body: 'Lead không rơi vào Excel rời — có người phụ trách và số liệu.',
        bullets: [
          'Quản lý lead & trạng thái',
          'Gán người tuyển sinh phụ trách',
          'Chiến dịch tuyển sinh',
          'Báo cáo chuyển đổi chi tiết',
          'Lọc / tìm theo người phụ trách',
        ],
      },
      {
        title: 'Hành chính & tài sản',
        body: 'Giảm email rời và file Excel rải rác.',
        bullets: [
          'Thông báo toàn cơ sở',
          'Tài sản, khấu hao, luân chuyển đơn vị / lớp',
          'Đơn từ / ticket nội bộ',
          'Báo cáo tổng quan biểu đồ sống động',
        ],
      },
    ],
  },
]

export function getChapter(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug)
}

export const HUB_PILLARS = [
  {
    slug: 'linh-hoat' as const,
    title: 'Linh hoạt từng cơ sở',
    desc: 'Cá nhân hóa, cấu hình, mở rộng & sát nhập',
    icon: Sparkles,
    image: '/landing/campus.webp',
  },
  {
    slug: 'dao-tao' as const,
    title: 'Đào tạo khép kín',
    desc: 'Lớp · Điểm danh · Khảo thí',
    icon: GraduationCap,
    image: '/landing/teacher.webp',
  },
  {
    slug: 'con-nguoi' as const,
    title: 'Con người là trung tâm',
    desc: 'Học viên · Giảng viên · Phụ huynh',
    icon: HeartHandshake,
    image: '/landing/students.webp',
  },
  {
    slug: 'hoc-tap-ai' as const,
    title: 'Học tập số & AI',
    desc: 'LMS · Bài tập · Trợ lý thông minh',
    icon: Bot,
    image: '/landing/learning.webp',
  },
  {
    slug: 'van-hanh' as const,
    title: 'Vận hành nhà trường',
    desc: 'Học phí · Tuyển sinh · Tài sản',
    icon: Building2,
    image: '/landing/family.webp',
  },
]
