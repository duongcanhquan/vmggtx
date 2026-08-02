# Design: Nhân sự HR — tách HV, vị trí/ngành-môn, lương, ngày công & phép

**Ngày:** 2026-08-02  
**Trạng thái:** Đang triển khai (code P0–P3; chờ chạy migration 067)  
**Phạm vi:** ADD-only (không phá `teacher_contracts` / `payrolls` / `teacher_requests` / điểm danh HV)  
**Hướng:** Module HR mỏng (đã chọn **1**)

---

## 1. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|--------|------------|
| D-HR1 | Phạm vi | Full **P0→P3**, triển khai theo pha sau khi duyệt spec + plan |
| D-HR2 | Quỹ phép năm | Cố định theo **cơ sở** (cấu hình Cài đặt / org_settings); trừ khi Admin duyệt đơn phép |
| D-HR3 | Duyệt nghỉ HR | Campus Admin (+ academic_staff nếu menu grant); **tách** khỏi xin nghỉ buổi dạy |
| D-HR4 | Xin nghỉ buổi dạy | Giữ `teacher_requests` + `/teacher/requests` + `/academic/requests` như hiện tại |
| D-HR5 | Ngày công | **Hybrid**: lịch chuẩn (T2–T6 mặc định) − lễ org − phép đã duyệt; Admin **override** từng ngày |
| D-HR6 | Lương | **Văn phòng** (hợp đồng cố định): lương × (ngày công thực / ngày công chuẩn tháng). **GV theo tiết**: giữ D07 — chỉ buổi `completed` + đã điểm danh |
| D-HR7 | Điểm danh dạy | **Siết quy trình hiện có** (không app chấm công mới): không tính lương tiết nếu chưa điểm danh; UI báo thiếu điểm danh trên kỳ lương |
| D-HR8 | Tài khoản nhân sự | `/campus-admin/users` **không** liệt kê / tạo / sửa role `student` — HV chỉ `/students` |
| D-HR9 | Chức danh vs ngành/môn | `job_titles` = mẫu menu (D23). Ngành/môn dạy = `teaching_major` + `teacher_subjects` trên hồ sơ GV — **không** nhét subject vào `job_titles` |
| D-HR10 | Kiến trúc | ADD bảng HR mới + menu; gộp/siết payroll engine; không rewrite từ đầu |

---

## 2. Hiện trạng (vấn đề)

- `/campus-admin/users` lấy mọi `profiles` → **học viên lẫn** danh sách nhân sự; form còn tạo được `student`.
- `job_titles` chỉ phân quyền menu; ngành/môn nằm `/teachers` — người dùng kỳ vọng “vị trí công việc” có ngành/môn.
- Lương: chỉ GV có HĐ; `rate_modifiers` chưa dùng; thiếu UI `draft → approved → paid`; hai path tính lương.
- Không có quỹ phép / bảng công nhân viên; chỉ có nghỉ buổi dạy + ticket chung + điểm danh HV.

---

## 3. Kiến trúc theo pha

### P0 — Tách học viên khỏi nhân sự (không migration)

**File:** `campus-admin/users/actions.ts`, `page.tsx`, validation schemas (nếu cần).

- `listUsers`: mặc định `.neq('role', 'student')` (hoặc `.not('role', 'eq', 'student')`).
- Bỏ `student` khỏi `FILTER_ROLES` / `ASSIGNABLE_ROLE_OPTIONS` trên trang này.
- `createUser` / `updateUser`: từ chối `role === 'student'` với message trỏ sang `/students`.
- Copy UI: ghi chú “Quản lý học viên tại menu Học sinh”.
- Mock data: bỏ student khỏi mock staff list.

**Không đổi:** `/students`, capacity check khi tạo HV ở đúng chỗ.

---

### P1 — Vị trí công việc + ngành / môn giảng dạy

**Giữ D23:** `job_titles` = template `menu_keys` + `suggested_role`.

**UX:**

1. Trên `/campus-admin/users` khi role (hoặc `suggested_role` chức danh) = `teacher`:
   - Hiện block **Ngành giảng dạy** + **Môn được phép dạy** (reuse actions `/teachers` hoặc extract shared).
2. Link “Mở hồ sơ giảng viên đầy đủ” → `/teachers` (filter/id nếu có).
3. `/campus-admin/job-titles`: mô tả rõ chức danh ≠ ngành/môn; với preset Teacher ghi chú “gán ngành/môn trên hồ sơ GV”.

**Không làm P1:** catalog ngành riêng; FK `job_titles` → `subjects`.

---

### P2 — Lương hợp lý

**Giữ bảng:** `teacher_contracts`, `payrolls` (D07).

**ADD (migration mới, sau P3 schema nếu cần chung):**

- Mở rộng hợp đồng **hoặc** bảng `staff_salary_terms` (ADD) cho nhân sự **không dạy** (role academic_staff / admission / accountant / campus_admin tùy chọn):
  - `monthly_base` (lương tháng cố định)
  - `org_id`, `profile_id`, soft delete
- MVP: chỉ áp dụng khi có dòng salary term active; GV teaching vẫn qua `teacher_contracts`.

**Engine (`payrollService` — nguồn sự thật duy nhất):**

- Deprecate / thin-wrap path trùng `hr/payroll/actions.ts` → gọi cùng service.
- **GV (theo tiết):** hours từ `class_sessions` status=`completed` **và** có attendance (D07 + D-HR7). Kỳ lương hiện **danh sách buổi bị loại** vì thiếu điểm danh.
- **Văn phòng:**  
  `pay = monthly_base * (worked_days / standard_workdays)`  
  `worked_days` / `standard_workdays` lấy từ P3 bảng công tháng (nếu P3 chưa chạy: tạm = standard, flag “chưa có bảng công”).
- UI: `/finance/payroll` + panel HĐ — thêm nút **Duyệt** / **Đánh dấu đã chi** (`draft → approved → paid`); chỉ campus_admin + accountant.
- `rate_modifiers`: **phase sau** (ghi tồn đọng) — không bắt buộc MVP P2.

---

### P3 — Ngày công & phép

#### 3.1 Cấu hình org

Trong `org_settings.config` (D04) hoặc cột/json rõ ràng:

```json
{
  "hr": {
    "annual_leave_days": 12,
    "work_week": [1, 2, 3, 4, 5]
  }
}
```

- `work_week`: 0=CN … 6=T7; mặc định T2–T6.
- Ngày lễ: tái dùng `org_holidays` (057) — không đếm là ngày công chuẩn / không trừ phép.

#### 3.2 Bảng mới (soft delete + `org_id` + RLS)

**`hr_leave_balances`**

| Cột | Ý nghĩa |
|-----|---------|
| `org_id`, `profile_id`, `year` | UNIQUE (org, profile, year) |
| `entitled_days` | Copy từ cấu hình org khi khởi tạo năm (Admin có thể chỉnh tay từng người) |
| `used_days` | Tổng ngày phép đã duyệt trong năm |
| timestamps + `deleted_at` | |

**`hr_leave_requests`**

| Cột | Ý nghĩa |
|-----|---------|
| `org_id`, `profile_id` | Người xin |
| `leave_type` | `annual` \| `unpaid` \| `other` |
| `start_date`, `end_date` | Inclusive; tính `days_count` (chỉ ngày trong work_week, trừ lễ) |
| `reason` | text |
| `status` | `pending` \| `approved` \| `rejected` \| `cancelled` |
| `reviewed_by`, `reviewed_at`, `review_note` | |
| soft delete | |

Khi **approve** `annual`: tăng `used_days` (transaction); từ chối nếu vượt `entitled_days - used_days`.

**`hr_workday_overrides`**

| Cột | Ý nghĩa |
|-----|---------|
| `org_id`, `profile_id`, `work_date` | UNIQUE ngày |
| `status` | `present` \| `absent` \| `leave` \| `holiday` \| `remote` (MVP: present/absent/leave đủ) |
| `note` | |
| soft delete | |

**Tính bảng công tháng (view hoặc Server Action, không bắt buộc materialize MVP):**

```
standard_days = count(dates in month ∩ work_week) − org_holidays
auto_leave_days = approved leave overlapping month (annual+unpaid days on workdays)
worked_days = standard_days − absent overrides − leave days + present overrides…
```

Chi tiết công thức ghi trong plan; nguyên tắc: override thắng auto.

#### 3.3 UI & menu

- Menu **Nhân sự & Lương** thêm:
  - **Ngày công & Phép** → `/hr/attendance` (tabs: Bảng công tháng | Đơn nghỉ | Quỹ phép)
- Nhân viên (teacher + staff roles, không student): xin nghỉ tại `/hr/my-leave` **hoặc** tab trên portal GV/Staff (plan chọn 1 chỗ — khuyến nghị `/hr/my-leave` + link từ portal).
- Admin duyệt tại `/hr/attendance` tab Đơn nghỉ.
- Cài đặt số ngày phép: `/settings` section HR (campus_admin).

**menuKey mới:** `hr_leave` — defaultRoles: managers + academic_staff + accountant (xem/duyệt); teacher chỉ self-service path (ROUTE_RULES tách).

#### 3.4 Không làm trong MVP P3

- Máy chấm công / GPS / QR.
- Phép theo chức danh (đã từ chối — D-HR2 = theo org).
- Tự động trừ lương GV khi nghỉ phép ngày (GV vẫn theo tiết; nghỉ ngày có thể song song nghỉ buổi qua teacher_requests).
- Carry-over phép năm cũ.

---

## 4. Phân quyền & route

| Prefix | Roles |
|--------|--------|
| `/campus-admin/users` | super_admin, campus_admin (giữ) — data không còn student |
| `/hr/contracts`, `/finance/payroll` | giữ + accountant |
| `/hr/attendance` | campus_admin, academic_staff, accountant (+ super_admin) |
| `/hr/my-leave` | mọi staff role có session (teacher, academic_staff, …) — **không** student |

Đăng ký đủ 3 nơi: `menuRegistry` + `DashboardShell` + `ROUTE_RULES`.

---

## 5. Thứ tự triển khai (sau duyệt spec + plan)

1. **P0** (ngay) — tách HV  
2. **P1** — ngành/môn trên user teacher  
3. **P3** schema + UI phép/công (cần cho lương văn phòng)  
4. **P2** — gộp payroll + duyệt + lương văn phòng + siết thiếu điểm danh  

Migration dự kiến: `067_hr_leave_workdays.sql` (gồm leave + workday overrides + staff_salary_terms).

---

## 6. Kiểm thử chấp nhận (tóm tắt)

- [ ] Danh sách nhân sự không còn HV; không tạo được HV từ trang users.  
- [ ] Teacher trên users chỉnh được ngành/môn; job_titles không chứa subject.  
- [ ] Xin phép → duyệt → quỹ giảm; vượt quỹ bị chặn.  
- [ ] Bảng công tháng phản ánh lễ + phép + override.  
- [ ] Lương GV: buổi thiếu điểm danh không vào tổng; có báo cáo.  
- [ ] Lương văn phòng: công thức ngày công (khi có salary term).  
- [ ] `draft → approved → paid` trên UI.  
- [ ] `teacher_requests` nghỉ buổi dạy vẫn chạy độc lập.

---

## 7. Tồn đọng sau MVP

- `rate_modifiers` wiring  
- Phép theo chức danh / thâm niên  
- Carry-over phép  
- Đồng bộ nghỉ phép ngày ↔ hủy buổi dạy (gợi ý, không bắt buộc)  
- Chấm công thiết bị  

---

## 8. Quyết định sản phẩm (ghi DECISIONS sau khi duyệt)

- **D28** HR: users staff ≠ student; phép org-level; ngày công hybrid; lương văn phòng theo công / GV theo tiết+điểm danh; tách teacher_requests.
