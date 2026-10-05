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
| `/menu` | Thực đơn: tìm kiếm (không dấu cũng được), lọc theo loại món / quán / còn hàng, sắp xếp, giỏ hàng |
| `/login` | Đăng nhập / Tạo tài khoản khách hàng (email **hoặc** số điện thoại + tên + mật khẩu + xác nhận) |
| `/checkout` | Cần đăng nhập. Xem lại đơn, nhập địa chỉ giao hàng, đặt món |
| `/orders` | Cần đăng nhập. Theo dõi các đơn đã đặt |
| `/owner`, `/admin` | Đang phát triển |

Bấm **Xác nhận đặt món** khi chưa đăng nhập sẽ chuyển sang `/login`, đăng nhập xong quay lại `/checkout`.

## Cấu trúc

```
src/
├── api/          axios client (tự gắn JWT) + authApi
├── components/   AppHeader, Logo, FoodCard, CartDrawer, QtyStepper, UserMenu...
├── context/      Auth, Cart, Order, Toast
├── data/menu.ts  Dữ liệu món ăn mẫu
├── pages/        Landing, Menu, Auth, Checkout, Orders, ComingSoon
├── utils/        định dạng tiền VNĐ, regex email / SĐT, bỏ dấu tiếng Việt
└── styles.css
```

## Còn dùng dữ liệu tạm

- Thực đơn lấy từ `src/data/menu.ts` → thay bằng API khi backend có module món ăn.
- Giỏ hàng và đơn hàng lưu bằng `localStorage` → thay bằng API khi backend có module đơn hàng.
