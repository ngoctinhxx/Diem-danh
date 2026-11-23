# Ứng dụng điểm danh sinh viên

Ứng dụng Node.js cho phép sinh viên điểm danh qua mã QR và giảng viên theo dõi, lọc, xóa lượt điểm danh hoặc xuất Excel.

## Chạy cục bộ

```bash
npm install
npm start
```

Mở `http://localhost:3000`. Dữ liệu lưu trong `data/attendance.json` và `data/settings.json`.

## Triển khai lên Vercel

Ứng dụng tự dùng Supabase làm cơ sở dữ liệu trên Vercel; không ghi dữ liệu vào hệ thống tệp chỉ đọc của Vercel Functions. Khi chạy cục bộ, ứng dụng tiếp tục dùng các tệp JSON.

1. Tạo một dự án Supabase và mở **SQL Editor**.
2. Chạy nội dung tệp [`supabase/schema.sql`](supabase/schema.sql) để tạo bảng và chỉ mục chống điểm danh trùng.
3. Trong **Project Settings → API**, lấy Project URL và `service_role` key. Không đưa key này vào mã nguồn hoặc frontend.
4. Trong Vercel, mở **Project → Settings → Environment Variables**, thêm:
   - `SUPABASE_URL` = Project URL của Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` = secret/service role key
   - `SESSION_SECRET` = chuỗi ngẫu nhiên dài, riêng cho ứng dụng
   - (Tùy chọn) `ADMIN_USER` và `ADMIN_PASSWORD` để đổi thông tin đăng nhập mặc định
5. Redeploy project trên Vercel.

Vercel liên kết với nhánh `main` và triển khai lại sau mỗi lần push. Không cần đặt Output Directory riêng cho ứng dụng Express.

## Trang quản lý

Mở `/admin.html`. Tài khoản mặc định là `admin`, mật khẩu `123456`; nên đổi bằng `ADMIN_USER` và `ADMIN_PASSWORD` trong môi trường triển khai.

## Dữ liệu

Thư mục `data/` không được đưa lên Git. Trên Vercel, các lượt điểm danh và cài đặt được lưu trong Supabase Postgres. Hãy giữ `SUPABASE_SERVICE_ROLE_KEY` ở biến môi trường server, không dùng trong trình duyệt.
