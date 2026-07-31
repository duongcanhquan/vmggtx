# Design System Master File — GDTX ERP

> **LOGIC:** Khi build một trang cụ thể, kiểm tra `design-system/gdtx-erp/pages/[page-name].md` trước.
> Nếu file đó tồn tại, quy tắc của nó **ghi đè** file Master này.
> Nếu không, tuân thủ nghiêm ngặt các quy tắc bên dưới.

---

**Project:** GDTX ERP — Hệ thống Quản lý Giáo dục Đa cơ sở
**Generated:** 2026-07-31 (tổng hợp từ ui-ux-pro-max: 2 lần chạy --design-system, tinh chỉnh cho ERP giáo dục + tiếng Việt)
**Pattern:** Bento Grid | **Style:** Vibrant & Block-based (bản điều chỉnh professional cho giáo dục)

---

## Global Rules

### Color Palette (semantic tokens — KHÔNG hardcode hex trong component)

| Role | Hex | CSS Variable | Ghi chú |
|------|-----|--------------|---------|
| Primary | `#4F46E5` | `--color-primary` | Indigo — tin cậy, hiện đại. Contrast trên trắng 7.1:1 |
| On Primary | `#FFFFFF` | `--color-on-primary` | |
| Secondary | `#7C3AED` | `--color-secondary` | Violet — dùng cho gradient, highlight |
| Accent/CTA | `#F59E0B` | `--color-accent` | Amber — CTA nổi bật, text trên accent phải TỐI |
| Background | `#F8FAFC` | `--color-background` | Nền app (slate-50) |
| Surface | `#FFFFFF` | `--color-surface` | Nền card bento |
| Foreground | `#0F172A` | `--color-foreground` | Text chính (slate-900) |
| Muted FG | `#64748B` | `--color-muted-foreground` | Text phụ (slate-500, 4.76:1 trên trắng) |
| Border | `#E2E8F0` | `--color-border` | slate-200 |
| Destructive | `#DC2626` | `--color-destructive` | Kèm icon/text, không chỉ dùng màu |
| Ring | `#4F46E5` | `--color-ring` | Focus ring 2px, luôn hiển thị |

**Bento tint palette** (nền ô bento + màu icon đậm tương ứng — tạo sự "cuốn hút" mà vẫn dễ nhìn):

| Tint | Nền | Icon/Số liệu |
|------|-----|--------------|
| Indigo | `#EEF2FF` | `#4F46E5` |
| Emerald | `#ECFDF5` | `#059669` |
| Amber | `#FFFBEB` | `#D97706` |
| Rose | `#FFF1F2` | `#E11D48` |
| Sky | `#F0F9FF` | `#0284C7` |
| Violet | `#F5F3FF` | `#7C3AED` |

### Typography (bắt buộc hỗ trợ tiếng Việt đầy đủ)

- **Heading Font:** `Be Vietnam Pro` (600/700/800) — thiết kế riêng cho tiếng Việt, hình học, hiện đại
- **Body Font:** `Inter` (400/500/600) — subset `vietnamese`, dễ đọc ở mọi cỡ
- **Số liệu KPI:** dùng `tabular-nums` để không nhảy layout
- Base 16px, line-height 1.5–1.75 cho body; KHÔNG dùng Fira Code cho heading (thiếu hỗ trợ tiếng Việt — đã loại khi tổng hợp)
- Load qua `next/font/google` (tự động font-display: swap, không FOIT)

### Spacing & Radius

- Hệ 4/8px: 4, 8, 12, 16, 24, 32, 48
- Bento card: `border-radius: 16px` (rounded-2xl), padding 20–24px, gap giữa các ô 12–16px (mobile) / 16–24px (desktop)
- Container desktop: max-w-7xl

### Shadow & Effects

| Level | Usage |
|-------|-------|
| `shadow-sm` | Card mặc định |
| `shadow-md` + `-translate-y-0.5` | Card hover (transform, KHÔNG đổi kích thước layout) |
| `shadow-lg` | Modal, dropdown, drawer |

- Transition 200ms ease-out cho hover/focus; exit nhanh hơn enter
- Tôn trọng `prefers-reduced-motion` (tắt transform/animation)

### Bento Grid Layout (pattern chủ đạo)

- Desktop (≥1024px): grid 4 cột, ô quan trọng span 2 cột
- Tablet (768–1023px): grid 2 cột
- Mobile (<768px): stack 1 cột, thứ tự theo mức độ quan trọng
- Mỗi ô: 1 icon tile màu (từ Bento tint palette) + số liệu lớn (heading font) + label rõ ràng

### Responsive & Navigation

- Breakpoints kiểm thử: **375 / 768 / 1024 / 1440**
- Desktop: sidebar cố định trái (adaptive-navigation)
- Mobile/tablet: sidebar ẩn thành drawer + nút hamburger (touch target ≥44×44px), overlay scrim 50% đen
- Không horizontal scroll; dùng `min-h-dvh` thay `100vh`

---

## Anti-Patterns (TUYỆT ĐỐI TRÁNH)

- ❌ Emoji làm icon — chỉ dùng SVG (Lucide, đồng nhất stroke 2px)
- ❌ Hardcode hex trong component — dùng token Tailwind semantic
- ❌ Text < 16px cho body trên mobile; contrast < 4.5:1
- ❌ Hover làm shift layout (chỉ transform/opacity/shadow)
- ❌ Thiếu cursor-pointer / focus ring / trạng thái loading
- ❌ Layout chung chung (generic) — luôn dùng bento tile có màu sắc
- ❌ Trộn nhiều style (flat + glass + clay) trong cùng hierarchy

---

## Pre-Delivery Checklist (chạy trước khi bàn giao MỌI UI)

- [ ] Không emoji làm icon; icon cùng 1 bộ Lucide
- [ ] `cursor-pointer` trên mọi phần tử click được
- [ ] Hover/focus có transition 150–300ms, focus ring nhìn thấy được
- [ ] Contrast text ≥ 4.5:1 (kiểm tra cả text trên nền tint)
- [ ] `prefers-reduced-motion` được tôn trọng
- [ ] Responsive OK ở 375px, 768px, 1024px, 1440px; không horizontal scroll
- [ ] Touch target ≥ 44×44px trên mobile
- [ ] Nội dung không bị che bởi header/sidebar cố định
- [ ] Số liệu dùng tabular-nums; font tiếng Việt render đúng dấu
