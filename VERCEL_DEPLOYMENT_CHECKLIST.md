# VERCEL DEPLOYMENT CHECKLIST — GDTX ERP

> Cập nhật sau Final Audit. Làm theo THỨ TỰ từ trên xuống.

## 1. Biến môi trường (Vercel → Project → Settings → Environment Variables)

### Bắt buộc (thiếu là app KHÔNG chạy)

| Biến | Môi trường | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | URL project Supabase (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` **hoặc** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production + Preview | Key công khai — hệ key CŨ (anon) hoặc MỚI (`sb_publishable_...`). Code nhận cả 2 |
| `SUPABASE_SERVICE_ROLE_KEY` **hoặc** `SUPABASE_SECRET_KEY` | Production + Preview | **TUYỆT MẬT** — Admin Client (hệ cũ service_role hoặc hệ mới `sb_secret_...`). KHÔNG có prefix `NEXT_PUBLIC_` |
| `OPENAI_API_KEY` | Production + Preview | Key AI mặc định (fallback khi org chưa cấu hình key riêng trong `org_ai_settings`): Chat Tutor, RAG embedding, lọc feedback độc hại, AI summary, Data Gatekeeper |

### Tùy chọn (bật thêm tính năng)

| Biến | Ghi chú |
|---|---|
| `N8N_WEBHOOK_URL` | Webhook n8n gửi SMS/Zalo thông báo vắng học & cảnh báo học vụ. Không có → hệ thống bỏ qua thông báo, KHÔNG lỗi |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Fallback khi org chọn provider `google` (Gemini) mà không nhập key riêng |
| `ANTHROPIC_API_KEY` | Fallback khi org chọn provider `anthropic` (Claude) mà không nhập key riêng |
| `PARENT_SESSION_SECRET` | **Bắt buộc trên Production** — secret ký HMAC cookie Parent Portal (chuỗi ngẫu nhiên 32+ ký tự). Thiếu → cổng phụ huynh lỗi |
| `PARENT_MOCK_OTP` | **Bắt buộc trên Production** — mã OTP demo cố định (VD `123456`). Thiếu → từ chối đăng nhập phụ huynh. Dev mặc định `123456` |
| `R2_ACCOUNT_ID` | Cloudflare Dashboard → góc phải → Account ID. Cần cho **lưu trữ file LMS** (bài giảng, bài nộp) |
| `R2_ACCESS_KEY_ID` | Cloudflare → R2 → Manage R2 API Tokens → Create API Token (quyền Object Read & Write) |
| `R2_SECRET_ACCESS_KEY` | Secret của API Token trên (chỉ hiện 1 lần khi tạo) |
| `R2_BUCKET_NAME` | Tên bucket R2 (VD: `gdtx-erp`). Tạo tại Cloudflare → R2 → Create bucket |
| `CRON_SECRET` | Secret bảo vệ cron `/api/cron/tuition-reminders` (nhắc học phí tự động 1h sáng, xem `vercel.json`). Vercel tự gắn `Authorization: Bearer <CRON_SECRET>` khi gọi cron. Không đặt → cron trả 401, KHÔNG lỗi app |

> **Cấu hình R2 (5 phút)**: 1) Tạo bucket → 2) Tạo API Token → 3) Điền 4 biến trên vào `.env`/Vercel → 4) Vào R2 bucket → Settings → CORS policy, thêm:
>
> ```json
> [{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["*"] }]
> ```
>
> (production nên thay `*` bằng domain thật). Thiếu R2 → LMS vẫn chạy (bài giảng văn bản, video link, quiz) nhưng không upload được file.

## 2. Supabase (làm TRƯỚC khi deploy)

- [ ] Chạy đủ migrations theo thứ tự `supabase/migrations/001 → 045`, rồi `999_final_rls_patch.sql` và `999_performance_indexes.sql` (qua `supabase db push` hoặc SQL Editor). `025_lms.sql` = module LMS Online; `026_lms_hardening.sql` = vá constraint role (admission_staff) + gia cố RLS bài nộp; `027_attendance_notes.sql` = sổ đầu bài điện tử (nhận xét buổi học + dặn dò phụ huynh); `028_student_codes.sql` = mã học viên theo quy tắc của từng cơ sở; `029_teacher_requests.sql` = đơn từ giáo viên (đề xuất lịch / xin nghỉ — giáo vụ duyệt kèm phản hồi); `030_operations.sql` = thông báo chung + vòng đời ghi danh (bảo lưu/chuyển lớp/thôi học) + sĩ số lớp tối đa; `031_exam_ops.sql` = điều phối lịch (dạy thay/dạy bù) + lịch thi & giám thị (exam_schedules/exam_proctors) + phúc khảo điểm (grades.review_status); `032_ticketing_workflows.sql` = cổng dịch vụ E-Ticketing (ticket_categories với form_schema động, tickets, ticket_approvals) + seed 3 mẫu đơn mặc định cho mỗi cơ sở; `033_diary_facilities.sql` = sổ đầu bài điện tử (class_sessions.diary_notes) + đặt phòng/thiết bị (facilities, facility_bookings, check_facility_conflict, exclusion constraint chống double-booking); `034_user_preferences.sql` = cá nhân hóa giao diện từng user (user_preferences: dashboard_layout/table_views/theme_settings) + global_layout_templates (QTV áp layout theo role, is_forced khóa tự sửa); `035_dual_track_profiles.sql` = hồ sơ đào tạo kép GDNN-GDTX (profiles."MaSV", vocational_records, academic_records); `036_assessment_workflows.sql` = khảo thí chuyên sâu (exam_variants mã đề, re_examination_requests thi lại/phúc khảo); `037_b2b_portal.sql` = cổng doanh nghiệp liên kết (enterprises, internships, role enterprise_partner, đồng bộ practice_score); `038_behavioral_tracking.sql` = ghi nhận hành vi (behavior_logs) + auto ticket cảnh báo tâm lý; `039_lms_progress.sql` = tiến độ học bài giảng (lms_lesson_progress); `040_notifications.sql` = thông báo cá nhân + nhắc học phí (user_notifications, check_schedule_conflict bỏ qua buổi hủy); `041_assets.sql` = sổ tài sản & khấu hao (assets, asset_logs).
- [ ] Lưu ý các migration mới nhất: `042`…`045` (slug /coso); `049_user_grants.sql` = quyền kiêm nhiệm; **`050_parent_accounts.sql` = phụ huynh email+mật khẩu** (bắt buộc nếu dùng cổng Gia đình → Phụ huynh); **`051_org_logo.sql` = logo thương hiệu theo org** (cổng login + shell); **`052_crm_admissions_pro.sql` = CRM tuyển sinh**; **`053_crm_lead_profile_ai.sql` = hồ sơ lead đầy đủ (CCCD/PH/sở thích) + cấu hình AI CRM + entity lead**. Tùy chọn: `R2_PUBLIC_BASE_URL` nếu dùng CDN công khai cho logo.
- [ ] Sau khi seed, chạy `node scripts/smoke-lms.mjs` để test RLS LMS bằng tài khoản thật (học viên không đọc được đáp án, không tự chấm điểm được...).
- [ ] Kiểm tra nhanh database đã đủ bảng/hàm chưa: điền `.env` thật rồi chạy `node scripts/check-db.mjs` — script liệt kê chính xác migration nào còn thiếu.
- [ ] **QUAN TRỌNG**: `999_final_rls_patch.sql` bật RLS cho `organizations`, `class_sessions`, `attendance`, `subjects` và thêm policy GHI cho `classes` — bắt buộc cho production đa tầng.
- [ ] Bật Custom Access Token Hook (migration 006) trong Dashboard → Authentication → Hooks để JWT chứa `role`/`org_id`.
- [ ] (Demo) Chạy seed: `npx tsx scripts/seed.ts` với `.env` chứa `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Cấu hình Vercel

- [ ] Framework preset: **Next.js** (repo dùng Next 14 App Router).
- [ ] Node.js version: 18+.
- [ ] Không cần build command tùy biến: `npm run build`.
- [ ] `.vercelignore` đã loại `docs/`, `scripts/`, `supabase/`, `design-system/` khỏi upload.

## 4. Smoke test sau deploy

- [ ] `/login` đăng nhập được bằng email + phone (resolve qua Server Action).
- [ ] Đăng nhập từng role → middleware đẩy đúng portal: super_admin/campus_admin → `/admin`, academic_staff → `/staff`, teacher → `/teacher`, student → `/student`.
- [ ] Vào chéo role (student mở `/admin`) → bị đẩy về `/unauthorized`.
- [ ] Giáo viên điểm danh 1 buổi → session chuyển `completed` (nền tảng tính lương).
- [ ] Nhập điểm quá `grading_deadline` → báo "Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí."
- [ ] Chat Tutor trả lời dựa trên tài liệu của đúng org (RAG isolation).
- [ ] Link đánh giá ẩn danh `/evaluations/[token]` mở được KHÔNG cần đăng nhập.

## 5. Lưu ý bảo mật

- `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại server-side; tuyệt đối không log, không trả về client.
- API key AI của từng org lưu trong `org_ai_settings` (RLS bảo vệ); key trong env chỉ là fallback.
- Các bảng tài chính có masking qua `vw_teacher_contracts_secure` + `profiles.can_view_financials`.
