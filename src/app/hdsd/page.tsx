import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Bot,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Lock,
  Megaphone,
  MonitorPlay,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'

// ============================================================
// /hdsd — TRANG GIỚI THIỆU & HƯỚNG DẪN SỬ DỤNG (công khai).
// Ngôn ngữ đơn giản, hấp dẫn, phục vụ quảng bá: tóm tắt hệ thống,
// bảng tính năng chi tiết theo phân hệ, các cổng đăng nhập.
// ============================================================

export const metadata: Metadata = {
  title: 'Giới thiệu & Hướng dẫn sử dụng — EDU SYSTEM',
  description:
    'EDU SYSTEM - Hệ thống quản lý giáo dục đa cơ sở tích hợp AI: tuyển sinh, học vụ, điểm danh, học phí, lương, LMS online, sổ liên lạc điện tử.',
}

/** Nhóm người dùng hệ thống phục vụ */
const AUDIENCES = [
  {
    icon: Building2,
    title: 'Ban Giám đốc & Quản lý cơ sở',
    desc: 'Nhìn toàn cảnh mọi chi nhánh trên một màn hình: doanh thu, sĩ số, lớp học, cảnh báo. Ra quyết định bằng số liệu thật.',
  },
  {
    icon: Users,
    title: 'Giáo vụ & Văn phòng',
    desc: 'Xếp lịch, quản lý lớp, duyệt đơn từ, tổ chức thi, thu học phí — mọi nghiệp vụ gói gọn trong vài cú bấm.',
  },
  {
    icon: GraduationCap,
    title: 'Giáo viên',
    desc: 'Cổng riêng: xem lịch dạy, điểm danh 1 chạm, chấm điểm, gửi đơn xin nghỉ, soạn bài giảng có AI hỗ trợ.',
  },
  {
    icon: MonitorPlay,
    title: 'Học sinh',
    desc: 'Học online, nộp bài tập, làm bài kiểm tra, xem điểm, hỏi Trợ lý AI về chính bài giảng của thầy cô.',
  },
  {
    icon: HeartHandshake,
    title: 'Phụ huynh',
    desc: 'Sổ liên lạc điện tử trên điện thoại: biết con đi học hay vắng, điểm số, nhận xét của giáo viên, học phí — theo thời gian thực.',
  },
  {
    icon: ShieldCheck,
    title: 'Doanh nghiệp liên kết',
    desc: 'Cổng B2B riêng để theo dõi và chấm điểm thực tập sinh, đồng bộ tự động về bảng điểm nghề của trung tâm.',
  },
]

/** Bảng tính năng chi tiết theo phân hệ */
const FEATURE_GROUPS: {
  icon: typeof Users
  name: string
  tagline: string
  features: string[]
}[] = [
  {
    icon: Building2,
    name: 'Quản lý Đa cơ sở',
    tagline: 'Một hệ thống — bao nhiêu chi nhánh cũng vừa',
    features: [
      'Cây tổ chức nhiều tầng: Tổng công ty → Cụm → Cơ sở → Lớp',
      'Dữ liệu mỗi cơ sở tách biệt tuyệt đối, cấp trên nhìn được cấp dưới',
      'Mỗi cơ sở tự cài đặt quy tắc riêng: mã học viên, hạn nhập điểm, ngưỡng cảnh báo…',
      'Xếp hạng chi nhánh, so sánh doanh thu - sĩ số trực quan bằng biểu đồ',
    ],
  },
  {
    icon: Megaphone,
    name: 'Tuyển sinh (CRM)',
    tagline: 'Không bỏ sót một học viên tiềm năng nào',
    features: [
      'Quản lý nguồn tuyển sinh (leads) theo phễu: mới → tư vấn → nhập học',
      'Tìm kiếm theo người phụ trách, báo cáo chi tiết theo nhân viên tuyển sinh',
      'Ghi chú lịch sử tư vấn từng học viên, nhắc lịch hẹn gọi lại',
      'Import danh sách từ Excel với kiểm tra dữ liệu chặt chẽ (mã MaSV bắt buộc)',
    ],
  },
  {
    icon: CalendarCheck,
    name: 'Học vụ & Lịch dạy',
    tagline: 'Xếp lịch thông minh, không bao giờ trùng',
    features: [
      'Tạo lớp, gán giáo viên, đặt sĩ số tối đa, sinh lịch học tự động',
      'Hệ thống tự chặn trùng lịch: giáo viên, phòng học, thiết bị',
      'Giáo viên đề xuất lịch / xin nghỉ qua cổng riêng — giáo vụ duyệt online',
      'Dạy thay, dạy bù gắn với buổi gốc; tự thông báo cho giáo viên và học sinh',
      'Vòng đời ghi danh đầy đủ: chuyển lớp, bảo lưu, thôi học có ghi chú',
    ],
  },
  {
    icon: ClipboardCheck,
    name: 'Điểm danh & Sổ đầu bài điện tử',
    tagline: 'Phụ huynh biết tình hình con ngay trong ngày',
    features: [
      'Giáo viên điểm danh 1 chạm trên điện thoại/tablet',
      'Sổ đầu bài: nội dung thực dạy, nhận xét lớp, nhận xét từng học sinh, dặn dò phụ huynh',
      'Ghi nhận hành vi (cộng/trừ điểm rèn luyện) — tự cảnh báo tư vấn tâm lý khi cần',
      'Vắng quá số buổi quy định → hệ thống tự tạo cảnh báo học vụ',
    ],
  },
  {
    icon: Sparkles,
    name: 'Khảo thí & Điểm số',
    tagline: 'Minh bạch từ ra đề đến trả điểm',
    features: [
      'Ngân hàng đề thi, quản lý mã đề, xếp lịch thi và phân công giám thị',
      'Khóa sổ điểm theo hạn — quá hạn không ai sửa được điểm',
      'Học sinh đăng ký thi lại / phúc khảo ngay trên cổng, khảo thí duyệt online',
      'Bảng điểm, học bạ, kết quả tổng hợp xuất theo lớp',
    ],
  },
  {
    icon: Receipt,
    name: 'Tài chính - Học phí',
    tagline: 'Thu đúng, thu đủ, nhắc nợ tự động',
    features: [
      'Hóa đơn học phí, thu tiền, in biên lai ngay sau khi thu',
      'Nhắc học phí tự động tới cổng học sinh & sổ liên lạc phụ huynh',
      'Báo cáo công nợ theo tuổi nợ: 0-7 / 8-30 / trên 30 ngày',
      'Dự báo quỹ lương tháng tới dựa trên thời khóa biểu tương lai',
    ],
  },
  {
    icon: Wallet,
    name: 'Nhân sự - Lương & Tài sản',
    tagline: 'Trả lương chính xác đến từng tiết dạy',
    features: [
      'Hợp đồng giáo viên, đơn giá tiết dạy, hệ số phụ cấp linh hoạt',
      'Chỉ tính lương buổi đã dạy thật (có điểm danh xác nhận)',
      'Sổ tài sản: theo dõi khấu hao, bảo hành, điều chuyển giữa các cơ sở',
      'Đánh giá giáo viên ẩn danh qua khảo sát gửi phụ huynh/học sinh',
    ],
  },
  {
    icon: Bot,
    name: 'LMS Online + Trợ lý AI',
    tagline: 'Lớp học không dừng lại khi tan trường',
    features: [
      'Bài giảng online: văn bản, video YouTube, tài liệu đính kèm',
      'Bài tập về nhà, bài kiểm tra trắc nghiệm chấm tự động',
      'AI soạn nháp bài giảng & câu hỏi kiểm tra cho giáo viên',
      'Trợ lý AI trả lời học sinh dựa trên ĐÚNG bài giảng của thầy cô (RAG)',
      'Theo dõi ai đã học / chưa học từng bài — kiểm soát tiến độ chặt chẽ',
    ],
  },
  {
    icon: LayoutDashboard,
    name: 'Cổng thông tin & Cá nhân hóa',
    tagline: 'Mỗi người một không gian làm việc riêng',
    features: [
      '6 cổng riêng biệt: Quản trị, Giáo vụ, Giáo viên, Học sinh, Phụ huynh, Doanh nghiệp',
      'Dashboard kéo-thả: tự sắp xếp, ẩn/hiện widget theo ý mình',
      'Quản trị viên áp bố cục chuẩn cho cả đội ngũ chỉ với 1 nút',
      'Cổng dịch vụ E-Ticketing: xin nghỉ, hoàn phí, phúc khảo — gửi đơn online, theo dõi trạng thái duyệt',
    ],
  },
  {
    icon: Lock,
    name: 'Bảo mật & Phân quyền',
    tagline: 'Ai thấy việc nấy — dữ liệu an toàn tuyệt đối',
    features: [
      '8 vai trò với ma trận phân quyền chi tiết đến từng thao tác',
      'Bảo mật tận tầng database (RLS): sai quyền là không đọc được dữ liệu',
      'Cổng đăng nhập tách riêng từng đối tượng, sẵn sàng chạy tên miền riêng',
      'Che thông tin lương/tài chính với người không có quyền xem',
    ],
  },
]

/** Các cổng đăng nhập */
const PORTALS = [
  { href: '/login', label: 'Cổng Quản lý & Giáo viên', desc: 'Ban giám đốc, giáo vụ, kế toán, giáo viên' },
  { href: '/student/login', label: 'Cổng Học sinh', desc: 'Học online, xem điểm, nộp bài, hỏi AI' },
  { href: '/parent/login', label: 'Sổ Liên Lạc Phụ huynh', desc: 'Theo dõi con em mọi lúc trên điện thoại' },
]

export default function HdsdPage() {
  return (
    <div className="min-h-dvh bg-background">
      {/* ===== Hero ===== */}
      <header className="bento-card-dark rounded-none px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c9a227]/40 bg-gradient-to-br from-[#292524] to-[#0c0a09] text-[#e5c369]">
            <GraduationCap className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">
            EDU <span className="text-gold-gradient">SYSTEM</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-stone-300 sm:text-lg">
            Hệ thống quản lý giáo dục <strong className="text-[#e5c369]">đa cơ sở</strong> tích hợp{' '}
            <strong className="text-[#e5c369]">AI</strong> — gói trọn tuyển sinh, học vụ, điểm danh,
            học phí, lương, học online và sổ liên lạc điện tử trong MỘT nền tảng duy nhất.
          </p>
          <p className="mt-3 text-sm text-stone-400">
            Bớt giấy tờ, bớt Excel, bớt gọi điện — mọi người cùng nhìn một nguồn dữ liệu thật, cập nhật theo thời gian thực.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:py-14">
        {/* ===== 1. Hệ thống phục vụ ai? ===== */}
        <section aria-labelledby="hdsd-audience">
          <h2 id="hdsd-audience" className="font-heading text-2xl font-bold tracking-tight">
            1. Hệ thống phục vụ ai?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mỗi đối tượng có một cổng riêng, giao diện riêng, đúng việc của mình.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="bento-card p-5">
                  <span className="bento-icon bg-[#c9a227]/10 text-[#a16207]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-heading text-base font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== 2. Bảng tính năng chi tiết ===== */}
        <section aria-labelledby="hdsd-features">
          <h2 id="hdsd-features" className="font-heading text-2xl font-bold tracking-tight">
            2. Tính năng chi tiết theo phân hệ
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            10 phân hệ nghiệp vụ — mỗi phân hệ giải quyết trọn vẹn một bài toán vận hành.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {FEATURE_GROUPS.map((group) => {
              const Icon = group.icon
              return (
                <div key={group.name} className="bento-card p-5">
                  <div className="flex items-start gap-3">
                    <span className="bento-icon bg-[#c9a227]/10 text-[#a16207]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-bold">{group.name}</h3>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#a16207]">
                        {group.tagline}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {group.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-foreground/90">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== 3. Vì sao chọn EDU SYSTEM? ===== */}
        <section aria-labelledby="hdsd-why">
          <h2 id="hdsd-why" className="font-heading text-2xl font-bold tracking-tight">
            3. Vì sao chọn EDU SYSTEM?
          </h2>
          <div className="mt-5 overflow-x-auto rounded-3xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-stone-50 text-left">
                  <th className="px-5 py-3 font-heading font-bold">Trước đây</th>
                  <th className="px-5 py-3 font-heading font-bold text-[#a16207]">Với EDU SYSTEM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-5 py-3 text-muted-foreground">Sổ sách, Excel rời rạc mỗi cơ sở một kiểu</td>
                  <td className="px-5 py-3 font-medium">Một nguồn dữ liệu duy nhất, chuẩn hóa toàn chuỗi</td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-muted-foreground">Phụ huynh gọi điện hỏi tình hình con</td>
                  <td className="px-5 py-3 font-medium">Sổ liên lạc điện tử cập nhật ngay sau mỗi buổi học</td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-muted-foreground">Tính lương thủ công, dễ sai sót</td>
                  <td className="px-5 py-3 font-medium">Lương tự động theo buổi dạy thật, có điểm danh đối chứng</td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-muted-foreground">Học sinh yếu bị phát hiện khi đã muộn</td>
                  <td className="px-5 py-3 font-medium">Cảnh báo sớm tự động: vắng học, điểm hành vi, nguy cơ bỏ học</td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-muted-foreground">Soạn bài, ra đề tốn hàng giờ</td>
                  <td className="px-5 py-3 font-medium">AI hỗ trợ soạn nháp bài giảng & câu hỏi trong vài giây</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== 4. Bắt đầu sử dụng ===== */}
        <section aria-labelledby="hdsd-start">
          <h2 id="hdsd-start" className="font-heading text-2xl font-bold tracking-tight">
            4. Bắt đầu sử dụng — chọn đúng cổng của bạn
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PORTALS.map((portal) => (
              <Link
                key={portal.href}
                href={portal.href}
                className="bento-card block p-5 transition-colors hover:border-[#c9a227]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h3 className="font-heading text-base font-bold text-[#a16207]">{portal.label}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{portal.desc}</p>
                <span className="mt-3 inline-block text-sm font-semibold text-primary">
                  Đăng nhập ngay →
                </span>
              </Link>
            ))}
          </div>
          <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" aria-hidden="true" />
              Tài khoản do nhà trường/trung tâm cấp — quên mật khẩu liên hệ Quản lý cơ sở để cấp lại.
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" aria-hidden="true" />
              Hệ thống chạy tốt trên máy tính, iPad và điện thoại — không cần cài đặt phần mềm.
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" aria-hidden="true" />
              Đăng nhập xong, hệ thống tự đưa bạn về đúng không gian làm việc theo vai trò.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-5 text-center text-xs text-muted-foreground">
        EDU SYSTEM · Hệ thống Quản lý Giáo dục Đa cơ sở kết hợp AI
      </footer>
    </div>
  )
}
