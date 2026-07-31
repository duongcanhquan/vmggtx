# VERCEL DEPLOYMENT CHECKLIST — GDTX ERP

> Cập nhật sau Final Audit. Làm theo THỨ TỰ từ trên xuống.

## 1. Biến môi trường (Vercel → Project → Settings → Environment Variables)

### Bắt buộc (thiếu là app KHÔNG chạy)

| Biến | Môi trường | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | URL project Supabase (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | Anon/public key — dùng cho client + middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview | **TUYỆT MẬT** — Admin Client (import học viên, chuyển đổi lead, evaluation ẩn danh, portal phụ huynh). KHÔNG có prefix `NEXT_PUBLIC_` |
| `OPENAI_API_KEY` | Production + Preview | Key AI mặc định (fallback khi org chưa cấu hình key riêng trong `org_ai_settings`): Chat Tutor, RAG embedding, lọc feedback độc hại, AI summary, Data Gatekeeper |

### Tùy chọn (bật thêm tính năng)

| Biến | Ghi chú |
|---|---|
| `N8N_WEBHOOK_URL` | Webhook n8n gửi SMS/Zalo thông báo vắng học & cảnh báo học vụ. Không có → hệ thống bỏ qua thông báo, KHÔNG lỗi |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Fallback khi org chọn provider `google` (Gemini) mà không nhập key riêng |
| `ANTHROPIC_API_KEY` | Fallback khi org chọn provider `anthropic` (Claude) mà không nhập key riêng |
| `PARENT_SESSION_SECRET` | Secret ký HMAC cookie Parent Portal (chuỗi ngẫu nhiên dài 32+ ký tự). Không đặt → fallback dùng `SUPABASE_SERVICE_ROLE_KEY` làm secret |

## 2. Supabase (làm TRƯỚC khi deploy)

- [ ] Chạy đủ migrations theo thứ tự `supabase/migrations/001 → 024`, rồi `999_final_rls_patch.sql` và `999_performance_indexes.sql` (qua `supabase db push` hoặc SQL Editor).
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
