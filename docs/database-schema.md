# GDTX ERP - Database Schema (Multi-tier)

Hệ thống ERP Giáo dục **ĐA TẦNG**: HQ (Tổng công ty) → Region (Cụm/Vùng) → Campus (Cơ sở) → Branch (Chi nhánh).
Toàn bộ bảng dùng UUID làm khóa chính, áp dụng **Soft Delete** (`deleted_at`) và có đủ 3 cột audit:
`created_at`, `updated_at`, `deleted_at`.

> Migration nguồn: `supabase/migrations/001_multi_tier_schema.sql` (thay thế hoàn toàn cấu trúc `campuses` cũ)
> và `002_ai_functions.sql` (RAG).

## Quy ước chung

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `uuid` | PK, default `uuid_generate_v4()` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | tự cập nhật qua trigger `set_updated_at` |
| `deleted_at` | `timestamptz` | `NULL` = còn hiệu lực. KHÔNG dùng `DELETE`, chỉ UPDATE cột này |

## Cây tổ chức

### `organizations` — Cấu trúc cây đa tầng
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Tên tổ chức, NOT NULL |
| `type` | text | `hq` \| `region` \| `campus` \| `branch` |
| `parent_id` | uuid | FK → `organizations(id)` (self-reference tạo cây); `NULL` = gốc (HQ) |
| `path` | ltree | Đường dẫn cây, VD `hq_id.region_id.campus_id` (uuid đổi `-` thành `_`). **Tự sinh bởi trigger `set_org_path`, không nhập tay.** Index GiST |

Truy vấn cây dùng operator ltree: `path <@ ancestor_path` (là con/cháu của), tối ưu bằng index GiST.

### `profiles` — Người dùng
Liên kết 1-1 với `auth.users` của Supabase (`id` = `auth.users.id`).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` |
| `full_name` | text | NOT NULL |
| `email` | text | unique |
| `role` | text | `super_admin` \| `campus_admin` \| `academic_staff` \| `teacher` \| `student` (migration 005) |
| `org_id` | uuid | FK → `organizations(id)` — nơi user trực thuộc, quyết định PHẠM VI dữ liệu nhìn thấy |
| `phone` | text | SĐT liên hệ, có index — dò trùng lặp TOÀN HỆ THỐNG khi import (migration 004) |
| `address` | text | Địa chỉ (migration 004) |

## Bảng vận hành (Operations) — BẮT BUỘC có `org_id`

`org_id` thay thế hoàn toàn `campus_id` cũ. Mọi query phải filter theo `org_id` (trực tiếp hoặc qua RLS).

### `classes` — Lớp học
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`, **NOT NULL** (multi-tenant key) |
| `name` | text | NOT NULL |
| `teacher_id` | uuid | FK → `profiles(id)` |
| `subject_id` | uuid | FK → `subjects(id)` (migration 003) |
| `start_date` | date | Ngày khai giảng |
| `end_date` | date | CHECK `end_date >= start_date` |

**RLS bật trên bảng này** (xem mục Phân quyền bên dưới).

**Logic tạo lớp (tính độc lập giữa các org):** trước khi INSERT phải kiểm tra
(1) `teacher_id` có `profiles.org_id` nằm trong `get_descendant_org_ids(currentOrgId)` — giáo viên Cụm khác không được gán;
(2) `subject_id` đang `is_active = true`.

### `subjects` — Môn học (migration 003)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`; `NULL` = môn dùng chung toàn hệ thống |
| `name` | text | NOT NULL |
| `is_active` | boolean | default `true` — lớp mới chỉ được gắn môn đang kích hoạt |

### `class_sessions` — Buổi học
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`, **NOT NULL** |
| `class_id` | uuid | FK → `classes(id)`, NOT NULL |
| `teacher_id` | uuid | FK → `profiles(id)` |
| `room` | text | Phòng học |
| `start_time` / `end_time` | timestamptz | NOT NULL, CHECK `end_time > start_time` |
| `status` | text | `scheduled` \| `completed` \| `cancelled` (migration 013) |

Chống trùng lịch qua RPC `check_schedule_conflict(p_teacher_id, p_room, p_start_time, p_end_time)`:
trả về `true` nếu tồn tại buổi học (chưa xóa) trùng giáo viên HOẶC trùng phòng và giao nhau thời gian (`tstzrange &&`).

**Vòng đời buổi học (013)**: `submitAttendance` chốt điểm danh → tự đánh dấu
`status = 'completed'`. Engine Tính Lương (`src/lib/services/payrollService.ts`)
CHỈ đếm buổi `completed` làm số tiết đã dạy; buổi `cancelled` không tính công.

### `attendance` — Điểm danh
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`, **NOT NULL** |
| `session_id` | uuid | FK → `class_sessions(id)`, NOT NULL |
| `student_id` | uuid | FK → `profiles(id)`, NOT NULL |
| `status` | text | `present` \| `absent` \| `late` \| `excused` |
| `note` | text | Ghi chú |

UNIQUE (`session_id`, `student_id`) — phục vụ Upsert điểm danh.

## Bảng AI (RAG)

### `lesson_materials` — Tài liệu giảng dạy
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `class_id` | uuid | FK → `classes(id)`, NOT NULL (phạm vi org suy ra từ lớp) |
| `content` | text | Nội dung tài liệu (đã chunk) |
| `embedding` | vector(1536) | `text-embedding-3-small` |

Tìm kiếm ngữ nghĩa qua RPC `match_lesson_materials(query_embedding, filter_class_id, match_count)`
(cosine distance `<=>`, index `ivfflat` — file 002).

### `invoices` — Hóa đơn học phí (migration 007)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`, NOT NULL |
| `student_id` | uuid | FK → `profiles(id)`, NOT NULL |
| `amount` | numeric(14,2) | Tổng tiền hóa đơn, > 0 |
| `status` | text | `pending` \| `partial` \| `paid` \| `cancelled` — backend tự chuyển theo SUM phiếu thu |
| `due_date` | date | Hạn nộp; quá hạn + chưa thu đủ = công nợ cần xử lý |

### `payments` — Phiếu thu (migration 007)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK → `organizations(id)`, NOT NULL |
| `invoice_id` | uuid | FK → `invoices(id)`, NOT NULL |
| `amount_paid` | numeric(14,2) | Số tiền thu đợt này, > 0 |
| `payment_method` | text | `cash` \| `transfer` |
| `recorded_by` | uuid | FK → `profiles(id)` — người lập phiếu |

RLS (007): `super_admin` thấy tất cả; `campus_admin`/`academic_staff` SELECT/INSERT/UPDATE
trong subtree (qua `is_org_in_my_subtree`); teacher/student không truy cập trực tiếp bảng tài chính.
Luồng thu tiền: INSERT `payments` → SUM `amount_paid` → tổng ≥ `amount` thì `status='paid'`, ngược lại `'partial'`.

### `assessments` — Bài kiểm tra (migration 008, 023)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `class_id` | uuid | FK, NOT NULL |
| `name` | text | VD: 'Giữa kỳ', '15 phút' |
| `weight` | numeric(4,2) | Hệ số (0.1, 0.2…), > 0 |
| `max_score` | numeric(5,2) | Mặc định 10 |
| `grading_deadline` | timestamptz | (023) Hạn chót GV nhập điểm; NULL = không giới hạn |

### `grades` — Điểm số (migration 008)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `assessment_id` / `student_id` | uuid | FK, NOT NULL |
| `score` | numeric(5,2) | ≥ 0; UNIQUE (assessment_id, student_id) để upsert |
| `note` | text | Ghi chú |

### `class_results` — Tổng kết / Khóa sổ (migration 008, 023)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `class_id` | uuid | FK, UNIQUE — mỗi lớp 1 dòng |
| `lock_status` | text | (023) `open` \| `review` \| `locked`; NGUỒN SỰ THẬT của khóa sổ |
| `is_locked` | boolean | (023) GENERATED COLUMN = `lock_status = 'locked'` — chỉ đọc |
| `locked_at` / `locked_by` | | Ai chốt, lúc nào |

**Cơ chế khóa 2 tầng (023)**: Server Action `updateGrade` check `lock_status = 'locked'`
VÀ `assessments.grading_deadline` trước khi ghi; trigger `trg_grades_prevent_locked`
chặn INSERT/UPDATE/DELETE trên `grades` ở tầng DB (raise `GRADEBOOK_LOCKED` khi chốt sổ,
`GRADING_DEADLINE_PASSED` khi quá hạn) kể cả khi gọi thẳng API Supabase.
Khảo thí (`/staff/exams`): "Gia hạn nhập điểm" = dời `grading_deadline` về tương lai +
mở `lock_status='open'`; "Chốt sổ điểm" = `lock_status='locked'`.
RLS (008): super_admin tất cả; campus_admin/staff trong subtree; teacher chỉ lớp mình
phụ trách qua helper `is_my_class(class_id)` (kể cả lớp ở chi nhánh khác).

### `enrollments` — Ghi danh (migration 009)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `class_id` / `student_id` | uuid | FK, NOT NULL |
| `status` | text | `active` \| `completed` \| `dropped`; UNIQUE (class_id, student_id) |

RLS (009): staff/admin toàn quyền trong subtree; teacher SELECT ghi danh lớp mình;
học sinh SELECT ghi danh của CHÍNH MÌNH (`student_id = auth.uid()`).
Migration 009 cũng bổ sung policy cho Cổng Học sinh: học sinh SELECT `grades`
của mình và SELECT `assessments` của lớp đang ghi danh.

### `teacher_contracts` — Hợp đồng giáo viên (migration 010, nâng cấp 012)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `teacher_id` | uuid | FK, NOT NULL |
| `contract_type` | text | `full_time` (biên chế) \| `visiting` (thỉnh giảng) \| `hourly` (khoán giờ) \| `probation` (legacy) |
| `base_salary` | numeric(14,2) | Lương cơ bản (biên chế/thử việc) |
| `insurance_salary` | numeric(14,2) | Mức lương làm căn cứ đóng BHXH (0 = dùng base_salary) |
| `base_hourly_rate` | numeric(12,2) | Đơn giá 1 tiết (thỉnh giảng/khoán giờ + tiết vượt của biên chế) |
| `required_hours_per_month` | int | Số tiết nghĩa vụ/tháng (biên chế) |
| `insurance_percentage` / `tax_percentage` | numeric(5,2) | % trích BHXH/BHYT người lao động / % thuế TNCN, 0–100 |
| `start_date` / `end_date` / `is_active` | | UNIQUE partial: 1 hợp đồng active/GV/org |

### `rate_modifiers` — Hệ số đơn giá (migration 012)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK, NOT NULL |
| `condition_type` | text | `subject` \| `grade_level` \| `special_class` |
| `condition_value` | varchar(120) | VD: 'Toán', 'Khối 12', 'Lớp VIP' |
| `rate_multiplier` | numeric(6,3) | Hệ số nhân đơn giá (VD 1.2), > 0 |
| `added_amount` | numeric(12,2) | Tiền cộng thêm cố định/tiết |

RLS (012): admin/staff toàn quyền trong subtree; teacher SELECT hệ số của org mình.

### `payrolls` — Bảng lương chốt hàng tháng (migration 010, nâng cấp 012)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `teacher_id` | uuid | FK, NOT NULL |
| `month` / `year` | int | UNIQUE (teacher_id, month, year) để upsert khi tính lại |
| `contract_snapshot` | jsonb | Bản chụp hợp đồng tại thời điểm chốt — BẰNG CHỨNG pháp lý |
| `total_hours_taught` | numeric(7,2) | Giờ dạy thực tế (session đã diễn ra + có điểm danh) |
| `regular_pay` / `teaching_pay` / `total_allowance` | numeric(14,2) | Lương cơ bản / tiền dạy-overtime / phụ cấp |
| `insurance_deduction` / `tax_deduction` / `net_pay` | numeric(14,2) | Khấu trừ và thực lãnh |
| `status` | text | `draft` → `approved` → `paid`; action tính lương KHÔNG ghi đè bản đã approved/paid |

**Công thức** (`calculateMonthlyPayroll`): visiting/hourly = giờ dạy × đơn giá − thuế;
full_time/probation = lương cơ bản + max(0, giờ dạy − nghĩa vụ) × đơn giá − BH(trên insurance_salary, 0 = base_salary) − thuế.
RLS (010): super_admin tất cả; campus_admin/staff trong subtree; teacher SELECT hợp đồng + bảng lương của CHÍNH MÌNH.

### `assessment_types` — Loại bài kiểm tra (migration 011)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | NULL = loại dùng chung toàn hệ thống |
| `name` | text | Miệng, 15 phút, Giữa kỳ, Cuối kỳ (seed sẵn 4 loại chung) |
| `weight` | numeric(4,2) | Hệ số 1 / 2 / 3 — nguồn hệ số CHUẨN cho tính ĐTB |

Migration 011 cũng thêm `assessments.type_id` (FK) + `assessments.test_date`,
và siết CHECK `grades.score` trong khoảng **0–10** (đồng bộ zod `gradeScoreSchema`).

### View `vw_student_attendance_stats` (migration 011)
GROUP BY (student_id, class_id, org_id) từ `attendance` JOIN `class_sessions` JOIN `classes`:
`total_sessions`, `present_count` (present/late), `excused_count`, `unexcused_count`.
Khai báo `security_invoker = true` → RLS của bảng gốc vẫn áp dụng cho người truy vấn.

### `student_warnings` — Cờ cảnh báo học vụ (migration 011)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` / `student_id` / `class_id` | uuid | FK, NOT NULL |
| `warning_type` | text | `attendance` (cờ ĐỎ - vắng nhiều) \| `grade` (cờ CAM - học yếu) |
| `description` | text | Lý do chi tiết |
| `status` | text | `new` → `notified` (đã Zalo PH qua n8n) → `resolved`; UNIQUE (student_id, class_id, warning_type) |

**Ngưỡng cảnh báo** (`runEarlyWarningSystem`): vắng KHÔNG phép ≥ 3 buổi HOẶC tổng vắng > 20% số buổi;
ĐTB có trọng số (ưu tiên `assessment_types.weight`, fallback `assessments.weight`) < 5.0.
RLS (011): admin/staff toàn quyền trong subtree; `assessment_types` cho mọi user đăng nhập ĐỌC loại dùng chung.

### `leads` — Học sinh tiềm năng, CRM Tuyển sinh (migration 014)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK, NOT NULL |
| `full_name` / `phone` | text / varchar(20) | NOT NULL |
| `interested_subject_id` | uuid | FK → `subjects(id)`, nullable |
| `status` | text | `new` → `contacted` → `test_scheduled` → `enrolled` \| `lost` (pipeline Kanban) |
| `counselor_id` | uuid | FK → `profiles(id)` — Tư vấn viên phụ trách, NULL = chưa ai nhận |
| `converted_student_id` | uuid | FK → `profiles(id)` — set khi chuyển hóa thành học sinh, chống chuyển hóa 2 lần |
| `notes` | text | Ghi chú tư vấn |

### `lead_activities` — Nhật ký chăm sóc lead (migration 014)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` / `org_id` / `lead_id` | uuid | FK; lead_id ON DELETE CASCADE |
| `activity_type` | text | `call` \| `email` \| `meeting` |
| `description` / `created_by` / `created_at` | | |

**Role mới (014)**: `admission_staff` (Tư vấn viên tuyển sinh) thêm vào `profiles_role_check`.
RLS `leads`: super_admin tất cả; campus_admin/academic_staff toàn quyền trong subtree;
`admission_staff` CHỈ thấy/sửa leads trong org mình VÀ (`counselor_id = auth.uid()` HOẶC `counselor_id IS NULL`).
`lead_activities` kế thừa quyền qua subquery vào `leads` (RLS leads tự áp).
**Chuyển hóa Lead → Student** (`convertLeadToStudent`): đọc lead qua RLS làm cửa phân quyền,
sau đó Admin client tạo auth user + profile (role student) + enrollment + hóa đơn học phí đầu tiên,
cuối cùng set `status='enrolled'` + `converted_student_id`.

### Secure View `vw_teacher_contracts_secure` (migration 015)
Rào chắn dữ liệu tài chính nhạy cảm:
- `profiles.can_view_financials` (boolean, default **false**): quyền xem lương/đơn giá.
  Mặc định chỉ super_admin và campus_admin gắn org cấp **Cụm (region) trở lên** được set true.
- Helper `get_my_can_view_financials()` (`SECURITY DEFINER`) đọc quyền của user hiện tại.
- View (`security_invoker = true` — RLS bảng gốc vẫn áp): nếu KHÔNG có quyền,
  `base_salary` / `insurance_salary` / `base_hourly_rate` trả về **NULL** và cờ
  `financials_masked = true`; các cột khác (tên, ngày, %, loại HĐ) giữ nguyên.
- **Backend BẮT BUỘC query view này thay vì `teacher_contracts`** khi đọc/hiển thị.
  Engine tính lương (`payrollService`, `calculateMonthlyPayroll`) cũng đọc qua view và
  TỪ CHỐI chạy nếu dữ liệu bị mask (không bao giờ tính lương trên số bị che).

### `org_settings` — Cấu hình động theo tổ chức (migration 016)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK, NOT NULL, **UNIQUE** (mỗi org tối đa 1 record) |
| `config` | jsonb | VD: `{"auto_attendance_sms": true, "max_absence_warning": 3, "grading_locked_days": 7, "require_manager_approval_for_refunds": true}` |
| `updated_at` / `updated_by` | | Ai sửa lần cuối |

**Kế thừa (Inheritance)** — hàm `get_org_effective_config(p_org_id) returns jsonb`
(`SECURITY DEFINER`, grant execute cho authenticated): bắt đầu từ bộ DEFAULT, duyệt các
tổ chức tổ tiên bằng `path @>` theo độ sâu tăng dần rồi merge JSONB (`||`) — cấp GẦN org
nhất thắng. Org không có record riêng tự dùng config của Vùng → Tổng công ty → default.
RLS (016): super_admin tất cả; campus_admin toàn quyền trong subtree; thành viên khác ĐỌC config org mình.
**Tích hợp**: `submitAttendance` query config hiệu lực trước khi bắn Zalo n8n —
`auto_attendance_sms = false` thì bỏ qua thông báo. UI cài đặt tại `/settings`
(middleware chỉ cho super_admin/campus_admin).

### `user_settings` — Tầng cài đặt Cá nhân (migration 020)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK auth.users, NOT NULL, **UNIQUE** |
| `config` | jsonb | Cùng dạng key/value với `org_settings.config` |

RLS: mỗi user toàn quyền record của mình; super_admin chỉ đọc.

**Settings Resolver (`src/lib/utils/settingsResolver.ts`)** — chuỗi kế thừa ĐẦY ĐỦ, thay dần RPC `get_org_effective_config` phía TypeScript:
`resolveSetting(settingKey, currentOrgId, userId?)`: **B1** `user_settings` của user → **B2** `org_settings` của org hiện tại → **B3** leo `parent_id` (Cơ sở → Cụm → HQ, tối đa 10 tầng, chống vòng lặp) → **B4** default trong code (`SETTING_DEFAULTS`). Giá trị jsonb sai kiểu so với default bị bỏ qua (tiếp tục leo). File `server-only`, dùng ADMIN client vì RLS không cho user thường đọc config của org tổ tiên.

Key đang dùng: `openai_api_key` (fallback cuối cho `getAIConfig` — sau `org_ai_settings`, trước env), `allow_late_checkin_minutes` (hiển thị/áp dụng ở trang điểm danh qua `getAttendancePolicy`), `tax_rate_default` (payrollService dùng khi hợp đồng không ghi `tax_percentage`), cùng 4 key từ migration 016.

**UI SuperAdmin `/admin/settings`** (middleware chỉ super_admin): ghi các key toàn cục vào `org_settings` của org gốc (parent_id null) theo kiểu MERGE — tự "tràn" xuống mọi cơ sở con chưa ghi đè. `saveOrgSettings` của `/settings` cũng đã chuyển sang merge để không xóa mất key toàn cục.

### `org_ai_settings` — Multi-tenant AI (migration 017)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK, NOT NULL, **UNIQUE** |
| `ai_provider` | varchar(20) | `openai` / `anthropic` / `google` |
| `api_key` | text | TỐI MẬT — không bao giờ trả về client (chỉ 4 ký tự cuối). Khuyến nghị production: Supabase Vault |
| `default_model` | varchar(80) | VD `gpt-4o-mini`, `gemini-1.5-flash` |
| `is_active` | boolean | Tắt = org này dùng key kế thừa từ cấp trên |

**RLS (017)**: chỉ `super_admin` và `campus_admin` (trong subtree) có policy — mọi
role khác bị chặn hoàn toàn kể cả SELECT.
**Fallback dây chuyền** — `src/lib/ai/getTenantAIConfig.ts` (`server-only`, dùng
Service Role): key của chính org → leo `parent_id` lên org Mẹ/HQ → cuối cùng dùng
env `OPENAI_API_KEY`. UI cấu hình tại `/settings/ai` (Server Action `saveAISettings`,
để trống key = giữ key cũ).

### RAG Data Isolation — `lesson_materials` (migration 018)
- Thêm `org_id` (uuid, **NOT NULL**, backfill từ org của lớp) — cột cách ly tenant.
- `class_id` trở thành **nullable**: tài liệu có thể thuộc kho tri thức toàn cơ sở.
- Thêm `metadata` (jsonb): `{file_name, author, subject, grade_level, chunk_index, total_chunks}`.
- **`match_lesson_materials` viết lại**: chữ ký mới `(query_embedding, p_org_id uuid, filter_class_id uuid default null, match_count int default 5)` — `WHERE org_id = p_org_id` là điều kiện BẮT BUỘC, `filter_class_id` NULL = tìm toàn cơ sở. Không bao giờ vector search mà thiếu org_id.
- RLS: super_admin tất cả; thành viên đọc tài liệu org mình/subtree; teacher/staff ghi cho org của chính mình (campus_admin ghi cho subtree).
- Nạp tài liệu tại `/ai/knowledge-base` (`processDocumentForAI`): PDF/TXT/MD → chunking (~1200 ký tự, chồng lấn 150) → embedding `text-embedding-3-small` bằng API Key tenant (`getAIConfig`) → insert khóa cứng `org_id` theo profile user.

## Trường dữ liệu động (migration 019 — Dynamic Custom Fields)

Mỗi cơ sở (`org_id`) tự định nghĩa thuộc tính riêng cho Học sinh / Giáo viên / Lớp học — KHÔNG hardcode schema.

- **Cột `custom_metadata` (jsonb, default `'{}'`)** thêm vào `profiles`, `classes`, `organizations` (bảng `campuses` đã được thay bằng `organizations` từ migration 001) — nơi LƯU GIÁ TRỊ. VD: `{"shoe_size": 42, "blood_type": "O"}`.
- **`org_custom_fields`** — nơi ĐỊNH NGHĨA: `id`, `org_id`, `entity_type` (`student` | `teacher` | `class`), `field_name` (tên biến snake_case, check regex, unique theo `(org_id, entity_type, field_name)` khi chưa xóa mềm), `field_label` (tên hiển thị), `field_type` (`text` | `number` | `date` | `boolean` | `select`), `options` (jsonb — mảng lựa chọn khi type = select), `is_required`, timestamps + `deleted_at`.
- **RLS**: `super_admin` toàn quyền; `campus_admin` quản lý định nghĩa trong subtree; thành viên khác chỉ ĐỌC định nghĩa org mình (form nhập liệu cần render).
- **Luồng sử dụng**: Campus Admin cấu hình tại `/settings/custom-fields` → `StudentForm` (`src/components/forms/StudentForm.tsx`) tự sinh giao diện + zod schema động từ định nghĩa (`src/lib/customFields.ts`) → Server Action (`createStudent`/`updateStudent`) validate LẦN 2 bằng cùng bộ luật rồi ghi vào `profiles.custom_metadata`.
- (Yêu cầu gốc đặt tên file `011_dynamic_fields.sql` nhưng số 011 đã dùng nên migration mang số **019**.)

## Mass Import Học sinh (`/students/import`)

Luồng nhập hàng loạt từ Excel/CSV, kiểm soát lỗi TRƯỚC khi chạm DB:
1. **Client**: tải file mẫu (.xlsx/.csv có BOM) → kéo/thả file → parse ngay trên trình duyệt (`papaparse` cho CSV, `xlsx` cho Excel, dynamic import để không phình bundle) → map tên cột linh hoạt (bỏ dấu, hỗ trợ cả tiếng Việt lẫn tiếng Anh) → validate Zod (`importStudentSchema`) từng dòng, dòng lỗi tô đỏ trong `SmartTable` → nút "Tiến hành Import" CHỈ hiện khi 0 dòng lỗi. Tối đa 200 dòng/lần.
2. **Server** (`bulkImportStudents(rows, orgId)`): validate Zod lần 2 → `is_authorized(academic_staff)` trên org đích → **ép `org_id = orgId` cho mọi dòng, tuyệt đối không nhận org từ file** → upsert theo SĐT (đã chuẩn hóa +84→0): trùng SĐT trong subtree → UPDATE hồ sơ; trùng SĐT ngoài subtree hoặc thuộc tài khoản không phải học sinh → đánh fail dòng đó; SĐT mới → tạo auth user (mật khẩu ngẫu nhiên) + INSERT profile, rollback auth user nếu insert profile lỗi → trả về `{successCount, failedCount, rows[]}` chi tiết từng dòng.

## Hồ sơ Học sinh 360° (`/students/[id]`) + `student_ai_chats` (migration 021)

### `student_ai_chats` — Nhật ký câu hỏi gửi Trợ lý AI
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `org_id` | uuid | FK, NOT NULL |
| `student_id` | uuid | FK profiles, NOT NULL |
| `class_id` | uuid | FK classes, nullable |
| `task_type` | text | `tutor` / `lesson_plan` / `hr_query` |
| `question` | text | Cắt tối đa 2000 ký tự |

RLS: học sinh đọc/ghi của mình; super_admin đọc tất cả; campus_admin/academic_staff đọc trong subtree. API `/api/chat/tutor` và `/api/ai/copilot` (taskType=tutor) ghi log fire-and-forget bằng Service Role — lỗi log không ảnh hưởng luồng chat.

### Trang 360° và action `getStudent360(studentId)`
- **Chốt 403**: lấy `org_id` của học sinh → `is_authorized(viewer, org, 'academic_staff')` — học sinh ngoài cây org của viewer bị trả `403 Unauthorized` trước khi đọc bất kỳ dữ liệu nào (RLS là lớp chặn thứ 2).
- Gom song song: profile + tags từ `custom_metadata` (gắn label qua `org_custom_fields`), lớp đang học (`enrollments` join thủ công classes/subjects/teachers), Radar điểm TB theo môn (`grades`→`assessments`→class→subject), Pie chuyên cần (`attendance`), hóa đơn + đã thu (`invoices`+`payments`), timeline (nhập học, ghi danh, cảnh báo `student_warnings`, phát hành hóa đơn), lịch sử AI chats + top chủ đề hay hỏi.
- UI 4 tabs: Tổng quan (stat cards) / Học tập (Radar + Pie Recharts) / Tài chính (bảng hóa đơn + nút In biên lai mở cửa sổ print + Bar chart công nợ) / Lịch sử tương tác (timeline + lịch sử hỏi AI cho cố vấn học tập).

## Khảo sát Giáo viên ẨN DANH (migration 022)

3 bảng — nguyên tắc: **không tồn tại khóa nào JOIN được kết quả về danh tính học sinh**.

| Bảng | Vai trò | Điểm mấu chốt |
|---|---|---|
| `evaluation_campaigns` | Đợt khảo sát | `org_id`, `start_date`/`end_date` (check hợp lệ), `status` active/closed |
| `evaluation_tokens` | Mã dùng-1-lần chống spam | `token` unique (8 ký tự bỏ 0/O/1/I), `is_used`, **unique (campaign, class, student)** = mỗi học sinh 1 mã; biết AI được đánh giá nhưng KHÔNG chứa nội dung |
| `evaluation_results` | Kết quả ẨN DANH | **TUYỆT ĐỐI KHÔNG có student_id**; `rating_teaching`/`rating_attitude`/`rating_punctuality` (check 1-5), `feedback_text` |

**RLS**: tokens — học sinh chỉ SELECT mã của mình, admin SELECT trong subtree, KHÔNG ai insert/update qua client. results — campus_admin SELECT trong subtree, teacher chỉ SELECT dòng `teacher_id = mình` (không UPDATE/DELETE); **không có policy INSERT** → chỉ Service Role ghi được.

**Server Actions**:
- `generateEvaluationTokens(campaignId, classId)` (`src/lib/actions/evaluations.ts`): campus_admin phát mã cho toàn bộ học sinh ghi danh (idempotent — đã có mã thì trả lại mã cũ).
- `submitEvaluation(token, evaluationData)` (`src/app/api/evaluations/actions.ts`): 3 lớp chống spam — (1) phải đăng nhập + token đúng của mình, (2) CLAIM token nguyên tử (`update ... where is_used=false`, 2 request đua chỉ 1 thắng), (3) đợt phải active + trong khung ngày. **[AI FILTER]**: `feedback_text` đi qua gpt-4o-mini (`generateObject` → `{isToxic, cleanText}`) để lọc ngôn từ chửi bới/xúc phạm trước khi lưu; AI lỗi thì giữ nguyên văn bản gốc (không chặn luồng). Insert kết quả bằng Service Role không kèm student_id; bước sau lỗi thì trả token lại (không đốt mã oan).

**Form public + phân phối mã**:
- `/evaluations/[token]` (NGOÀI dashboard, ngoài matcher middleware → không cần đăng nhập): server component verify token bằng Admin client, chỉ trả Tên GV + Tên lớp (không lộ tên học sinh); client form chấm 3 tiêu chí bằng sao (1-5) + textarea góp ý. `submitEvaluation` KHÔNG bắt đăng nhập cho luồng này — token là "chìa khóa" bí mật dùng 1 lần.
- `/academic/campaigns` + `/academic/campaigns/[id]`: campus_admin tạo đợt khảo sát, bấm "Sinh mã đánh giá cho Lớp X" (tái dùng `generateEvaluationTokens`), copy link `domain/evaluations/TOKEN` gửi Zalo hoặc copy tất cả.
- Cổng học sinh `/portal`: widget "Khảo sát đang chờ" — token chưa dùng của chính học sinh (RLS) thuộc đợt active, link thẳng vào form.

**Dashboard báo cáo (`/academic/evaluations`, actions cùng thư mục)**:
- `getEvaluationReport(orgId)`: campus_admin+ (check `is_authorized`), AVG 3 tiêu chí theo giáo viên trong subtree.
- `summarizeTeacherFeedback(teacherId, orgId)`: **[AI TÓM TẮT]** gom tối đa 100 `feedback_text` mới nhất → gpt-4o-mini viết "Điểm mạnh / Cần cải thiện" (API key theo tenant qua `getAIConfig`, fallback env).
- (Yêu cầu gốc đặt tên file `012_anonymous_evaluations.sql` nhưng số 012 đã dùng nên migration mang số **022**.)

## Ngân hàng đề — `exam_bank` (migration 024)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid → organizations | Đề thuộc đơn vị nào |
| `subject_id` | uuid → subjects, nullable | Môn học (có thể chưa gắn) |
| `title` / `description` / `content` | text | `content` = nội dung đề hoặc link tài liệu |
| `grade_level` | text | VD "Lớp 12", "Ôn thi THPT" |
| `duration_minutes` | int > 0 | Thời lượng làm bài |
| `created_by` | uuid → profiles | |

**RLS**: staff/campus_admin toàn quyền trong subtree (`is_org_in_my_subtree`); teacher chỉ SELECT đề của org liên quan (`is_org_related` — dùng chung đề của cấp trên). Migration 024 cũng bổ sung policy `staff_select_teachers_in_subtree` trên `profiles` để academic_staff đọc được TÊN GIÁO VIÊN trong subtree (trước đó 005 chỉ cho xem học sinh → trang Thời khóa biểu/Lớp học của Staff bị RLS che tên GV).

UI: `/staff/exam-bank` (CRUD, soft delete, xem nhanh nội dung đề). Các trang Staff/Admin hoàn thiện cùng đợt: `/staff/timetable` (TKB tuần toàn cơ sở), `/staff/transcripts` (bảng điểm tổng chỉ đọc + xếp hạng, tái dùng `getGradebook`), `/staff/results-approval` (hàng đợi duyệt & chốt sổ, tái dùng actions Kỳ thi), `/admin/organizations` (cây tổ chức + tạo đơn vị — chỉ super_admin), `/admin/revenue` (doanh thu từ `payments`/`invoices` theo subtree).

## Smart Auth Routing

- **Login chung** `/login`: Email hoặc SĐT + Password → `signInWithPassword`. SĐT được resolve sang email Auth qua Server Action `resolveLoginEmail` (Admin client). Sau login, client đẩy user theo `getHomePathForRole(role)`.
- **Login phụ huynh OTP** dời sang `/parent/login` (không chiếm `/login`).
- **Middleware** (`src/middleware.ts`):
  - Public: `/login`, `/parent/login`, `/unauthorized`, `/evaluations/*`.
  - `/` hoặc `/login` khi đã có session → redirect theo role:
    - `super_admin` / `campus_admin` → `/admin`
    - `academic_staff` / `admission_staff` / `accountant` → `/staff`
    - `teacher` → `/teacher`
    - `student` → `/student`
  - Chưa đăng nhập vào khu vực bảo vệ → `/login`.
  - Sai role trên route có rule → `/unauthorized`.
- **Portals** (route group `(portals)`): `/admin`, `/staff`, `/teacher`, `/student` — trang Welcome + lối tắt vào module.
- **Layout Back-Office** (`PortalShell` — sidebar dọc thu gọn được, trạng thái lưu localStorage, drawer mobile):
  - `(portals)/admin/layout.tsx`: menu Tổng quan / Quản lý Cơ sở / Quản lý Nhân sự / Cài đặt Hệ thống / Báo cáo Doanh thu; header có `OrgTreeSelector`.
  - `(portals)/staff/layout.tsx`: nhóm Hành chính (Học viên, Lớp học, Thời khóa biểu, Điểm danh) + Khảo thí (Ngân hàng đề, Kỳ thi, Bảng điểm tổng, Xét duyệt kết quả); header là `MyOrgBadge` tĩnh (Staff không đổi cơ sở).
  - Menu chưa có module trỏ tới trang `ComingSoon` (`/admin/organizations`, `/admin/revenue`, `/staff/timetable`, `/staff/exam-bank`, `/staff/exams`, `/staff/transcripts`, `/staff/results-approval`).
  - Lưu ý: các route module cũ (`/staff/classes`, `/admin/settings`, `/students`…) vẫn dùng `DashboardShell` của nhóm `(dashboard)`.
- **Teacher Workspace** (`(portals)/teacher/layout.tsx` — TABLET-FIRST, Top Navigation thay vì sidebar):
  - Menu: Lịch dạy hôm nay (`/teacher`), Các lớp phụ trách (`/teacher/classes`), Chấm điểm (`/teacher/grading` → sổ điểm từng lớp), Trợ lý AI (`/teacher/assistant` — gọi copilot `taskType='lesson_plan'` streaming qua `useCompletion`).
  - Header có `QuickAttendanceButton`: nhảy thẳng tới điểm danh của buổi ĐANG diễn ra → buổi chưa điểm danh gần nhất → buổi sắp tới hôm nay → fallback lịch tuần.
  - Trang chủ `/teacher` (server component, action `getTeacherHome`): lịch hôm nay theo giờ VN (UTC+7), CẢNH BÁO ĐỎ buổi `status='scheduled'` đã quá `end_time` trong 7 ngày (chưa điểm danh), card thống kê tiết `completed` trong tháng (ước tính lương) + số lớp phụ trách. Chỉ lọc `teacher_id` (giáo viên dạy nhiều cơ sở), KHÔNG lọc org.
- **Student Workspace** (`(portals)/student/layout.tsx` — TUYỆT ĐỐI MOBILE-FIRST, khung 480px):
  - KHÔNG sidebar: Bottom Navigation Bar 5 icon — Trang chủ (`/student`), Lịch học (`/schedule`), Sổ điểm (`/grades`), Chat AI (`/assistant`), Cài đặt (`/student/settings` — thông tin tài khoản + đăng xuất).
  - Trang chủ `/student` (action `getStudentHome`, Admin client khóa cứng `student_id = auth.uid()`): (1) khối Cảnh báo LÊN ĐẦU — hóa đơn `pending/partial` (đỏ nếu quá `due_date`) + `student_warnings` chưa `resolved`; (2) "Bài học kế tiếp" countdown realtime (client component, buổi đang diễn ra hiện LIVE); (3) FAB "Hỏi Gia sư AI" nổi trên Bottom Nav → `/assistant`.
- Role `accountant` chỉ dùng cho điều hướng (chưa có trong CHECK constraint DB; sẽ bổ sung migration HR nếu cần).

## Phân quyền theo cấp bậc (Hierarchical RLS)

### `get_descendant_org_ids(p_org_id uuid) returns setof uuid`
Trả về ID của chính tổ chức đó và **TẤT CẢ** con/cháu, dùng `path <@` + index GiST.
`SECURITY DEFINER` để policy gọi được không vướng RLS.

### Policy `select_classes_in_org_subtree` trên `classes`
User chỉ SELECT được lớp có `org_id` nằm trong `get_descendant_org_ids(org_id của user trong profiles)`:
- Giám đốc Cụm (user gắn org `region`) → thấy lớp của mọi Cơ sở/Chi nhánh dưới quyền.
- Chi nhánh A → chỉ thấy lớp của A (B không nằm trong subtree của A).
- User chưa gắn `org_id` → không thấy gì.

## Ma trận RBAC (migration 005)

RLS bật trên `profiles`. Policy KHÔNG subquery trực tiếp `profiles` (gây đệ quy vô hạn) mà dùng
các helper `SECURITY DEFINER`: `get_my_role()`, `get_my_org_id()`, `is_org_in_my_subtree(org_id)`.

| Role | SELECT profiles | INSERT/UPDATE profiles |
|---|---|---|
| `super_admin` | Tất cả | Tất cả |
| `campus_admin` | Trong subtree org của mình | Trong subtree; KHÔNG được tạo/nâng role `super_admin`, không được đẩy nhân sự ra ngoài nhánh (`with check`) |
| `academic_staff` | Chính mình + HỌC SINH trong subtree | Không |
| `teacher` / `student` | Chỉ chính mình | Không |

### RPC `is_authorized(p_user_id, p_target_org_id, p_required_role) returns boolean`
Double-check quyền ở Backend (gọi trong mọi Server Action nhạy cảm):
1. Trọng số role: student(1) < teacher(2) < academic_staff(3) < campus_admin(4) < super_admin(5) — user phải ≥ `p_required_role`.
2. `super_admin` → true với mọi org; role khác → `p_target_org_id` phải nằm trong `get_descendant_org_ids(org của user)`.

## Extensions
- `uuid-ossp` — sinh UUID
- `ltree` — cột `path` + truy vấn cây
- `vector` (pgvector) — embedding + tìm kiếm vector
