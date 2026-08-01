# AUDIT REPORT 2026 — GDTX ERP Production-Ready Self-Healing

> Ngày: 2026-08-01  
> Phạm vi: Logic đa tầng · Null-safety UI · AI timeout · TypeScript · Zod · Build  
> Kết quả cuối: **`npm run build` THÀNH CÔNG** · **`tsc --noEmit` = 0 lỗi**

---

## 1. Số lượng file đã dọn / vá trong đợt này

| Hạng mục | Số file | Ghi chú |
|---|---:|---|
| Thêm AI timeout 30s (`AbortSignal.timeout`) | 6 | Tutor RAG, Copilot RAG, import normalize, toxic filter, AI summary, knowledge-base embed |
| Fix Zustand `currentOrgId = null` kẹt loading | 8 | warnings, contracts, leads, settings, settings/ai, campaigns, custom-fields, evaluations |
| Siết Zod feedback khảo sát → max 500 ký tự | 2 | `schemas.ts` + `EvaluationForm.tsx` |
| `.vercelignore` neo gốc (tránh loại `src/lib/supabase`) | 1 | Đã push riêng commit `9386a4e` trước đó |
| **Tổng file chạm trong đợt self-heal** | **~17** | Không tính các đợt vá trước đã commit |

Ngoài ra (đã xác nhận sẵn từ các đợt trước, không sửa lại):
- `src/**` **không còn** `console.log` (chỉ còn `console.error` hợp lệ).
- Mọi lời gọi AI đã có `try/catch` + fallback tiếng Việt.
- Phone VN regex `^0\d{9}$` đã có trong `src/lib/validation/schemas.ts`.

---

## 2. Lỗi Logic / Bảo mật đã xác nhận & vá

### 2.1 Vá MỚI trong đợt này

| Mức | Vấn đề | Fix |
|---|---|---|
| **TRUNG BÌNH** | 8 trang dashboard dùng `useOrgStore.currentOrgId`: khi org chưa load, `loadData` `return` sớm mà **không** `setLoading(false)` → UI kẹt skeleton mãi | Thêm `setLoading(false)` trước khi return |
| **THẤP** | AI gọi `embed`/`generateObject`/`generateText`/`embedMany` không có timeout → treo request khi OpenAI chậm | Thêm `abortSignal: AbortSignal.timeout(30_000)` — catch sẵn sẽ trả fallback "bảo trì/quá tải" |
| **THẤP** | Feedback khảo sát cho phép 1000 ký tự (yêu cầu audit: 500) | Siết Zod + `maxLength={500}` trên form |

### 2.2 Vá NGHIÊM TRỌNG từ các đợt trước (đã xác nhận còn hiệu lực trong code)

| Mức | Vấn đề | Trạng thái |
|---|---|---|
| **CRITICAL** | Parent Portal cookie `parent_session` thô + Admin client → giả mạo đọc hồ sơ HS | **ĐÃ VÁ**: HMAC-SHA256 + `timingSafeEqual` (`parent-portal/actions.ts`) |
| **CRITICAL** | `submitAttendance` / `createClass` ghi DB không `getUser()` | **ĐÃ VÁ**: có `auth.getUser()` + `is_authorized` |
| **CRITICAL** | Học viên tự ghi `score` vào `lms_submissions` qua API thẳng | **ĐÃ VÁ**: migration `026_lms_hardening.sql` |
| **HIGH** | API AI dùng `getSession()` + thiếu check ghi danh tutor | **ĐÃ VÁ**: `getUser()` + enrollment/teacher/staff gate |
| **HIGH** | N+1 `runMonthlyPayroll` | **ĐÃ VÁ**: `calculateTeacherPayrollBatch` + bulk upsert |
| **HIGH** | `.vercelignore` `supabase/` loại luôn `src/lib/supabase/` → Vercel Module not found | **ĐÃ VÁ**: neo `/supabase/` (commit `9386a4e`) |

### 2.3 Multi-tier leakage (portals / api / LMS)

Quét `createAdminClient` trong `src/app`:
- **LMS quiz** (`learn/actions.ts`): Admin client chỉ đọc/ghi theo `quiz_id + student_id = user.id` sau khi xác thực ghi danh → OK.
- **Student home** (`portals/student/actions.ts`): mọi query `.eq('student_id'/'id', user.id)` → OK.
- **AI chat log**: insert fire-and-forget với `org_id` lấy từ lớp đã authorize → OK.
- **Evaluations / campaigns / campus-admin users**: Admin client sau cửa auth + org subtree → OK.
- Session-client queries dựa RLS + `getUser()` / `authorizeClass` / `is_enrolled_in_class` → chấp nhận được (RLS là lớp chặn cuối).

**Không phát hiện query Admin client toàn cầu không scope trong portals/api/LMS.**

---

## 3. TypeScript & Zod

| Hạng mục | Kết quả |
|---|---|
| `npx tsc --noEmit` | **exit 0** (0 lỗi) |
| `supabase gen types --local` | **BỎ QUA** — máy không chạy Supabase local/Docker; type `src/types/supabase.ts` đã đồng bộ tay theo migrations 001–026. Gen lại khi có CLI + project ref. |
| Zod phone VN | Có (`^0\d{9}$`) |
| Zod feedback khảo sát | **500 ký tự** (vừa siết) |
| Form chính (login, students, contracts, CRM, LMS, evaluations…) | Đều có Zod schema phía server action |

---

## 4. Trạng thái Build cuối cùng

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (55/55)
npm run build → EXIT 0
```

55 routes Next.js 14 App Router, Middleware 84.2 kB, First Load JS shared ~87.8 kB.

---

## 5. Việc vận hành — TRẠNG THÁI CẬP NHẬT (2026-08-01, đợt tổng rà soát)

1. ~~Chạy SQL `026_lms_hardening.sql`~~ → **ĐÃ XONG**: `node scripts/check-db.mjs` (đã mở rộng dò đủ 001 → 041 + 999) xác nhận **DATABASE ĐẦY ĐỦ, không thiếu migration nào**.
2. ~~Seed dữ liệu~~ → **ĐÃ XONG**: DB có 69 profiles, 7 organizations, 5 classes, 50 enrollments, 40 invoices, 15 lms_lessons.
3. ~~Smoke RLS~~ → **ĐÃ XONG**: `node scripts/smoke-lms.mjs` PASS 11/11 (học viên không đọc được đáp án, không tự chấm điểm, cách ly dữ liệu giữa cơ sở).
4. **Vercel env** (còn lại, tự kiểm tra trên Vercel Dashboard): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (hoặc ANON), `SUPABASE_SECRET_KEY` (hoặc SERVICE_ROLE); tùy chọn `OPENAI_API_KEY` (local đang thiếu — AI fallback "bảo trì"), `R2_*`, `N8N_WEBHOOK_URL`, `PARENT_SESSION_SECRET`, `CRON_SECRET` (cron nhắc học phí).
5. **R2 CORS** nếu bật upload file LMS (xem `VERCEL_DEPLOYMENT_CHECKLIST.md`).

Bổ sung đợt này: cấu hình ESLint chính thức (`.eslintrc.json` + `eslint-config-next`) — `npm run lint` sạch 0 lỗi 0 cảnh báo.

---

## 6. Kết luận

Hệ thống đạt trạng thái **Production-Ready về code**: build xanh, type sạch, AI có timeout + fallback, Zustand không kẹt loading, các lỗ hổng đa tầng/auth nghiêm trọng đã được vá và xác nhận còn trong codebase. Rủi ro còn lại nằm ở **vận hành** (chạy migration 026, seed, điền env Vercel/R2) — không phải lỗi code.
