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

/** Nhóm tính năng — highlights = điểm nhấn nổi bật trên hub */
export const FEATURE_GROUPS: {
  title: string
  chapter: ChapterSlug
  highlights: string[]
  items: string[]
}[] = [
  {
    title: 'Nhiều cơ sở & tùy chỉnh',
    chapter: 'linh-hoat',
    highlights: [
      'Mỗi cơ sở có cổng đăng nhập riêng',
      'Mở thêm cơ sở hoặc sát nhập mà không mất dữ liệu cũ',
      'Chỉ bật những phần bạn đã mua',
    ],
    items: [
      'Cổng đăng nhập riêng theo từng cơ sở',
      'Dữ liệu mỗi cơ sở tách biệt — không bị lẫn',
      'Tự chọn cách đặt mã học viên',
      'Thêm trường thông tin riêng theo nhu cầu đơn vị',
      'Bảng điều khiển kéo-thả, lưu cách xem riêng từng người',
      'Chuyển học viên / giảng viên giữa các cơ sở',
    ],
  },
  {
    title: 'Lớp học · Điểm danh · Thi cử',
    chapter: 'dao-tao',
    highlights: [
      'Điểm danh, sổ đầu bài và nhận xét trong một buổi',
      'Giáo viên xin lịch / xin nghỉ — giáo vụ duyệt',
      'Khóa sổ điểm rồi mới công bố',
    ],
    items: [
      'Tạo lớp, đặt sĩ số tối đa, gán giảng viên',
      'Ghi danh, chuyển lớp, bảo lưu, thôi học',
      'Dạy thay, dạy bù khi có buổi hủy',
      'Lịch thi, mã đề, phân công giám thị',
      'Đăng ký thi lại / phúc khảo và duyệt kết quả',
      'Nhập học viên từ Excel (cột mã học viên)',
    ],
  },
  {
    title: 'Học viên · Giảng viên · Phụ huynh',
    chapter: 'con-nguoi',
    highlights: [
      'Một trang hồ sơ học viên: lớp, điểm, học phí, hành vi',
      'Phụ huynh xem lịch, điểm, học phí trên điện thoại',
      'Gán thêm quyền cho từng người khi cần',
    ],
    items: [
      'Sửa họ tên, số điện thoại, địa chỉ, mã học viên',
      'Danh bạ giảng viên — gán hoặc gỡ nhiều lớp',
      'Hợp đồng và tính lương theo buổi đã dạy',
      'Dự báo chi phí lương tháng tới',
      'Nhắc học phí tự động trên cổng và sổ liên lạc',
      'Gửi thông báo toàn cơ sở',
    ],
  },
  {
    title: 'Học online · AI',
    chapter: 'hoc-tap-ai',
    highlights: [
      'Trợ lý AI chỉ trả lời theo bài của đúng cơ sở bạn',
      'Kiểm tra online — máy chấm điểm tự động',
      'Biết ai đã học, ai nộp bài, ai còn thiếu',
    ],
    items: [
      'Đăng bài giảng: file hoặc link YouTube',
      'Bài tập về nhà và bài tập theo bài giảng',
      'AI giúp giáo viên soạn đề cương / câu hỏi',
      'Kho tri thức riêng cho từng cơ sở',
      'Học viên xem bài, nộp bài, hỏi AI trên cổng của mình',
    ],
  },
  {
    title: 'Học phí · Tuyển sinh · Hành chính',
    chapter: 'van-hanh',
    highlights: [
      'Từ hóa đơn đến thu tiền và in biên lai — liền một chuỗi',
      'Theo dõi học viên tiềm năng theo người phụ trách',
      'Biết ai nợ bao lâu để nhắc đúng lúc',
    ],
    items: [
      'Hủy hoặc chỉnh hóa đơn có kiểm soát',
      'Báo cáo bao nhiêu người đăng ký thành học viên',
      'Quản lý tài sản, khấu hao, chuyển giữa đơn vị / lớp',
      'Đơn từ nội bộ trong hệ thống',
      'Báo cáo tổng quan bằng biểu đồ',
    ],
  },
]

export const CHAPTERS: Chapter[] = [
  {
    slug: 'linh-hoat',
    title: 'Linh hoạt theo từng cơ sở',
    eyebrow: 'Tùy chỉnh · Mở rộng · Sát nhập',
    teaser:
      'Mỗi cơ sở làm theo cách riêng. Khi cần mở rộng hay sát nhập, dữ liệu học tập và học phí vẫn giữ được.',
    heroImage: '/landing/campus.webp',
    heroAlt: 'Khuôn viên trường với học sinh đang di chuyển',
    icon: Settings2,
    accent: 'from-teal-400/30 to-sky-500/10',
    sections: [
      {
        title: 'Chỉnh theo cách trường bạn làm việc',
        body: 'Không ép mọi nơi dùng một khuôn cứng. Bạn chỉnh những gì cần khác nhau mỗi ngày.',
        bullets: [
          'Tự chọn cách đặt mã học viên',
          'Thêm trường thông tin riêng cho hồ sơ',
          'Chỉ bật những phần đã mua',
          'Bảng điều khiển kéo-thả, lưu cách xem riêng',
          'Thông báo và biểu mẫu theo từng đơn vị',
        ],
      },
      {
        title: 'Mỗi cơ sở tự chạy — vẫn nhìn được tổng thể',
        body: 'Chi nhánh làm việc hàng ngày độc lập. Cấp trên vẫn xem được bức tranh chung khi cần.',
        bullets: [
          'Cấu trúc: trường → cơ sở → trung tâm / chi nhánh',
          'Dữ liệu mỗi cơ sở tách biệt, không lẫn',
          'Cổng đăng nhập riêng từng cơ sở',
          'Phân quyền theo vai trò; gán thêm việc khi cần',
          'Báo cáo theo đúng phạm vi bạn quản lý',
        ],
      },
      {
        title: 'Mở rộng hoặc sát nhập không mất lịch sử',
        body: 'Đổi mô hình tổ chức mà vẫn giữ điểm danh, điểm số và công nợ.',
        bullets: [
          'Thêm cơ sở / trung tâm dưới đơn vị gốc',
          'Chuyển học viên giữa các cơ sở',
          'Chuyển giảng viên giữa các đơn vị',
          'Giữ điểm danh, điểm số, công nợ khi tổ chức đổi',
          'Làm từng bước — không cần đổi hết một lúc',
        ],
      },
    ],
  },
  {
    slug: 'dao-tao',
    title: 'Đào tạo trọn chuỗi',
    eyebrow: 'Lớp học · Điểm danh · Thi cử',
    teaser:
      'Từ xếp lớp đến sổ điểm, từ điểm danh đến liên lạc phụ huynh — nối thành một chuỗi, không rời rạc.',
    heroImage: '/landing/teacher.webp',
    heroAlt: 'Giáo viên đang giảng bài trước lớp',
    icon: GraduationCap,
    accent: 'from-sky-400/30 to-blue-600/10',
    sections: [
      {
        title: 'Lớp học và ghi danh',
        body: 'Giáo vụ nắm sĩ số, phân công giảng viên và theo dõi học viên trong lớp.',
        bullets: [
          'Tạo / sửa lớp, đặt sĩ số tối đa',
          'Gán giảng viên phụ trách',
          'Ghi danh nhanh từ danh sách học viên',
          'Chuyển lớp, bảo lưu, thôi học, hoàn thành',
          'Nhập từ Excel với cột mã học viên',
        ],
      },
      {
        title: 'Điểm danh và sổ đầu bài',
        body: 'Mỗi buổi học ghi đủ — không chỉ tick có mặt.',
        bullets: [
          'Có mặt / vắng / muộn / có phép',
          'Nhận xét học sinh và nhận xét lớp',
          'Dặn dò phụ huynh ngay trong buổi',
          'Ghi hành vi (+/− điểm rèn luyện)',
          'Cảnh báo sớm khi vắng hoặc hành vi vượt ngưỡng',
        ],
      },
      {
        title: 'Lịch dạy và thi cử',
        body: 'Giáo viên và giáo vụ trao đổi trên hệ thống; quy trình thi rõ ràng.',
        bullets: [
          'Giáo viên đề xuất lịch hoặc xin nghỉ',
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
      'Hồ sơ học viên đầy đủ, phân công lớp, sổ liên lạc — phục vụ người trước, quy trình sau.',
    heroImage: '/landing/students.webp',
    heroAlt: 'Nhóm học sinh đang cùng học và trao đổi',
    icon: Users,
    accent: 'from-amber-400/30 to-orange-500/10',
    sections: [
      {
        title: 'Học viên',
        body: 'Một nơi để nắm hành trình học — kịp thời hỗ trợ khi cần.',
        bullets: [
          'Hồ sơ đủ: lớp, điểm danh, điểm, học phí, hành vi',
          'Mã học viên và thông tin liên hệ chỉnh được',
          'Lịch sử ghi danh / chuyển lớp',
          'Cảnh báo học vụ và hành vi',
          'Theo dõi tiến độ học online',
        ],
      },
      {
        title: 'Giảng viên và nhân sự',
        body: 'Ít giấy tờ hơn — nhiều thời gian hơn cho lớp học.',
        bullets: [
          'Danh bạ giảng viên, gán nhiều lớp',
          'Sửa thông tin liên hệ nhanh',
          'Lịch dạy và đơn xin nghỉ',
          'Hợp đồng và tính lương theo buổi đã điểm danh',
          'Dự báo chi phí lương tháng tới',
          'Gán thêm quyền theo từng người khi cần',
        ],
      },
      {
        title: 'Phụ huynh',
        body: 'Kết nối gia đình trên điện thoại — đơn giản, đủ thông tin.',
        bullets: [
          'Xem lịch học của con',
          'Xem điểm và nhận xét',
          'Theo dõi học phí / còn nợ',
          'Nhận thông báo vắng học và dặn dò',
          'Nhắc học phí tự động',
        ],
      },
    ],
  },
  {
    slug: 'hoc-tap-ai',
    title: 'Học online và AI đồng hành',
    eyebrow: 'Bài giảng · Bài tập · Trợ lý thông minh',
    teaser:
      'Bài giảng, bài tập, kiểm tra online — AI hỗ trợ thầy cô và học viên theo đúng bài của cơ sở.',
    heroImage: '/landing/learning.webp',
    heroAlt: 'Học viên đang tập trung học trên máy tính',
    icon: Bot,
    accent: 'from-emerald-400/30 to-teal-600/10',
    sections: [
      {
        title: 'Học online đủ dùng mỗi ngày',
        body: 'Giáo viên đưa bài — học viên học và nộp — nhà trường theo dõi.',
        bullets: [
          'Bài giảng file hoặc YouTube',
          'Bài tập về nhà / theo bài giảng',
          'Kiểm tra online — máy chấm tự động',
          'Theo dõi đã xem / chưa xem / đã nộp',
          'Cổng học viên dùng tốt trên điện thoại',
        ],
      },
      {
        title: 'AI theo đúng bài của cơ sở bạn',
        body: 'Trợ lý dựa trên kho tri thức của đúng đơn vị — không trả lời lung tung.',
        bullets: [
          'AI gợi ý đề cương / câu hỏi cho giáo viên',
          'Trợ lý AI trả lời trong phạm vi bài giảng',
          'Kho tri thức riêng từng cơ sở',
          'Khi AI lỗi vẫn có cách xử lý an toàn',
          'Không trộn dữ liệu giữa các cơ sở',
        ],
      },
      {
        title: 'Theo dõi tiến độ học',
        body: 'Biết sớm ai đang bỏ dở — hỗ trợ trước kỳ thi.',
        bullets: [
          'Bảng tiến độ theo lớp / bài',
          'Cảnh báo học viên ít tương tác',
          'Liên kết với điểm danh và điểm số',
        ],
      },
    ],
  },
  {
    slug: 'van-hanh',
    title: 'Vận hành nhà trường',
    eyebrow: 'Học phí · Tuyển sinh · Tài sản · Thông báo',
    teaser:
      'Những việc “không lên bảng” giúp trường chạy êm: tiền, tuyển sinh, tài sản, thông tin nội bộ.',
    heroImage: '/landing/family.webp',
    heroAlt: 'Phụ huynh và học sinh xem thông tin nhà trường',
    icon: Wallet,
    accent: 'from-rose-400/25 to-amber-500/10',
    sections: [
      {
        title: 'Học phí và công nợ',
        body: 'Thu rõ ràng — phụ huynh hiểu — kế toán kiểm soát được.',
        bullets: [
          'Tạo / hủy hóa đơn có kiểm soát',
          'Thu tiền và in biên lai / PDF',
          'Xem công nợ theo thời gian nợ: dưới 7 ngày, 8–30 ngày, trên 30 ngày',
          'Nhắc học phí tự động (cổng và sổ liên lạc)',
          'Báo cáo thu theo kỳ',
        ],
      },
      {
        title: 'Tuyển sinh',
        body: 'Học viên tiềm năng không còn nằm rải trên Excel — có người phụ trách và số liệu.',
        bullets: [
          'Quản lý danh sách và trạng thái',
          'Gán người phụ trách từng hồ sơ',
          'Chiến dịch tuyển sinh',
          'Báo cáo bao nhiêu người thành học viên',
          'Tìm / lọc theo người phụ trách',
        ],
      },
      {
        title: 'Hành chính và tài sản',
        body: 'Giảm email rời và file Excel rải rác.',
        bullets: [
          'Thông báo toàn cơ sở',
          'Tài sản, khấu hao, chuyển giữa đơn vị / lớp',
          'Đơn từ nội bộ trong hệ thống',
          'Báo cáo tổng quan bằng biểu đồ',
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
    desc: 'Tùy chỉnh, mở rộng và sát nhập',
    icon: Sparkles,
    tone: 'from-teal-500/40 via-sky-600/20 to-transparent',
    numeral: '01',
  },
  {
    slug: 'dao-tao' as const,
    title: 'Đào tạo trọn chuỗi',
    desc: 'Lớp · Điểm danh · Thi cử',
    icon: GraduationCap,
    tone: 'from-sky-500/40 via-indigo-600/20 to-transparent',
    numeral: '02',
  },
  {
    slug: 'con-nguoi' as const,
    title: 'Con người là trung tâm',
    desc: 'Học viên · Giảng viên · Phụ huynh',
    icon: HeartHandshake,
    tone: 'from-amber-500/35 via-orange-600/15 to-transparent',
    numeral: '03',
  },
  {
    slug: 'hoc-tap-ai' as const,
    title: 'Học online và AI',
    desc: 'Bài giảng · Bài tập · Trợ lý thông minh',
    icon: Bot,
    tone: 'from-emerald-500/40 via-teal-700/20 to-transparent',
    numeral: '04',
  },
  {
    slug: 'van-hanh' as const,
    title: 'Vận hành nhà trường',
    desc: 'Học phí · Tuyển sinh · Tài sản',
    icon: Building2,
    tone: 'from-rose-500/30 via-amber-600/15 to-transparent',
    numeral: '05',
  },
]

/** Hành trình giáo dục — storytelling trên hub */
export const EDU_JOURNEY = [
  {
    step: '01',
    title: 'Tuyển sinh',
    line: 'Học viên tiềm năng vào hệ thống — có người phụ trách, có chiến dịch, biết được bao nhiêu người đăng ký thành công.',
  },
  {
    step: '02',
    title: 'Xếp lớp',
    line: 'Ghi danh, sĩ số, gán giảng viên — học viên vào đúng lớp từ ngày đầu.',
  },
  {
    step: '03',
    title: 'Giảng dạy',
    line: 'Lịch dạy, điểm danh, sổ đầu bài, bài học online — mỗi buổi được ghi nhận đủ.',
  },
  {
    step: '04',
    title: 'Đánh giá',
    line: 'Điểm số, thi cử, thi lại — khóa sổ rồi mới công bố.',
  },
  {
    step: '05',
    title: 'Kết nối gia đình',
    line: 'Sổ liên lạc: lịch, điểm, học phí, dặn dò — phụ huynh xem trên điện thoại.',
  },
  {
    step: '06',
    title: 'Vận hành',
    line: 'Học phí, tài sản, phân quyền — nhà trường chạy êm phía sau lớp học.',
  },
]
