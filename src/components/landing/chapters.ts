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
    bullets?: string[]
  }[]
}

export const CHAPTERS: Chapter[] = [
  {
    slug: 'linh-hoat',
    title: 'Linh hoạt theo từng cơ sở',
    eyebrow: 'Cá nhân hóa · Cấu hình · Chuyển đổi số',
    teaser:
      'Mỗi đơn vị vận hành theo cách riêng — vẫn thống nhất dữ liệu khi cần sát nhập, mở rộng hay giữ độc lập.',
    heroImage: '/landing/campus.png',
    heroAlt: 'Khuôn viên trường với học sinh đang di chuyển',
    icon: Settings2,
    accent: 'from-teal-400/30 to-sky-500/10',
    sections: [
      {
        title: 'Cấu hình theo thực tế địa bàn',
        body: 'Quy tắc mã học viên, biểu mẫu, thông báo, quy trình đơn từ… có thể chỉnh theo từng cơ sở. Không ép mọi nơi dùng một khuôn cứng.',
        bullets: [
          'Định nghĩa mã học viên theo 3 kiểu quy tắc sẵn có',
          'Trường thông tin riêng (custom fields) theo nhu cầu đơn vị',
          'Bật / tắt nhóm tính năng theo gói dịch vụ đã chọn',
        ],
      },
      {
        title: 'Độc lập nhưng không cô lập',
        body: 'Chi nhánh, trung tâm có thể tự vận hành hàng ngày; báo cáo tổng hợp vẫn nhìn được bức tranh chung khi bạn cần điều phối.',
        bullets: [
          'Dữ liệu gắn đúng đơn vị — không lẫn giữa các cơ sở',
          'Phân quyền theo vai trò + kiêm nhiệm theo từng người',
          'Cổng đăng nhập riêng theo cơ sở, dễ nhớ cho phụ huynh & nhân sự',
        ],
      },
      {
        title: 'Sẵn sàng mở rộng & sát nhập',
        body: 'Khi mở cơ sở mới, sát nhập đơn vị hoặc tái cấu trúc, hệ thống giữ lịch sử học tập, học phí, nhân sự — không đứt đoạn vận hành.',
        bullets: [
          'Thêm nhánh / trung tâm dưới đơn vị gốc',
          'Chuyển học viên, giảng viên giữa các cơ sở',
          'Giữ dấu vết điểm danh, điểm số, công nợ khi tổ chức đổi',
        ],
      },
    ],
  },
  {
    slug: 'dao-tao',
    title: 'Đào tạo khép kín',
    eyebrow: 'Lớp học · Điểm danh · Khảo thí',
    teaser:
      'Từ xếp lớp đến sổ điểm, từ điểm danh đến liên lạc phụ huynh — một chuỗi liền mạch cho giáo vụ và nhà trường.',
    heroImage: '/landing/teacher.png',
    heroAlt: 'Giáo viên đang giảng bài trước lớp',
    icon: GraduationCap,
    accent: 'from-sky-400/30 to-blue-600/10',
    sections: [
      {
        title: 'Lớp học & sĩ số thông minh',
        body: 'Tạo lớp, gán giảng viên, kiểm soát sĩ số tối đa, ghi danh / chuyển lớp / bảo lưu / thôi học — rõ ràng từng bước.',
      },
      {
        title: 'Điểm danh sống động',
        body: 'Sổ đầu bài điện tử: có mặt, vắng, muộn; nhận xét học sinh, nhận xét lớp, dặn dò phụ huynh. Hành vi tốt/xấu được ghi nhận để cảnh báo sớm.',
      },
      {
        title: 'Khảo thí chuyên nghiệp',
        body: 'Lịch thi, mã đề, giám thị, khóa sổ điểm, đăng ký thi lại / phúc khảo. Giáo vụ duyệt kết quả trước khi công bố.',
        bullets: [
          'Theo dõi tiến độ chấm điểm',
          'Liên kết vắng có phép với quyền thi lại',
          'Báo cáo điểm theo lớp / học kỳ',
        ],
      },
    ],
  },
  {
    slug: 'con-nguoi',
    title: 'Con người là trung tâm',
    eyebrow: 'Học viên · Giảng viên · Phụ huynh',
    teaser:
      'Hồ sơ 360°, phân công lớp, sổ liên lạc — hệ thống phục vụ con người trước, quy trình sau.',
    heroImage: '/landing/students.png',
    heroAlt: 'Nhóm học sinh đang cùng học và trao đổi',
    icon: Users,
    accent: 'from-amber-400/30 to-orange-500/10',
    sections: [
      {
        title: 'Học viên được nhìn toàn diện',
        body: 'Mã học viên, lớp đang học, điểm danh, điểm số, học phí, hành vi — một trang 360° để tư vấn kịp thời, không lục nhiều phần mềm.',
      },
      {
        title: 'Giảng viên được hỗ trợ thật',
        body: 'Hồ sơ giảng viên, gán lớp, lịch dạy hai chiều (đề xuất / xin nghỉ), tính thù lao theo buổi đã dạy. Ít giấy tờ, nhiều thời gian cho lớp học.',
      },
      {
        title: 'Phụ huynh luôn được kết nối',
        body: 'Sổ liên lạc điện tử: lịch học, điểm, học phí, thông báo vắng học và dặn dò từ giáo viên — trên điện thoại, không cần tài khoản phức tạp.',
        bullets: [
          'Nhắc học phí dịu dàng, đúng lúc',
          'Xem tiến độ học tập của con',
          'Nhận thông báo quan trọng theo cơ sở',
        ],
      },
    ],
  },
  {
    slug: 'hoc-tap-ai',
    title: 'Học tập số & AI đồng hành',
    eyebrow: 'LMS · Bài tập · Trợ lý thông minh',
    teaser:
      'Bài giảng, bài tập, kiểm tra online — kèm AI hỗ trợ thầy cô soạn bài và giải đáp học viên trong phạm vi kiến thức của lớp.',
    heroImage: '/landing/learning.png',
    heroAlt: 'Học viên đang tập trung học trên máy tính',
    icon: Bot,
    accent: 'from-emerald-400/30 to-teal-600/10',
    sections: [
      {
        title: 'LMS đủ dùng mỗi ngày',
        body: 'Đưa bài giảng (file / YouTube), giao bài tập, quiz chấm tự động, theo dõi ai đã học / chưa nộp — giáo vụ nắm tiến độ chỉ trong vài cú nhấp.',
      },
      {
        title: 'AI sát bài giảng, không “bay” kiến thức',
        body: 'Trợ lý dựa trên tài liệu đã đưa vào kho tri thức của cơ sở. Học viên hỏi đúng bài; thầy cô tiết kiệm giờ soạn đề và tóm tắt.',
        bullets: [
          'Gợi ý đề cương / câu hỏi kiểm tra',
          'Chat hỗ trợ học trong phạm vi bài',
          'Mỗi cơ sở có kho kiến thức riêng',
        ],
      },
      {
        title: 'Kiểm soát học tập minh bạch',
        body: 'Biết ai đang học, ai bỏ dở, bài nào khó — để can thiệp sớm thay vì chờ đến kỳ thi.',
      },
    ],
  },
  {
    slug: 'van-hanh',
    title: 'Vận hành nhà trường',
    eyebrow: 'Học phí · Tuyển sinh · Tài sản · Thông báo',
    teaser:
      'Phần “không lên bảng” nhưng quyết định trường chạy êm: tiền bạc, tuyển sinh, tài sản và thông tin nội bộ.',
    heroImage: '/landing/family.png',
    heroAlt: 'Phụ huynh và học sinh xem thông tin nhà trường',
    icon: Wallet,
    accent: 'from-rose-400/25 to-amber-500/10',
    sections: [
      {
        title: 'Học phí rõ ràng',
        body: 'Hóa đơn, thu tiền, biên lai in được, công nợ theo tuổi nợ (0–7 / 8–30 / >30 ngày), nhắc tự động qua cổng và sổ liên lạc.',
      },
      {
        title: 'Tuyển sinh có số liệu',
        body: 'CRM lead theo người phụ trách, chiến dịch, báo cáo chuyển đổi — đội ngũ tuyển sinh làm việc trên một bảng thống nhất.',
      },
      {
        title: 'Hành chính gọn nhẹ',
        body: 'Thông báo toàn cơ sở, quản lý tài sản & khấu hao, đơn từ dịch vụ — giảm email rời rạc và file Excel rải rác.',
        bullets: [
          'Phân quyền nhân sự theo công việc thực tế',
          'Báo cáo tổng quan bằng biểu đồ dễ đọc',
          'Sẵn sàng cho mô hình nhiều cơ sở / nhiều thương hiệu',
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
    image: '/landing/campus.png',
  },
  {
    slug: 'dao-tao' as const,
    title: 'Đào tạo khép kín',
    desc: 'Lớp · Điểm danh · Khảo thí',
    icon: GraduationCap,
    image: '/landing/teacher.png',
  },
  {
    slug: 'con-nguoi' as const,
    title: 'Con người là trung tâm',
    desc: 'Học viên · Giảng viên · Phụ huynh',
    icon: HeartHandshake,
    image: '/landing/students.png',
  },
  {
    slug: 'hoc-tap-ai' as const,
    title: 'Học tập số & AI',
    desc: 'LMS · Bài tập · Trợ lý thông minh',
    icon: Bot,
    image: '/landing/learning.png',
  },
  {
    slug: 'van-hanh' as const,
    title: 'Vận hành nhà trường',
    desc: 'Học phí · Tuyển sinh · Tài sản',
    icon: Building2,
    image: '/landing/family.png',
  },
]
