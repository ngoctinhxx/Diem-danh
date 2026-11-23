# Ứng dụng điểm danh sinh viên

Ứng dụng Node.js cho phép sinh viên điểm danh qua mã QR và giảng viên theo dõi, lọc, xóa lượt điểm danh hoặc xuất Excel.

## Chạy cục bộ

```bash
npm install
npm start
```

Mở `http://localhost:3000/` để hiển thị mã QR; biểu mẫu nằm tại `http://localhost:3000/diemdanh`. Khi chạy cục bộ, dữ liệu được lưu trong thư mục `data/` dưới dạng JSON.

## Triển khai lên Vercel với MongoDB Atlas

Trên Vercel, ứng dụng dùng database `diem_danh` và collection `diem_danh` trên MongoDB Atlas. Collection và các chỉ mục chống điểm danh trùng được tạo tự động khi ứng dụng kết nối lần đầu.

Trong Vercel → **Project → Settings → Environment Variables**, thêm:

- `MONGODB_URI` = URI kết nối MongoDB Atlas
- `SESSION_SECRET` = chuỗi ngẫu nhiên dài, riêng cho ứng dụng
- (Tùy chọn) `MONGODB_DB` nếu muốn dùng tên database khác; mặc định `diem_danh`
- (Tùy chọn) `ADMIN_USER` và `ADMIN_PASSWORD` để đổi tài khoản quản lý mặc định

Giữ URI và thông tin xác thực trong biến môi trường, không commit vào Git hoặc đưa vào frontend. Sau khi lưu biến môi trường, redeploy Vercel.

## Trang quản lý

Mở `/admin.html`. Tài khoản mặc định là `admin`, mật khẩu `123456`; nên đổi bằng `ADMIN_USER` và `ADMIN_PASSWORD` khi triển khai.
