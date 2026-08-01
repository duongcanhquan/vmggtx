# TÀI KHOẢN DEMO — EDU SYSTEM

> Sinh bởi `npm run seed`. **Mật khẩu chung: `Demo@123456`**
>
> Cần đã chạy migration **045_org_slugs.sql** để có cổng `/coso/{slug}`.

## Cách đăng nhập (quan trọng)

| Ai | URL |
|---|---|
| **Super Admin** (toàn hệ thống) | `/login` |
| **Quản lý / GV / nhân sự từng cơ sở** | `/coso` → chọn cơ sở → Đăng nhập |
| **Học viên** | `/coso/{slug}/student/login` |
| **Phụ huynh** | `/coso/{slug}/parent/login` |

Ví dụ domain `edusystem.com`:

- Super Admin: `https://edusystem.com/login`
- Cơ sở Cầu Giấy: `https://edusystem.com/coso/cau-giay` (có 3 nút login)

## Cây tổ chức demo + slug

```
Tổng Công ty GDTX (Demo)                 <- superadmin  → /login
├── Cụm Miền Bắc (Demo)
│   ├── Cơ sở Hà Nội - Cầu Giấy   (slug: cau-giay)  → /coso/cau-giay
│   └── Cơ sở Hà Nội - Hà Đông    (slug: ha-dong)   → /coso/ha-dong
└── Cụm Miền Nam (Demo)
    ├── Cơ sở TP.HCM - Quận 1     (slug: quan-1)    → /coso/quan-1
    └── Cơ sở TP.HCM - Thủ Đức    (slug: thu-duc)   → /coso/thu-duc
```

## Email hay dùng

| Vai trò | Email | Cổng |
|---|---|---|
| Super Admin | `superadmin@gdtx-demo.edu.vn` | `/login` |
| Admin Cầu Giấy | `admin.cs1@gdtx-demo.edu.vn` | `/coso/cau-giay/login` |
| Admin Hà Đông | `admin.cs2@gdtx-demo.edu.vn` | `/coso/ha-dong/login` |
| Admin Q.1 | `admin.cs3@gdtx-demo.edu.vn` | `/coso/quan-1/login` |
| Admin Thủ Đức | `admin.cs4@gdtx-demo.edu.vn` | `/coso/thu-duc/login` |
| Giáo vụ Cầu Giấy | `staff1.cs1@gdtx-demo.edu.vn` | `/coso/cau-giay/login` |
| Giáo viên | `teacher1.cs1@gdtx-demo.edu.vn` | `/coso/cau-giay/login` |
| Học sinh | `student01.cs1@gdtx-demo.edu.vn` | `/coso/cau-giay/student/login` |

Tổng 69 tài khoản (pattern `*.cs1` … `*.cs4` theo cơ sở). Chi tiết số lượng xem lịch sử seed.

## Nếu không đăng nhập được

1. **Sai mật khẩu / không có user** → DB chưa seed. Chạy:
   ```bash
   # .env có NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY thật
   npm run seed
   ```
2. **/coso trống hoặc 404 slug** → chạy `045_org_slugs.sql` trong Supabase SQL Editor, rồi seed lại (hoặc sửa slug tay trong Quản lý Cơ sở).
3. **Vercel thiếu `SUPABASE_SERVICE_ROLE_KEY`** → đăng nhập email vẫn được, nhưng một số bước (SĐT, đọc role) lỗi. Thêm key trên Vercel Dashboard.
4. **JWT hook 006 chưa bật** → vẫn login được (code đã fallback đọc `profiles`); nên bật hook để nhanh hơn.

## Cách chạy seed

```bash
# 1. .env thật (không placeholder)
# 2. Migrations 001→045 + 999 đã chạy
npm run seed
```

Script **idempotent**: chạy lại sẽ xóa dữ liệu demo cũ (`@gdtx-demo.edu.vn`) rồi nạp mới. Dữ liệu thật không bị đụng.
