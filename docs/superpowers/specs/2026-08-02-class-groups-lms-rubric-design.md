# Design: Lớp hành chính + học phần, hồ sơ GV (ngành/môn), Rubric LMS

**Ngày:** 2026-08-02  
**Trạng thái:** Chờ duyệt spec  
**Phạm vi:** ADD-only (không rename MaSV / không phá `class_id` đang neo vận hành)

---

## 1. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|--------|------------|
| D-CG1 | Mô hình lớp | Hai tầng: **cohort** (hành chính) + **section/học phần** |
| D-CG2 | Migration | `classes` = **học phần**; ADD `class_groups` + `classes.group_id` nullable |
| D-CG3 | Hồ sơ GV | **Ngành** + **danh sách môn** (`teacher_subjects`) |
| D-CG4 | UI lớp | Hiện **tên cơ sở · môn · tên GV** — không hiện UUID |
| D-RB1 | Rubric gắn đâu | LMS bài tập — chấm `lms_submissions` split-screen |
| D-RB2 | Nguồn rubric MVP | GV tạo/chọn rubric **trên từng assignment** |
| D-RB3 | Persistence | Bảng rubric riêng + draft auto-save; `score`/`feedback` khi chốt |

---

## 2. Kiến trúc dữ liệu

### 2.1 Lớp hành chính + học phần

```
organizations
    └── class_groups (cohort)          ← sĩ số hành chính, chủ nhiệm, org
            └── classes (học phần)     ← 1 subject, group_id?, teacher_id (lead legacy)
                    ├── class_teachers (nhiều GV + role)
                    ├── enrollments    (roster học phần — giữ nguyên)
                    ├── class_sessions / attendance / grades / LMS
                    └── …
```

**`class_groups` (mới)**

| Cột | Ý nghĩa |
|-----|---------|
| `id`, `org_id` | Tenant |
| `name` | VD: "Lớp 10A — NH 2026" |
| `homeroom_teacher_id` | Chủ nhiệm (nullable) |
| `max_students` | Sĩ số hành chính (nullable) |
| `start_date`, `end_date` | Kỳ cohort |
| `created_at`, `updated_at`, `deleted_at` | Soft delete |

**`classes` (giữ + ADD)**

- Giữ: `org_id`, `name`, `subject_id`, `teacher_id` (lead / tương thích cũ), dates, soft delete.
- ADD: `group_id uuid null references class_groups(id)`.
- `group_id IS NULL` = học phần độc lập (dữ liệu cũ / lớp ngoài cohort) — **hợp lệ**.

**`class_teachers` (mới)**

| Cột | Ý nghĩa |
|-----|---------|
| `class_id`, `teacher_id` | UNIQUE cặp |
| `role` | `lead` \| `co` \| `grader` |
| `org_id` | RLS |
| soft delete timestamps | |

- Đồng bộ: khi set `classes.teacher_id` → upsert `class_teachers` role=`lead` (trigger hoặc Server Action).
- Quyền điểm danh / sổ điểm / LMS: GV có dòng active trên `class_teachers` **hoặc** `classes.teacher_id` / `substitute_teacher_id` buổi.

**Roster**

- MVP: copy HV từ `class_group_members` → `enrollments` của từng học phần (action “Đồng bộ sĩ số”).
- Bảng `class_group_members` (group_id, student_id, org_id, soft delete) — nguồn sự thật hành chính.

**Không làm trong MVP**

- Tự động enroll mọi học phần khi thêm HV vào cohort (có thể phase 2).
- Đổi nghĩa `enrollments.class_id` sang cohort.

### 2.2 Hồ sơ giáo viên

**ADD trên `profiles` (role=teacher):**

- `teaching_major text null` — ngành (text tự do MVP; catalog sau nếu cần).

**`teacher_subjects` (mới)**

- `(teacher_id, subject_id)` UNIQUE, `org_id`, soft delete.
- UI `/teachers`: sửa ngành + multi-select môn.
- Form gán học phần: filter / gợi ý GV theo `subject_id` khớp `teacher_subjects` (không chặn cứng nếu admin cố ý gán lệch — cảnh báo thôi).

### 2.3 Rubric LMS

**`lms_rubrics`**

- `assignment_id` UNIQUE (1 rubric / assignment MVP), `org_id`, `title`, `max_score` (đồng bộ với assignment.max_score hoặc clamp), soft delete.

**`lms_rubric_criteria`**

- `rubric_id`, `sort_order`, `name`, `description`, soft delete.

**`lms_rubric_levels`**

- `criterion_id`, `sort_order`, `label`, `points numeric`, soft delete.
- Rule: mỗi criterion chọn đúng 1 level khi chấm.

**`lms_submission_grades` (draft + final selections)**

- `submission_id` UNIQUE, `org_id`.
- `selections jsonb` — map `{ [criterionId]: levelId }`.
- `computed_score numeric`, `feedback text`.
- `status`: `draft` \| `final`.
- `updated_at`, `graded_by`.
- Khi `status=final`: cập nhật `lms_submissions.score`, `feedback`, `graded_by`, `graded_at` (giữ API cũ sync sổ điểm).

**Không đổi** cột `lms_submissions.score` / `feedback` — rubric là lớp bổ sung.

---

## 3. Chống trùng

| Loại | MVP | Cách |
|------|-----|------|
| GV trùng giờ | Có | Giữ `check_schedule_conflict(p_teacher_id, …)`; khi gán buổi kiểm tra mọi `class_teachers` được chỉ định dạy buổi |
| Phòng trùng | Có | Giữ `p_room` (+ `facility_id` nếu có) |
| HV trùng slot 2 học phần | Tuỳ chọn phase 2 | RPC mới so enrollments + sessions overlap |

Gán 2 GV `lead` cùng học phần: **cho phép** `co` nhiều; chỉ **1** `lead` (constraint partial unique hoặc enforce ở Action).

---

## 4. UI / UX

### 4.1 Quản lý lớp (`/classes`)

Cột: **Tên học phần | Cơ sở | Môn | GV phụ trách (tên + role) | Cohort (nếu có) | Ngày | Hành động**.  
Không bao giờ render raw `teacher_id`.

Thêm luồng:

- `/classes/groups` — CRUD cohort + thành viên + “Tạo học phần từ cohort”.
- Chi tiết học phần: tab GV (lead/co/grader), sync roster.

### 4.2 `/teachers`

- Cột/chip: ngành, môn dạy.
- Modal sửa: ngành + multi môn từ `subjects` active trong subtree.

### 4.3 Rubric chấm (`/teacher/lms/grade/[submissionId]`)

**Split-screen (desktop ≥1024):**

```
┌─────────────────────┬──────────────────────┐
│ Bài làm (scroll)    │ Rubric form (sticky) │
│ content + files     │ criteria → levels    │
│ prev/next HV        │ Tổng điểm realtime   │
│                     │ Nhận xét + trạng thái│
│                     │ Auto-save · Chốt điểm│
└─────────────────────┴──────────────────────┘
```

**Mobile:** stack — bài làm trên, rubric dưới; sticky thanh tổng điểm + “Chốt”.

**State (một store theo `submissionId`):**

```
{
  submission,          // read-only left
  rubric,              // criteria + levels
  selections,          // criterionId → levelId
  feedback,
  status,              // draft | final
  saveState,           // idle | saving | saved | offline | error
  totalScore           // derived Σ points(selected levels)
}
```

Đồng bộ hai pane: cùng `submissionId`; đổi HV = đổi URL + hydrate draft (local → server).

**Auto-save chống mất dữ liệu**

1. Mỗi thay đổi selection/feedback → update state + `totalScore`.
2. Debounce 2s → `saveRubricDraft` (server) + ghi `localStorage` key `rubric-draft:{submissionId}`.
3. Online lại / focus window → merge: ưu tiên bản `updated_at` mới hơn.
4. `beforeunload` nếu dirty chưa save.
5. **Chốt điểm**: validate đủ criterion → `finalizeRubricGrade` → `final` + sync `lms_submissions`.

List nộp bài LMS: nút “Chấm rubric” → route trên; giữ form điểm nhanh cũ (optional) cho bài không có rubric.

### 4.4 Design system

- Bento / semantic tokens GDTX (`design-system/gdtx-erp/MASTER.md`).
- Font Be Vietnam Pro + Inter; lucide-react; FunLoader + empty state tiếng Việt.

---

## 5. Phân quyền & RLS

- `class_groups` / members / `class_teachers` / `teacher_subjects`: staff subtree manage; teacher SELECT trong phạm vi được gán.
- Rubric tables: teacher của class (via `class_teachers` hoặc lead) CRUD draft/final; student không đọc selections (chỉ thấy score/feedback sau final nếu policy hiện tại cho phép).
- Menu: cohort dưới `classes`; không bắt buộc MenuKey mới nếu dùng chung `classes`.

---

## 6. Phased delivery

| Phase | Nội dung | Kết quả |
|-------|----------|---------|
| **P0** | Sửa list `/classes` join tên GV + môn + cơ sở | Hết UUID |
| **P1** | `profiles.teaching_major` + `teacher_subjects` + UI `/teachers` | Gán môn/ngành |
| **P2** | `class_groups` + `group_id` + members + sync roster + `class_teachers` | Hai tầng |
| **P3** | Rubric LMS tables + grade split-screen + autosave | Chấm rubric MVP |
| **P4** | Clash HV (optional) + thư viện rubric org (nâng từ D-RB2) | Sau |

---

## 7. Ngoài phạm vi (không làm trong spec này)

- Đổi `classes` thành cohort (đã loại — D-CG2).
- Rubric thư viện org (phase sau).
- Tách enrollment sang cohort-only.
- Viết lại toàn bộ LmsManager.

---

## 8. Tiêu chí chấp nhận (tóm tắt)

1. List lớp không còn UUID; có cơ sở + môn + tên GV.  
2. GV có ngành + ≥0 môn; lưu/load đúng org.  
3. Tạo cohort → tạo học phần `group_id` → sync HV → GV lead/co điểm danh/chấm trong phạm vi học phần.  
4. Assignment có rubric → mở split-screen → tick level → tổng điểm đúng → mất mạng vẫn còn draft local → chốt ghi `lms_submissions.score`.  
5. Build sạch; migrations 063+ chưa chạy DB thật → ghi STATE.

---

## 9. Self-review

- [x] Không placeholder TBD cho quyết định đã chốt  
- [x] Không mâu thuẫn: `classes` = học phần; cohort bảng mới  
- [x] ADD-only; giữ `score`/`feedback`  
- [x] Scope phases rõ; clash HV / org rubric library = sau  
