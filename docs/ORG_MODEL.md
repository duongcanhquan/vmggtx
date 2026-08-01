# MÔ HÌNH TỔ CHỨC & PHÂN QUYỀN — TÀI LIỆU CHUẨN

> Nguồn sự thật về cách tổ chức, thuật ngữ và ranh giới quyền hạn.
> Mọi thay đổi code liên quan tổ chức/phân quyền PHẢI đối chiếu file này.
> Cập nhật: 2026-08-01.

---

## 1. THUẬT NGỮ THỐNG NHẤT (không dùng từ khác)

| Thuật ngữ | Là gì | Trong database |
|---|---|---|
| **Đơn vị** (Trường / Trung tâm GD) | Pháp nhân giáo dục GỐC. Super Admin tạo. Có cổng đăng nhập riêng `/coso/[slug]`, có gói module riêng. | `organizations.type = 'campus'` |
| **Cơ sở / Trung tâm** | Điểm hoạt động BÊN TRONG một Đơn vị (Cơ sở 1, Cơ sở 2, Trung tâm B1...). Admin Đơn vị tạo. Tối đa 3 tầng dưới Đơn vị. | `organizations.type = 'branch'` |
| **Admin Đơn vị** | Người chịu trách nhiệm toàn bộ vận hành của Đơn vị và mọi Cơ sở bên dưới. | `profiles.role = 'campus_admin'` |
| **Gói module** | Danh sách module Đơn vị được dùng. CHỈ gắn ở cấp Đơn vị, tự kế thừa xuống mọi Cơ sở. | `tenant_licenses` (org_id = Đơn vị) |

**Nguyên tắc con người thuộc Đơn vị:** học sinh, giảng viên, nhân viên đều LÀ NGƯỜI CỦA
ĐƠN VỊ. Trường `profiles.org_id` trỏ vào Cơ sở chỉ để biết "đang học/làm ở điểm nào" —
mọi thống kê, license, giới hạn học viên, báo cáo đều TÍNH GỘP Ở CẤP ĐƠN VỊ.
Chuyển cơ sở = đổi org_id trong cùng cây Đơn vị, không phải chuyển trường.

**KHÔNG có "Tổng công ty" / "Miền":** loại `hq` và `region` là di sản, không dùng cho
nghiệp vụ mới. Đơn vị nằm ngay dưới gốc hệ thống.

---

## 2. HAI TẦNG QUẢN TRỊ — RANH GIỚI TUYỆT ĐỐI

### Tầng 1 — SUPER ADMIN (chủ hệ thống, "bán và giao chìa khóa")

ĐƯỢC làm — và CHỈ làm:
1. **Tạo / đổi tên / tạm ngưng Đơn vị** (không đụng vào Cơ sở bên trong).
2. **Tạo Admin Đơn vị** và gắn vào Đơn vị.
3. **Gán gói module cho Đơn vị** (ghép/gỡ module, bật/tắt module hay tính năng con,
   đặt hạn dùng, giới hạn học viên) — tại Trung tâm Module + Phân quyền Module.
4. **Xem hồ sơ từng Đơn vị**: bao nhiêu admin, nhân viên, giảng viên, học sinh,
   module nào đang hoạt động, license còn hạn không. CHỈ XEM con số tổng — không xem
   chi tiết nghiệp vụ (điểm, học phí, hồ sơ từng em...).

KHÔNG được làm:
- Không tạo Cơ sở/Trung tâm bên trong Đơn vị (việc của Admin Đơn vị).
- Không tạo nhân viên/giáo viên/học sinh (trừ tạo Admin Đơn vị đầu tiên).
- Không cấu hình nghiệp vụ (mã học viên, biểu phí, mẫu đơn... là cá nhân hóa của Đơn vị).

### Tầng 2 — ADMIN ĐƠN VỊ (giám đốc, "toàn quyền trong nhà mình")

Toàn quyền TRONG CÂY của Đơn vị mình, TRONG PHẠM VI gói module được gán:
1. **Tổ chức**: tạo/sửa/xóa Cơ sở, Trung tâm (tối đa 3 tầng); đổi tên chính Đơn vị mình.
2. **Con người**: tạo tài khoản mọi vai trò (giáo vụ, tuyển sinh, kế toán, giáo viên);
   gán người vào Cơ sở; có thể tạo "phó giám đốc" phụ trách một Cơ sở (campus_admin
   với org_id = Cơ sở đó → quyền tự co lại trong nhánh đó).
3. **Phân quyền nội bộ**: ma trận menu cho từng vai trò — KHÔNG BAO GIỜ vượt quá gói
   module của Đơn vị (hệ thống tự giao 2 tập: ma trận ∩ gói).
4. **Quy định chung vs cá nhân hóa theo Cơ sở**: mọi cấu hình (quy tắc mã học viên,
   biểu phí, mẫu đơn từ, quy trình duyệt, giao diện...) đặt ở cấp Đơn vị thì TỰ KẾ THỪA
   xuống mọi Cơ sở; Admin có thể cho phép một Cơ sở GHI ĐÈ riêng (cài đặt đặt ở org
   con thắng org cha). Kế thừa-ghi đè này đã chạy qua `org_settings` + `settingsResolver`.

### Tầng 3 — VAI TRÒ NGHIỆP VỤ (trong Đơn vị)

| Vai trò | Phạm vi mặc định |
|---|---|
| `academic_staff` (giáo vụ) | Lớp, lịch, điểm danh, khảo thí, duyệt đơn GV — trong nhánh org được gán |
| `admission_staff` (tuyển sinh) | CRM lead, hồ sơ nhập học |
| `accountant` (kế toán) | Học phí, công nợ, lương, tài sản |
| `teacher` (giảng viên) | Lớp mình dạy: điểm danh, sổ liên lạc, LMS, đề xuất lịch/đơn từ |
| `student` / phụ huynh | Cổng riêng: lịch, điểm, học phí, thông báo, LMS |

Phạm vi thấy menu của MỌI vai trò = ma trận phân quyền (Admin Đơn vị đặt) ∩ gói module
(Super Admin gán) ∩ công tắc module đang bật.

---

## 3. CHUỖI KIỂM SOÁT MODULE (3 lớp, thứ tự ưu tiên)

1. **Gói license của Đơn vị** (`tenant_licenses.module_keys`) — "Đơn vị có mua không?"
   Super Admin ghép/gỡ tại Trung tâm Module. Không có trong gói = cả Đơn vị không thấy.
2. **Công tắc module** (`module_flags`) — "Đang bật hay tạm khóa?" Super Admin tắt
   toàn hệ thống / theo Đơn vị / từng tính năng con (bảo trì, vi phạm, gói thử...).
3. **Ma trận phân quyền** (`menu_permissions`) — "Ai TRONG Đơn vị được dùng?"
   Admin Đơn vị phân cho từng vai trò.

Thực thi: middleware (chặn URL) + menu (ẩn mục) + RLS (chặn dữ liệu — lớp thật sự).

---

## 4. ĐỐI CHIẾU HIỆN TRẠNG — VIỆC CẦN LÀM

| # | Hạng mục | Trạng thái |
|---|---|---|
| G1 | Ẩn `hq`/`region` khỏi UI — Super Admin chỉ tạo Đơn vị (`campus`), Admin Đơn vị tạo Cơ sở/Trung tâm (`branch`) | ✅ XONG (2026-08-01) — schema tạo/sửa chỉ còn 2 loại; dữ liệu hq/region cũ giữ nguyên chỉ-đọc |
| G2 | Hồ sơ Đơn vị cho Super Admin | ✅ XONG — `/admin/organizations/[id]`: đếm admin/NV/GV/HS gộp cả cây, module active/off/chưa ghép, license, danh sách Cơ sở bên trong |
| G3 | Đổi nhãn toàn UI: `campus` → "Đơn vị (Trường)", `branch` → "Cơ sở / Trung tâm" | ✅ XONG — `ORG_TYPE_LABELS`, menu, trang tổ chức |
| G4 | Con người thuộc Đơn vị (đếm theo cây) | ✅ XONG — nút "Chuyển Cơ sở" trong hồ sơ học viên 360° (chỉ trong cùng cây Đơn vị, chặn chuyển chéo Trường); nhân sự/GV chuyển org tại trang Tài khoản (có sẵn) |
| G5 | Chính sách ghi đè 3 mức theo nhóm cài đặt (Học vụ / Giao tiếp / Tài chính / Mã học viên): `inherit` (kế thừa & ghi đè) / `locked` (khóa cứng) / `required` (bắt buộc tự cấu hình) | ✅ XONG — lưu `org_settings.config.override_policies` trên Đơn vị gốc; server chặn lưu nhóm locked; UI /settings hiện badge Kế thừa/Khóa/Bắt buộc + selector cho Admin Đơn vị |
| G6 | Gói module gắn đúng cấp Đơn vị | ✅ Đúng sẵn |

---

## 5. VÍ DỤ CHUẨN (dùng khi giải thích / viết test)

- Super Admin tạo Đơn vị **"Trường A"** + tài khoản Admin `admin@truonga.vn`,
  ghép gói: Hồ sơ HS, Điểm danh, Học phí.
- Admin Trường A tạo **Cơ sở A1, Cơ sở A2**, và **Trung tâm B1** bên trong A1.
- Học sinh Nguyễn Văn X ghi danh tại A2 → X là học sinh CỦA TRƯỜNG A, đang học ở A2.
  Trường A báo cáo 1.000 HS = tổng A + A1 + A2 + B1.
- Admin Trường A đặt quy tắc mã học viên chung `TA-{năm}-{số}`; cho phép A2 ghi đè
  thành `A2-{số}`. B1 không được ghi đè → dùng quy tắc chung.
- Trường A không mua module Tài sản → không ai trong Trường A (kể cả Admin) thấy
  menu Tài sản, và Admin không thể phân quyền mục đó cho nhân viên.
