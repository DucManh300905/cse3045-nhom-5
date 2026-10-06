# Frontend – MAK Food and Drink

React 18 + Vite + TypeScript + React Router.

## Chạy

```bash
cp .env.example .env      # VITE_API_URL trỏ tới backend (mặc định http://localhost:8080/api)
npm install
npm run dev               # http://localhost:5173
```

Backend cần chạy song song (`cd ../backend && npm run dev`) để đăng nhập / đăng ký.

## Luồng màn hình

| Đường dẫn | Màn hình |
|---|---|
| `/` | Trang chủ: logo + 3 lựa chọn (Khách hàng, Chủ quán, Quản trị viên) |
| `/menu` | Tìm món toàn hệ thống qua `GET /menu-items` (tìm không dấu, lọc loại món / quán / còn hàng, sắp xếp, "Xem thêm"), giỏ hàng |
| `/restaurants/:slug` | Trang quán: thông tin, giờ mở cửa hôm nay, phí giao, đơn tối thiểu, menu theo danh mục |
| `/login` | Đăng nhập / Tạo tài khoản khách hàng (email **hoặc** số điện thoại + tên + mật khẩu + xác nhận) |
| `/checkout` | Cần đăng nhập. Giao tận nơi (sổ địa chỉ hoặc nhập mới + lưu) hoặc tự đến lấy; tiền do server tính (`POST /orders/preview`); đặt `POST /orders` kèm `Idempotency-Key` |
| `/orders` | Cần đăng nhập. Đơn từ `GET /orders`, trạng thái tự cập nhật realtime (Socket.IO), hủy khi quán chưa nhận |
| `/account` | Cần đăng nhập. Sửa hồ sơ, đổi mật khẩu (lưu token mới), sổ địa chỉ (tối đa 5, 1 mặc định) |
| `/owner/login` | Đăng nhập / tạo tài khoản **chủ quán** |
| `/owner` | Hồ sơ quán: tạo quán, thông tin, ảnh, giờ mở cửa, giấy tờ, nộp duyệt, bật/tắt nhận đơn |
| `/owner/menu` | Thực đơn: danh mục (thêm, đổi tên, ẩn, sắp xếp, xóa), món (size, topping, giới hạn suất/ngày, ảnh, tạm hết, xóa) |
| `/owner/orders` | Nhận đơn realtime: tab Chờ nhận / Đang làm / Đã xong, âm báo (bấm "Bật âm báo" một lần), đếm ngược 5' trước khi đơn tự hủy, nhận / từ chối / chuyển bước / hủy kèm lý do |
| `/admin/login` | Đăng nhập quản trị (không tự đăng ký; tạo bằng `npm run seed:admin` trong `backend/`) |
| `/admin` | Danh sách hồ sơ quán theo trạng thái (mặc định "Chờ duyệt"), tìm kiếm, phân trang |
| `/admin/restaurants/:id` | Chi tiết hồ sơ: xem giấy tờ, duyệt / từ chối (kèm lý do) / khóa / mở khóa, hoa hồng, lịch sử thao tác |
| `/admin/audit-logs` | Nhật ký thao tác, lọc theo hành động |

- Món có size/topping mở hộp chọn (kiểm tra `minSelect`/`maxSelect`); món đơn giản thêm thẳng vào giỏ.
- Mỗi giỏ chỉ chứa món của **một quán** (BR-30): thêm món quán khác sẽ hỏi xóa giỏ cũ.
- Hết hạn token (401) hoặc tài khoản bị khóa (403 `ACCOUNT_BLOCKED`) → tự đăng xuất và báo lý do.
- Lỗi API hiển thị tiếng Việt theo `code` (`getErrorMessage` trong `api/client.ts`).

Bấm **Xác nhận đặt món** khi chưa đăng nhập sẽ chuyển sang `/login`, đăng nhập xong quay lại `/checkout`.

Dữ liệu demo: `cd ../backend && npm run seed:demo` (khách `khach@mak.com`, chủ quán `owner.quana@mak.com`; mật khẩu `Demo@123`).

## Cấu trúc

```
src/
├── api/          axios client (JWT, map lỗi theo code), auth, users (hồ sơ + sổ địa chỉ), menu (API public), orders, merchant (chủ quán), admin
├── components/   AppHeader, FoodCard, ItemOptionsModal, CartDrawer, CartLines, QtyStepper, UserMenu...
├── context/      Auth, Socket (realtime), Cart (1 quán / giỏ, size + topping), Toast
├── pages/        Landing, Menu, Restaurant, Auth, Checkout, Orders, Account, ComingSoon
│   ├── owner/    OwnerLayout, OwnerProfilePage, OwnerMenuPage, MenuItemEditor
│   └── admin/    AdminLayout, AdminRestaurantsPage, AdminRestaurantDetailPage, AdminAuditLogsPage
├── utils/        định dạng tiền VNĐ, regex email / SĐT, nhãn trạng thái / giấy tờ / nhật ký
└── styles.css
```

## Chưa làm

- Chuông thông báo lưu lại (API-7), đánh giá (API-8), voucher (API-5b), dashboard doanh thu + admin quản lý user / đơn / thống kê (API-9).
