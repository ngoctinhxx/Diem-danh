# Ứng dụng điểm danh sinh viên

Ứng dụng Node.js cho phép sinh viên điểm danh qua mã QR và giảng viên theo dõi, lọc, xóa lượt điểm danh hoặc xuất Excel. Dữ liệu được lưu tại `data/attendance.json` trên máy chủ chạy ứng dụng.

## Chạy ứng dụng

```bash
npm install
npm start
```

Mở `http://localhost:3000` trên máy chủ. Điện thoại quét QR cần cùng mạng Wi-Fi với máy chủ; vào trang quản lý để xem QR và liên kết phù hợp.

## Trang quản lý

Mở `/admin.html`. Tài khoản ban đầu là `admin`, mật khẩu `123456`. Có thể cấu hình thông tin đăng nhập bằng biến môi trường `ADMIN_USER` và `ADMIN_PASSWORD`. Đặt `SESSION_SECRET` thành giá trị riêng khi triển khai.

## Dữ liệu và quyền riêng tư

`data/attendance.json` và `data/settings.json` được tạo tự động khi chạy lần đầu. Hai tệp này không được đưa lên Git. Hãy sao lưu dữ liệu riêng nếu cần.
