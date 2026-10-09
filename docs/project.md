# MAK Food and Drink — Tổng quan dự án

> Nền tảng đặt đồ ăn online cho các hàng ăn khu vực Hòa Lạc — Nhóm 5, CSE3045.
> Nguồn: `ke_hoach_backend_merchant.docx` (v1.0 – 06/10/2026), đã điều chỉnh theo code hiện có và Gantt MVP trong `HW3/`.
> Tài liệu liên quan: [database.md](database.md) · [API.md](API.md)
> **Cập nhật lần cuối: 06/10/2026** — sau Bước 6b (xem [mục 11 — Nhật ký tiến độ](#11-nhật-ký-tiến-độ-backend)).

Ký hiệu trạng thái: ✅ đã xong · 🟡 đang làm / làm một phần · ⬜ chưa làm · ⏭️ để sau MVP

---

## 1. Mục tiêu và phạm vi

- Kết nối **khách hàng** với **các quán ăn ở Hòa Lạc**: khách tìm món, đặt hàng, theo dõi đơn; quán quản lý cửa hàng, thực đơn, đơn hàng; quản trị viên duyệt quán và giám sát nền tảng.
- File docx tập trung vào **phân hệ Chủ nhà hàng (Merchant)**. Tài liệu này giữ toàn bộ nghiệp vụ của docx nhưng **chia lại phạm vi** cho phù hợp với nhóm 3 người và hạn MVP **02/11/2026**:
  - **MVP (đến 02/11/2026):** những gì cần để một đơn đi trọn vòng: khách đặt → quán nhận → giao → hoàn thành.
  - **Sau MVP:** nhân viên nhiều vai trò, ví/đối soát, quảng cáo, đơn hẹn giờ, in phiếu bếp…

---

## 2. Tech stack

Repo **đã chạy trên MongoDB/Express/React**, nên giữ stack hiện tại và thay từng thành phần nặng bằng phương án nhẹ hơn:

| Hạng mục | Docx gợi ý | Dự án dùng | Trạng thái |
|---|---|---|---|
| Backend | — | Node.js 20 + Express 5 (CommonJS) | ✅ |
| Database | PostgreSQL | **MongoDB + Mongoose 9** (transaction cần replica set — MongoDB Atlas có sẵn) | ✅ |
| Xác thực | JWT + refresh token | `jsonwebtoken` + `bcryptjs`, access token 1 ngày, kiểm tra lại user mỗi request; refresh token ⏭️ | ✅ / ⏭️ |
| Validate | — | `express-validator` (rule dùng chung ở `utils/validationRules.js`) | ✅ |
| Xử lý lỗi | — | `AppError` + `asyncHandler` + `errorHandler`, response có `code` | ✅ |
| Realtime | WebSocket/SSE + FCM | **Socket.IO** (`src/realtime/socket.js`) | ✅ |
| Job hẹn giờ (timeout đơn, reset suất) | Message queue | **node-cron** (quét định kỳ trong cùng process, `src/jobs/`) | ✅ |
| Lưu ảnh / giấy tờ | S3 + CDN | **`multer` + ổ đĩa** (`backend/uploads/public` và `private`); đổi sang Cloudinary khi deploy ⏭️ | ✅ / ⏭️ |
| Cache / khóa | Redis | Không dùng ở MVP — trừ tồn kho bằng update nguyên tử của MongoDB | ⏭️ |
| Tìm kiếm | Elasticsearch | Field `nameNoAccent` + regex (tìm không dấu) | ✅ |
| Thanh toán | VNPay/MoMo/ZaloPay | **COD** ở MVP; VNPay sandbox nếu còn thời gian | ⬜ / ⏭️ |
| Frontend | — | React 18 + Vite + TypeScript + React Router 6 + Axios | ✅ (menu đọc từ API; đơn hàng còn lưu tạm) |
| Test | — | **Jest + Supertest + mongodb-memory-server** (replica set trong RAM) — `cd backend && npm test` | ✅ |
| CI | CI/CD | GitHub Actions: job `test` (gốc) + job `backend-test` | ✅ (job gốc cần sửa — xem mục 10) |
| Tài liệu API | OpenAPI | `swagger-jsdoc` + `swagger-ui-express` tại `/api/docs` | ⬜ |

---

## 3. Architecture

### 3.1 Kiểu kiến trúc: Modular monolith

Một backend Express duy nhất, chia **module theo nghiệp vụ** (đúng hướng docx; khi có tải thật mới tách service). Mỗi module có `model / controller / routes`; route của từng đối tượng người dùng tách file riêng (`*.merchant.*`, `*.public.*`, `admin.*`).

```
frontend (React, Vite) ──HTTP/JSON──▶  backend (Express)  ──▶ MongoDB
        ▲                                 │
        └──────── Socket.IO (đơn mới, đổi trạng thái) ──┘   ✅
                                          ├──▶ ổ đĩa uploads/ (ảnh public, giấy tờ private) ✅
                                          └──▶ node-cron (timeout đơn, reset suất ngày) ✅
```

### 3.2 Cấu trúc thư mục backend (hiện tại)

```
backend/
├── src/
│   ├── app.js, server.js
│   ├── config/            database.js ✅, mongoose.js ✅ (plugin toJSON: id, ẩn password), storage.js ✅
│   ├── middlewares/       auth ✅, role ✅, validate ✅, error ✅, restaurant ✅, upload ✅ — rateLimit ✅ (idempotency xử lý trong order.service)
│   ├── modules/
│   │   ├── auth/          ✅ register, login, change-password
│   │   ├── user/          ✅ profile + sổ địa chỉ (address.controller.js)
│   │   ├── restaurant/    ✅ model, serializer, merchant (hồ sơ quán), public (khách xem quán + menu)
│   │   ├── menu/          ✅ danh mục, món (biến thể, topping), merchant + public, serializer
│   │   ├── audit/         ✅ auditLog.model.js + recordAudit()
│   │   ├── admin/         ✅ duyệt/khóa quán, hoa hồng, audit log, người dùng, đơn (chỉ đọc), đánh giá
│   │   ├── public.routes.js  ✅ /api/restaurants, /api/menu-items
│   │   ├── order/         ✅ đặt đơn, tính tiền, state machine (orderStateMachine.js), khách + merchant routes
│   │   ├── promotion/     ⬜ voucher của quán
│   │   ├── review/        ⬜ đánh giá + trả lời
│   │   ├── notification/  ✅ lưu thông báo + đẩy Socket.IO, chuông trên FE
│   │   └── report/        ✅ dashboard quán, thống kê admin (report.service.js)
│   ├── realtime/          ✅ socket.js (xác thực JWT, phòng user/restaurant/admin, emit sự kiện)
│   ├── jobs/              ✅ index.js: orderTimeout (mỗi phút), dailyStockReset (00:00 VN)
│   └── utils/             AppError, asyncHandler, validators, validationRules, pagination,
│                          text (bỏ dấu, slug), openingHours (giờ VN), seeAdmin, seedDemo,
│                          migrations/001-restaurant-status.js — ✅ · orderStateMachine ⬜
├── tests/                 ✅ setup/, helpers/, auth/, user/, restaurant/, admin/, menu/, public/, utils/
└── uploads/               (gitignore) public/ → /uploads, private/ → chỉ admin
```

### 3.3 Nguyên tắc kỹ thuật

1. **Response thống nhất** `{ success, message, code?, data }` — chi tiết ở [API.md](API.md#1-quy-ước-chung). ✅
2. **Không tin client về tiền**: server tự tính giá từ DB khi đặt đơn. ⬜ (áp dụng ở bước đặt đơn)
3. **State machine** cho đơn hàng nằm ở một file (`utils/orderStateMachine.js`) — mọi chỗ đổi trạng thái đều đi qua đây. ⬜
4. **Snapshot** tên/giá món vào đơn tại thời điểm đặt. ⬜
5. **Phân quyền 2 lớp**: theo role (`authorizeRoles`) + theo quyền sở hữu (`loadMyRestaurant`, mọi truy vấn merchant đều kèm `restaurant: req.restaurant._id`). Tài nguyên của quán khác trả **404** để không lộ sự tồn tại. ✅
6. Controller `throw new AppError(...)`, không `try/catch` lặp lại. ✅
7. **Chuyển trạng thái nguyên tử**: update kèm điều kiện trạng thái hiện tại (đã áp dụng cho duyệt quán; sẽ dùng cho đơn hàng). ✅
8. **Serializer tách theo người xem**: chủ quán / admin / public — API public chỉ trả field trong danh sách cho phép. ✅
9. Mỗi bước có test tự động; chỉ merge khi CI xanh. ✅

---

## 4. Roles

### 4.1 Vai trò trong MVP

| Role | Cách có tài khoản | Làm được gì | Trạng thái |
|---|---|---|---|
| **GUEST** (chưa đăng nhập) | — | Xem quán, xem menu, tìm kiếm, thêm vào giỏ (localStorage) | ✅ API xem quán/món |
| **CUSTOMER** | Tự đăng ký | Đặt đơn, hủy đơn khi chưa được nhận, theo dõi đơn, quản lý địa chỉ, đánh giá | 🟡 hồ sơ + địa chỉ xong; đơn/đánh giá ⬜ |
| **RESTAURANT_OWNER** | Tự đăng ký (chọn role) | Tạo & nộp hồ sơ quán, quản lý quán/menu/voucher, nhận & xử lý đơn, xem doanh thu, trả lời đánh giá | 🟡 hồ sơ quán + menu xong; đơn/voucher/báo cáo ⬜ |
| **ADMIN** | Chỉ tạo bằng `npm run seed:admin` | Duyệt/từ chối quán, khóa user/quán, xem thống kê toàn nền tảng | 🟡 duyệt/khóa quán + audit log xong; user/thống kê ⬜ |

Tài khoản demo (sau `npm run seed:demo`, mật khẩu `DEMO_PASSWORD`, mặc định `Demo@123`): `owner.quana@mak.com`, `owner.quanb@mak.com`, `owner.quanc@mak.com`, `khach@mak.com`.

### 4.2 Vai trò nhân viên quán (⏭️ sau MVP — giai đoạn "Vận hành" của docx)

Phân quyền **theo từng cửa hàng** (RBAC), lưu ở collection `storeStaff`, không phải `users.role`:

| Vai trò trong quán | Quyền |
|---|---|
| OWNER | Toàn quyền, thêm/xóa nhân viên |
| MANAGER | Quản lý menu, đơn, voucher; không xem tài chính |
| CASHIER / STAFF | Nhận/xử lý đơn, bật/tắt hết món |
| ACCOUNTANT | Xem doanh thu, sao kê |

### 4.3 Ma trận quyền (MVP)

| Chức năng | Guest | Customer | Owner | Admin | Trạng thái |
|---|:-:|:-:|:-:|:-:|---|
| Xem quán / menu | ✔ | ✔ | ✔ | ✔ | ✅ |
| Sổ địa chỉ | | ✔ | | | ✅ |
| Đặt đơn | | ✔ | | | ⬜ |
| Quản lý quán/menu **của mình** | | | ✔ | | ✅ |
| Xử lý đơn **của quán mình** | | | ✔ | | ⬜ |
| Duyệt / khóa quán, đổi hoa hồng | | | | ✔ | ✅ |
| Khóa tài khoản user | | | | ✔ | ⬜ |
| Xem mọi đơn | | | | ✔ (chỉ đọc) | ⬜ |

---

## 5. Features

Đánh số theo nhóm A–I của docx, cột **Phạm vi** cho biết có làm trong MVP không. "BE" = backend, "FE" = frontend.

### A. Tài khoản & Onboarding

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| A1 | Đăng ký bằng email **hoặc** SĐT, đăng nhập, JWT | MVP | ✅ |
| A2 | Xem / sửa hồ sơ cá nhân (chuẩn hóa SĐT, avatar) | MVP | ✅ |
| A3 | Sổ địa chỉ giao hàng của khách (tối đa 5, 1 mặc định) | MVP | ✅ BE · ✅ FE |
| A4 | Hồ sơ quán: DRAFT → SUBMITTED → APPROVED / REJECTED (kèm lý do, nộp lại) | MVP | ✅ BE · ✅ FE |
| A5 | Upload giấy tờ pháp lý (GPKD, ATTP, CCCD) — lưu private, chỉ admin xem | MVP | ✅ BE · ✅ FE |
| A6 | Xác thực OTP email/SĐT | ⏭️ | ⬜ |
| A7 | Nhiều chi nhánh / một chủ | ⏭️ (MVP: 1 chủ = 1 quán) | ⬜ |
| A8 | Nhân viên quán (RBAC) | ⏭️ | ⬜ |
| A9 | Đổi mật khẩu (vô hiệu token cũ) | MVP | ✅ BE · ✅ FE |
| A10 | Quên mật khẩu: mã 6 số qua Gmail → đặt mật khẩu mới (tài khoản đăng ký bằng email) | MVP | ✅ BE · ✅ FE |
| A10 | Refresh token, quên mật khẩu | ⏭️ | ⬜ |
| A11 | Tài khoản bị khóa mất quyền truy cập ngay (không chờ token hết hạn) | MVP | ✅ |

### B. Quản lý cửa hàng

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| B1 | Thông tin quán: tên, mô tả, địa chỉ, SĐT, slug | MVP | ✅ BE |
| B2 | Logo, ảnh bìa, loại ẩm thực, tọa độ | MVP | ✅ BE |
| B3 | Giờ mở cửa theo thứ trong tuần, nhiều ca/ngày | MVP | ✅ BE |
| B4 | Bật/tắt nhận đơn tức thời | MVP | ✅ BE |
| B5 | Đơn tối thiểu, bán kính giao (**không có phí giao** — quyết định 06/10) | MVP | ✅ |
| B6 | Thời gian chuẩn bị trung bình (ước tính ETA) | MVP | ✅ BE (lưu được; tính ETA ⬜) |
| B7 | Ngày nghỉ lễ, ca qua đêm, polygon vùng giao | ⏭️ | ⬜ |
| B8 | Màn hình chủ quán `/owner/*` | MVP | 🟡 FE (hồ sơ + thực đơn ✅, nhận đơn ⬜) |

### C. Thực đơn

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| C1 | Danh mục → Món (giá, ảnh, mô tả, thẻ cay/chay), sắp xếp danh mục | MVP | ✅ BE · ✅ FE |
| C2 | Biến thể (size S/M/L) | MVP | ✅ BE |
| C3 | Nhóm topping (bắt buộc/tùy chọn, min/max) | MVP | ✅ BE |
| C4 | Còn/hết hàng, giới hạn số suất/ngày | MVP | 🟡 BE (job reset 00:00 ⬜) |
| C5 | Khách xem menu quán, tìm món toàn hệ thống (không dấu) | MVP | ✅ BE · ✅ FE |
| C6 | Lịch sử thay đổi giá | MVP rút gọn: audit log `MENU_PRICE_CHANGE` | ✅ |
| C7 | Import/export CSV, menu theo khung giờ, duyệt món mới, sắp xếp món | ⏭️ | ⬜ |

### D. Đơn hàng (lõi)

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| D1 | Giỏ hàng (FE, 1 quán / giỏ) | MVP | ✅ (localStorage, 1 quán / giỏ, size + topping) |
| D2 | Đặt đơn COD, server tính tiền | MVP | ✅ BE · ✅ FE |
| D3 | State machine trạng thái + lịch sử | MVP | ✅ |
| D4 | Quán nhận đơn realtime (Socket.IO + âm báo) | MVP | ✅ |
| D5 | Nhận / từ chối kèm lý do | MVP | ✅ |
| D6 | Tự hủy khi quán không phản hồi sau 5 phút | MVP | ✅ |
| D7 | Khách hủy khi đơn còn PLACED | MVP | ✅ |
| D8 | Khách theo dõi trạng thái realtime | MVP | ✅ |
| D9 | Đơn tự đến lấy (pickup) | MVP (cờ `fulfillmentType`) | ✅ |
| D10 | Xin kéo dài thời gian chuẩn bị | ⏭️ | ⬜ |
| D11 | Điều phối tài xế nền tảng | ⏭️ (MVP: quán tự giao) | ⬜ |
| D12 | Đơn hẹn giờ, đơn tại bàn QR, in phiếu bếp ESC/POS | ⏭️ | ⬜ |

### E. Khuyến mãi

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| E1 | Voucher của quán: % hoặc số tiền, đơn tối thiểu, giới hạn lượt, thời hạn | MVP | ⬜ |
| E2 | Combo, mua X tặng Y, flash sale | ⏭️ | ⬜ |
| E3 | Chương trình chung của nền tảng, quảng cáo trả phí | ⏭️ | ⬜ |

### F. Tài chính & Đối soát

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| F1 | Doanh thu theo ngày/tuần/tháng (tiền hàng, giảm giá) | MVP | ⬜ |
| F2 | Hoa hồng nền tảng: `commissionRate` trên quán (admin sửa) ✅; tính `commissionAmount` trên đơn ⬜ | MVP | 🟡 |
| F3 | Ví, ledger, rút tiền, chu kỳ thanh toán, đối soát COD/online | ⏭️ | ⬜ |
| F4 | Thanh toán online VNPay + callback, hoàn tiền | ⏭️ | ⬜ |
| F5 | Hóa đơn VAT, sao kê Excel/PDF | ⏭️ | ⬜ |

### G. Đánh giá & CSKH

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| G1 | Khách đánh giá **quán** (1–5 sao + nhận xét), hiện công khai trên trang quán | MVP | ✅ |
| G2 | Quán trả lời công khai | MVP | ✅ |
| G3 | Điểm chất lượng quán (tỷ lệ nhận, hủy, rating) | MVP rút gọn: rating TB + tỷ lệ hủy | 🟡 (rating TB + điểm xếp hạng ✅, tỷ lệ hủy ⬜) |
| G5 | Thẻ quán ở trang khách, xếp theo điểm đánh giá; lọc "Từ 4★" (quán + món) | MVP | ✅ |
| G4 | Báo cáo đánh giá vi phạm, khiếu nại có ảnh | ⏭️ | ⬜ |

### H. Báo cáo

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| H1 | Dashboard quán: số đơn, doanh thu, giá trị đơn TB, top món | MVP | ✅ |
| H2 | Dashboard admin: số quán, số đơn, doanh thu nền tảng | MVP | ✅ |
| H3 | Giờ cao điểm, tỷ lệ khách quay lại, so sánh chi nhánh, xuất file | ⏭️ | ⬜ |

### I. Thông báo & Cấu hình

| # | Chức năng | Phạm vi | Trạng thái |
|---|---|---|---|
| I1 | Thông báo trong app (lưu DB + đẩy Socket.IO) — gồm báo duyệt/từ chối quán | MVP | ✅ |
| I2 | Âm báo đơn mới trên trang quán | MVP | ✅ |
| I3 | Audit log thao tác quan trọng | MVP rút gọn | 🟡 duyệt/từ chối/khóa/mở quán, đổi hoa hồng, đổi giá món ✅ · hủy đơn, khóa user ⬜ |
| I4 | Push FCM, email, SMS, Zalo | ⏭️ | ⬜ |

---

## 6. Business Rules

Mã `BR-xx` được tham chiếu trong [database.md](database.md) và [API.md](API.md). Cột cuối: đã được code + test chưa.

### Tài khoản

| Mã | Quy tắc | |
|---|---|---|
| BR-01 | Đăng ký cần `fullName`, `password` (≥ 6 ký tự) và **ít nhất một** trong `email` / `phone`. Email & SĐT là duy nhất (email không phân biệt hoa thường). | ✅ |
| BR-02 | SĐT chuẩn hóa về dạng `0xxxxxxxxx` (10 số, bỏ khoảng trắng/dấu chấm/gạch, `+84` → `0`) — áp dụng cả lúc đăng ký, sửa hồ sơ, địa chỉ, quán. | ✅ |
| BR-03 | Chỉ được tự đăng ký `CUSTOMER` hoặc `RESTAURANT_OWNER`; `ADMIN` chỉ tạo bằng script. | ✅ |
| BR-04 | Tài khoản `BLOCKED` không đăng nhập được; token cũ của user bị khóa bị từ chối ngay (`authenticate` đọc lại user mỗi request, role cũng lấy từ DB). | ✅ |
| BR-05 | Đổi mật khẩu: phải nhập đúng mật khẩu cũ (sai → 400, không phải 401), mật khẩu mới khác mật khẩu cũ; mọi token cấp trước đó hết hiệu lực, API trả token mới. | ✅ |
| BR-06 | Sổ địa chỉ: tối đa 5 địa chỉ, luôn có đúng 1 địa chỉ mặc định (địa chỉ đầu tiên tự là mặc định; xóa địa chỉ mặc định → địa chỉ còn lại đầu tiên thành mặc định). Chỉ CUSTOMER. | ✅ |
| BR-07 | Không được xóa SĐT nếu tài khoản không có email (phải còn ít nhất một cách đăng nhập). | ✅ |

### Cửa hàng

| Mã | Quy tắc | |
|---|---|---|
| BR-10 | MVP: mỗi `RESTAURANT_OWNER` có **tối đa 1 quán** (unique index `owner`). | ✅ |
| BR-11 | Vòng đời hồ sơ quán: `DRAFT → SUBMITTED → APPROVED \| REJECTED`; `REJECTED` sửa xong được nộp lại (`→ SUBMITTED`, xóa lý do từ chối). Admin `BLOCKED` / mở khóa quán **đã duyệt**; mở khóa → `APPROVED`. | ✅ |
| BR-12 | Chỉ quán `APPROVED` mới hiện với khách (danh sách quán, menu, tìm món) và nhận đơn. | ✅ (hiển thị) · ⬜ (nhận đơn) |
| BR-13 | Quán nhận đơn khi **đồng thời**: `APPROVED` + `isAcceptingOrders = true` + đang trong giờ mở cửa (giờ `Asia/Ho_Chi_Minh`, `open ≤ giờ hiện tại < close`, MVP không có ca qua đêm). API trả `isOpenNow`, `canAcceptOrders`. | ✅ |
| BR-14 | Khóa sửa theo trạng thái: `SUBMITTED` → không sửa hồ sơ (409); giấy tờ chỉ sửa khi `DRAFT`/`REJECTED`; `BLOCKED` → chỉ xem, không sửa hồ sơ/menu (403). Quán `APPROVED` vẫn sửa được thông tin (⏭️ cần duyệt lại; MVP chỉ ghi audit log — ⬜ chưa ghi). | ✅ / ⬜ |
| BR-15 | Nộp hồ sơ cần: ít nhất 1 khung giờ mở cửa + giấy tờ `BUSINESS_LICENSE` và `ID_CARD` (hằng `REQUIRED_DOCUMENTS`, **nhóm cần chốt** — mục 10). Thiếu → 422 kèm danh sách. | ✅ |
| BR-16 | Admin khóa quán → tự tắt `isAcceptingOrders`; mở khóa thì chủ quán tự bật lại. | ✅ |
| BR-17 | Slug sinh một lần từ tên lúc tạo quán (trùng → thêm hậu tố), **không đổi khi đổi tên** để link không hỏng. | ✅ |
| BR-18 | Giấy tờ pháp lý không bao giờ public: lưu thư mục private, API không trả đường dẫn file; chỉ admin xem qua API riêng. | ✅ |

### Thực đơn

| Mã | Quy tắc | |
|---|---|---|
| BR-20 | Món thuộc đúng 1 danh mục của **chính quán đó** (danh mục quán khác → 422). | ✅ |
| BR-21 | Giá là **số nguyên VND ≥ 0**, không dùng số thực. Có biến thể → giá bán theo biến thể, `basePrice` tự bằng giá biến thể mặc định; không biến thể → `basePrice` bắt buộc. Giá cuối = giá món/biến thể + tổng giá topping. | ✅ (lưu) · ⬜ (tính khi đặt đơn) |
| BR-22 | Nhóm topping có `minSelect`/`maxSelect`; `0 ≤ minSelect ≤ maxSelect ≤ số lựa chọn`; `required` ⇔ `minSelect ≥ 1`. | ✅ (lúc lưu menu) · ⬜ (kiểm tra lúc đặt đơn) |
| BR-23 | Món có `dailyLimit` thì `soldToday` reset lúc 00:00 mỗi ngày; `soldToday ≥ dailyLimit` → món hiện "hết hàng" (`isOrderable: false`). `dailyLimit: null` = không giới hạn. | 🟡 (job reset ⬜) |
| BR-24 | Xóa món = **ẩn mềm** (`isDeleted`) để không làm hỏng đơn cũ / thống kê. | ✅ |
| BR-25 | Tên danh mục không trùng trong một quán (không phân biệt hoa thường); không xóa được danh mục còn món. Danh mục `isActive: false` ẩn cả nhóm món với khách. | ✅ |
| BR-26 | Luôn có đúng 1 biến thể mặc định. Khi sửa món, biến thể/topping gửi kèm `id` cũ được giữ nguyên `id` (giỏ hàng không hỏng). | ✅ |
| BR-27 | Đổi giá món (basePrice hoặc giá biến thể) → ghi audit log `MENU_PRICE_CHANGE`. | ✅ |

### Đơn hàng

| Mã | Quy tắc | |
|---|---|---|
| BR-30 | Một đơn chỉ chứa món của **một quán** (giỏ đổi quán thì phải xóa giỏ cũ). | ⬜ |
| BR-31 | Server tự tính `subtotal`, `discount`, `total` từ DB; bỏ qua giá client gửi lên. `deliveryFee` luôn = 0 (miễn phí giao). | ✅ |
| BR-32 | `subtotal` phải ≥ `minOrderAmount` của quán (MVP: áp dụng cả giao hàng và pickup). | ⬜ |
| BR-33 | Snapshot tên, giá, biến thể, topping vào từng dòng đơn. | ⬜ |
| BR-34 | Trừ tồn kho **nguyên tử**: chỉ trừ khi `soldToday + qty ≤ dailyLimit`; một món thất bại → hủy toàn bộ giao dịch đặt đơn. | ⬜ |
| BR-35 | Vòng đời đơn (rút gọn từ docx vì quán tự giao) — xem sơ đồ và bảng bên dưới. | ⬜ |
| BR-36 | Job chạy mỗi phút: đơn `PLACED` quá 5 phút → `CANCELLED` (actor = SYSTEM), hoàn lại tồn kho, báo khách và quán. | ✅ |
| BR-37 | Đơn bị `REJECTED`/`CANCELLED` → hoàn lại `soldToday` và lượt dùng voucher. | ✅ suất · ⬜ voucher |
| BR-38 | Đặt đơn gửi header `Idempotency-Key`; gửi lại cùng key trong 24h trả về đúng đơn cũ, không tạo đơn mới. | ⬜ |
| BR-39 | MVP chỉ thanh toán **COD**: `paymentStatus` = `UNPAID` → `PAID` khi đơn `COMPLETED`. | ✅ |

BR-35 — vòng đời đơn:

```
PLACED ──▶ ACCEPTED ──▶ PREPARING ──▶ READY ──▶ DELIVERING ──▶ COMPLETED
  │           │                         │
  │           └──▶ CANCELLED            └──▶ COMPLETED   (đơn pickup: khách đến lấy)
  ├──▶ REJECTED   (quán từ chối, bắt buộc lý do)
  └──▶ CANCELLED  (khách hủy / hết 5 phút không phản hồi)
```

| Từ → Đến | Ai được làm | Điều kiện |
|---|---|---|
| PLACED → ACCEPTED | Owner | — |
| PLACED → REJECTED | Owner | bắt buộc `reason` (OUT_OF_STOCK, OVERLOADED, CLOSED, OTHER) |
| PLACED → CANCELLED | Customer | bất kỳ lúc nào khi còn PLACED |
| PLACED → CANCELLED | System | quá **5 phút** không phản hồi (BR-36) |
| ACCEPTED → PREPARING | Owner | — |
| ACCEPTED → CANCELLED | Owner | bắt buộc lý do; tính vào tỷ lệ hủy của quán |
| PREPARING → READY | Owner | — |
| READY → DELIVERING | Owner | chỉ đơn `DELIVERY` |
| READY → COMPLETED | Owner | chỉ đơn `PICKUP` |
| DELIVERING → COMPLETED | Owner | — |

Mọi chuyển khác → lỗi `409 INVALID_STATUS_TRANSITION`. Mỗi lần chuyển ghi 1 dòng `statusHistory` (ai, lúc nào, lý do).

### Khuyến mãi

| Mã | Quy tắc | |
|---|---|---|
| BR-40 | Voucher thuộc 1 quán, mã duy nhất trong quán, có `startAt/endAt`, `minOrderAmount`, `usageLimit`, `perUserLimit`. | ⬜ |
| BR-41 | Voucher `%` có `maxDiscount`; `discount ≤ subtotal` (tổng không âm). Mỗi đơn tối đa 1 voucher. | ⬜ |
| BR-42 | Tăng `usedCount` nguyên tử khi đặt đơn (`usedCount < usageLimit`). | ⬜ |

### Tài chính

| Mã | Quy tắc | |
|---|---|---|
| BR-50 | Mọi số tiền là **số nguyên VND** (validate ở cả route và model). | ✅ (quán, menu) |
| BR-51 | `commissionAmount = round(subtotal × commissionRate)`; `commissionRate` mặc định 10%, lưu trên quán, **chỉ admin sửa**, snapshot vào đơn. | 🟡 (lưu/sửa ✅, tính trên đơn ⬜) |
| BR-52 | Doanh thu quán chỉ tính đơn `COMPLETED` (theo ngày đặt, giờ VN). | ✅ |
| BR-53 | (⏭️) Ví dùng ledger chỉ-ghi-thêm: không sửa số dư trực tiếp. | ⏭️ |

### Đánh giá

| Mã | Quy tắc | |
|---|---|---|
| BR-60 | **(Đổi 08/10/2026)** Đánh giá **chung cho quán**, không theo đơn: chỉ khách đã có ≥ 1 đơn `COMPLETED` ở quán mới được viết; **1 đánh giá / khách / quán**, sửa / xóa được; 1–5 sao + nhận xét ≤ 1000 ký tự, ai mở trang quán cũng xem được (tên rút gọn "An N."). | ✅ |
| BR-61 | Quán trả lời mỗi đánh giá 1 lần (sửa được). `ratingAvg` = trung bình cộng (hiển thị), `ratingScore` = điểm có trọng số `(n×avg + 5×3.5)/(n+5)` dùng xếp hạng; tính lại mỗi khi viết / sửa / xóa / ẩn đánh giá. Admin ẩn → không hiện, không tính điểm. | ✅ |

### Hệ thống

| Mã | Quy tắc | |
|---|---|---|
| BR-70 | Audit log chỉ ghi thêm, không sửa/xóa (chặn ở tầng model). | ✅ |
| BR-71 | Admin thao tác cùng lúc trên cùng một quán → chỉ một thao tác thành công, thao tác kia 409. | ✅ |
| BR-72 | Ảnh upload: jpg/png/webp ≤ 2MB; giấy tờ thêm pdf; tên file ngẫu nhiên, thay ảnh thì xóa file cũ. | ✅ |

---

## 7. Database overview

Chi tiết schema, index, ràng buộc: xem **[database.md](database.md)**.

| Nhóm (docx) | Collection MVP | Trạng thái | Sau MVP |
|---|---|---|---|
| Danh tính & quyền | `users` (nhúng `addresses`) | ✅ | `storeStaff`, `merchantDocuments` (MVP nhúng giấy tờ vào `restaurants`) |
| Cửa hàng | `restaurants` (nhúng giờ mở cửa, giấy tờ) | ✅ | — |
| Thực đơn | `menucategories`, `menuitems` (nhúng variants + optionGroups) | ✅ | `priceHistory` (MVP dùng audit log) |
| Đơn hàng | `orders` (nhúng items + statusHistory), `idempotencykeys` | ⬜ | — |
| Khuyến mãi | `vouchers` | ⬜ | `promotions` |
| Tài chính | (số tiền nằm trên `orders`) | ⬜ | `wallets`, `walletTransactions`, `payouts`, `settlements` |
| Khác | `auditlogs` ✅, `reviews` ✅, `notifications` ✅ | ✅ | — |

---

## 8. Lộ trình thực hiện tổng thể

Bám theo Gantt `HW3/Gantt_MVP_he_thong_dat_mon.xlsx` (03/10 → 02/11/2026). Mỗi bước có **đầu ra kiểm chứng được** — xong đầu ra mới sang bước sau.

> **Tiến độ thực tế:** phần backend của P3.0 → P3.3 đã xong sớm (06/10, trước kế hoạch 13–19/10). Frontend phía khách đã nối API menu, sổ địa chỉ, đổi mật khẩu (06/10); trang `/owner/*`, `/admin/*` chưa làm.

### P1 — Phạm vi & kiến trúc (03/10 – 08/10)

| Bước | Việc | Đầu ra | |
|---|---|---|---|
| 1.1 | Chốt nghiệp vụ, vẽ state machine đơn hàng | Mục 6 (BR-35) | ✅ (đã viết, chờ nhóm duyệt) |
| 1.2 | Chốt phạm vi MVP + mô hình dữ liệu | Mục 5 + [database.md](database.md) | ✅ |
| 1.3 | Chốt API, sự kiện realtime, phân quyền | [API.md](API.md) + mục 4 | ✅ |
| 1.4 | Trả lời các câu hỏi ở mục 10 | Ghi kết quả vào mục 10 | ⬜ |

### P2 — Thiết kế UI (08/10 – 13/10)

| Bước | Việc | Đầu ra | |
|---|---|---|---|
| 2.1 | UI khách: trang quán, chi tiết món (chọn size/topping), giỏ, checkout | Trang quán, hộp chọn size/topping, sổ địa chỉ, đổi mật khẩu | ✅ |
| 2.2 | UI chủ quán: onboarding (form hồ sơ, giờ mở cửa, upload giấy tờ), quản lý menu, màn nhận đơn | Wireframe `/owner/*` | ⬜ |
| 2.3 | UI theo dõi trạng thái đơn + đánh giá; UI admin duyệt quán | Admin duyệt quán ✅; theo dõi đơn realtime ✅; đánh giá ⬜ | 🟡 |

### P3 — Nền tảng đặt món (13/10 – 23/10) — phần backend nặng nhất

| Bước | Việc | Phụ thuộc | Đầu ra | |
|---|---|---|---|---|
| 3.0 | Hạ tầng chung: error handler, validate, test (Supertest + DB trong RAM), CI backend, chuyển route owner sang `/api/merchant/*` | — | Test chạy trên CI | ✅ (Swagger, rate limit ⬜) |
| 3.1 | Tài khoản, hồ sơ, địa chỉ, đổi mật khẩu, chặn user bị khóa | 3.0 | API Auth/User xong + test | ✅ |
| 3.2 | Quán: hồ sơ DRAFT→SUBMITTED, giờ mở cửa, bật/tắt nhận đơn, upload ảnh/giấy tờ; Admin duyệt/từ chối/khóa + audit log | 3.1 | Owner tạo quán → Admin duyệt → quán hiện ra | ✅ |
| 3.3 | Menu: danh mục, món, biến thể, topping, hết hàng/giới hạn ngày; API public xem quán, menu, tìm món; seed demo | 3.2 | BE ✅ — FE `/menu` đọc từ API ✅ | ✅ |
| 3.4 | Đặt đơn: tính giá phía server, trừ tồn kho nguyên tử, idempotency, voucher | 3.3 | FE checkout gọi API, bỏ `OrderContext` localStorage | 🟡 (voucher ⬜) |
| 3.5 | Xử lý đơn: state machine, Socket.IO, job timeout 5 phút + reset suất 00:00, thông báo | 3.4 | Demo 2 trình duyệt: khách đặt → quán nhận realtime | ✅ |

### P4 — Vận hành (23/10 – 29/10)

| Bước | Việc | Đầu ra | |
|---|---|---|---|
| 4.1 | Thanh toán: COD hoàn chỉnh (`paymentStatus`); VNPay sandbox nếu dư thời gian | Đơn COMPLETED → PAID | ⬜ |
| 4.2 | Doanh thu & hoa hồng: dashboard quán, thống kê admin | Trang `/owner/dashboard` có số liệu thật | ✅ |
| 4.3 | Đánh giá + trả lời, thông báo trong app, admin khóa user | Luồng đánh giá chạy đủ | ✅ |

### P5 — Kiểm thử & phát hành (29/10 – 02/11)

| Bước | Việc | Đầu ra | |
|---|---|---|---|
| 5.1 | Test chức năng các luồng MVP (mục 9) | Checklist pass | 🟡 (test tự động cho phần đã làm) |
| 5.2 | Bảo mật (phân quyền chéo quán, rate limit login), hiệu năng cơ bản | Không truy cập được dữ liệu quán khác | 🟡 (test chéo quán cho hồ sơ + menu ✅) |
| 5.3 | Seed dữ liệu demo, deploy (Render/Railway + Atlas + Vercel), demo | Link chạy được | 🟡 (`npm run seed:demo` ✅, deploy ⬜) |

### Sau MVP (theo docx)

| Giai đoạn docx | Nội dung |
|---|---|
| Vận hành | Nhân viên quán (RBAC), nhiều chi nhánh, in phiếu bếp, xin kéo dài thời gian chuẩn bị |
| Tài chính | Ví + ledger, đối soát COD/online, rút tiền, sao kê, hóa đơn |
| Tăng trưởng | Combo/flash sale, quảng cáo, đơn hẹn giờ, đơn tại bàn QR, API cho POS |

---

## 9. Luồng nghiệm thu MVP (Definition of Done)

| # | Luồng | Trạng thái |
|---|---|---|
| 1 | Owner đăng ký → tạo quán (DRAFT) → nộp hồ sơ → Admin duyệt → quán hiện ở trang khách. | ✅ BE (có test end-to-end) · ✅ FE |
| 2 | Owner tạo danh mục, món có size + topping bắt buộc, đặt giới hạn 5 suất/ngày. | ✅ BE · ✅ FE |
| 3 | Khách chọn món, chọn size/topping, áp voucher, đặt đơn COD. | 🟡 (đặt đơn COD ✅, voucher ⬜) |
| 4 | Trang quán **kêu chuông** và hiện đơn mới không cần F5; quán nhận → chuẩn bị → sẵn sàng → đang giao → hoàn thành; khách thấy trạng thái đổi realtime. | ✅ |
| 5 | Đơn không được phản hồi 5 phút → tự hủy, tồn kho được hoàn. | ✅ |
| 6 | Khách đánh giá, quán trả lời; dashboard quán hiện doanh thu đúng. | ✅ |
| 7 | Owner A không đọc/sửa được menu hoặc đơn của quán B (test tự động). | ✅ |

---

## 10. Rủi ro & việc cần chốt

### Rủi ro (từ docx, kèm cách xử lý trong dự án)

| Rủi ro | Hướng xử lý | BR | |
|---|---|---|---|
| Quán không phản hồi đơn | Job timeout 5 phút + âm báo | BR-36 | ✅ |
| Lệch trạng thái khách – quán | State machine tập trung, chặn chuyển sai | BR-35 | ✅ |
| Race condition tồn kho món cuối | `updateOne` có điều kiện + transaction | BR-34 | ✅ (test 5 khách tranh 1 suất) |
| Sai lệch tiền | Tiền số nguyên, server tự tính, snapshot vào đơn | BR-31, BR-50 | ✅ |
| Đặt trùng đơn do bấm 2 lần / mạng chập chờn | Idempotency-Key | BR-38 | ✅ |
| Gian lận (đơn ảo, hủy hàng loạt) | Theo dõi tỷ lệ hủy, admin khóa quán | G3, BR-16 | 🟡 (khóa quán ✅) |
| Lộ dữ liệu quán khác | Kiểm tra ownership ở mọi route merchant + test; serializer public theo danh sách cho phép | — | ✅ (phần đã làm) |
| Lộ giấy tờ pháp lý | Thư mục private, không trả đường dẫn, chỉ admin xem | BR-18 | ✅ |
| Hai admin duyệt cùng lúc | Update có điều kiện trạng thái | BR-71 | ✅ |

### Việc cần chốt (điền kết quả vào cột cuối)

| Câu hỏi | Đề xuất của tài liệu này | Quyết định |
|---|---|---|
| Ai giao hàng — tài xế nền tảng hay quán tự giao? | Quán tự giao (bỏ trạng thái PICKED_UP) | ✅ **Quán tự giao** (06/10/2026) |
| Xác thực khi đăng ký? | OTP email / SĐT | ✅ **Chỉ email, mã 6 số qua Gmail** (08/10/2026); SĐT để sau |
| Phí giao hàng? | Quán tự cấu hình | ✅ **Miễn phí hoàn toàn cho khách** (06/10/2026) — bỏ `deliveryFee` khỏi hồ sơ quán; `orders.deliveryFee` luôn = 0 |
| Mô hình hoa hồng? | Cố định 10%, lưu `commissionRate` trên từng quán (admin sửa được — đã code) | |
| Hình thức thanh toán, ai giữ tiền? | MVP chỉ COD, quán giữ tiền | |
| Quy mô ban đầu? | ~10 quán, < 500 đơn/ngày → 1 server + Atlas free | |
| App cho quán: app riêng hay web? | Web portal `/owner` trong cùng frontend | |
| Cho phép 1 owner nhiều quán ở MVP? | Không (BR-10 — đã code) | |
| Giấy tờ bắt buộc khi nộp hồ sơ? | `BUSINESS_LICENSE` + `ID_CARD` (tạm thời, sửa ở `REQUIRED_DOCUMENTS`) | |
| Quán đã duyệt sửa tên/địa chỉ có cần duyệt lại? | MVP: không, chỉ ghi audit log | |

### Việc kỹ thuật còn tồn đọng

| Việc | Ghi chú |
|---|---|
| Lưu ảnh khi deploy | Ổ đĩa của Render/Railway không bền → đổi `upload.middleware.js` sang Cloudinary. |
| Swagger `/api/docs` | Thuộc API-10, chưa làm (rate limit + `helmet` ✅ 08/10). |

---

## 11. Nhật ký tiến độ backend

| Bước | Ngày | Nội dung | Số test |
|---|---|---|---|
| 1 — API-0 (phần 1) | 06/10/2026 | `AppError`, `asyncHandler`, `errorHandler` (field `code`), `validate`, plugin `toJSON` (`id`, ẩn `password`) | — |
| 2 — API-0 (phần 2) | 06/10/2026 | Jest + Supertest + mongodb-memory-server (replica set), test auth/user, job CI `backend-test` | 25 |
| 3 — API-1 | 06/10/2026 | `authenticate` đọc lại user (BR-04), đổi mật khẩu (BR-05), validate SĐT khi sửa hồ sơ, sổ địa chỉ (BR-06) | 49 |
| 4 — API-2 | 06/10/2026 | Model quán mới, `/api/merchant/restaurant` (hồ sơ, giờ mở cửa, ảnh, giấy tờ, nộp hồ sơ, bật/tắt nhận đơn), migration 001, giờ VN | 86 |
| 5 — API-3 | 06/10/2026 | `/api/admin` duyệt/từ chối/khóa/mở quán, xem giấy tờ, hoa hồng, `auditlogs`, phân trang dùng chung | 103 |
| 6a — API-4 (chủ quán) | 06/10/2026 | `menucategories`, `menuitems` (biến thể, topping, giới hạn suất, xóa mềm), `/api/merchant/categories`, `/api/merchant/menu-items` | 130 |
| 6b — API-4 (public) | 06/10/2026 | `/api/restaurants`, `/api/restaurants/:idOrSlug/menu`, `/api/menu-items` (tìm không dấu, lọc, sắp xếp), `npm run seed:demo` | 146 |
| 7a — API-5 (đặt đơn) | 06/10/2026 | `orders`, `idempotencykeys`, `counters`; `/api/orders/preview`, `POST/GET /api/orders`, hủy đơn; trừ suất trong transaction; sửa lỗi 500 khi khóa/mở quán không có body; migration 001 bổ sung `nameNoAccent` + `--dry-run` (đã chạy trên DB thật); CI: `--passWithNoTests` ở gốc + job `frontend-build` | 160 |
| 8 — API-6 (xử lý đơn + realtime) | 06/10/2026 | Quyết định: quán tự giao, miễn phí giao (bỏ `deliveryFee` khỏi quán); `orderStateMachine.js`; `/api/merchant/orders` (nhận, từ chối, chuyển bước, hủy; COMPLETED → PAID); Socket.IO (`order:new`, `order:status_changed`, `restaurant:status_changed`); node-cron hủy đơn quá 5' + reset suất 00:00; `verifyToken` dùng chung REST/socket; `FORBIDDEN` có `code`; FE: màn nhận đơn `/owner/orders` (âm báo, đếm ngược), khách theo dõi realtime | 178 |
| 9 — Bảo mật P0 | 08/10/2026 | Rate limit đăng nhập/đăng ký/đổi mật khẩu (`TRUST_PROXY`), `helmet`, body ≤ 100kb, mật khẩu ≥ 8 ký tự + chặn mật khẩu phổ biến, kiểm tra magic bytes file upload, `seed:admin` bỏ mật khẩu mặc định (≥ 12 ký tự, `--reset-password`), server từ chối `JWT_SECRET` < 32 ký tự | 184 |
| 10 — API-7 (thông báo) | 08/10/2026 | `notifications` (TTL 90 ngày), `/api/notifications` (danh sách + `unreadCount`, đã đọc 1 / tất cả), thông báo cho đơn mới, đổi trạng thái đơn, nộp / duyệt / từ chối / khóa / mở khóa quán, socket `notification:new`; FE: chuông thông báo ở header khách, chủ quán, admin | 190 |
| 11 — API-8 (đánh giá) | 08/10/2026 | Đánh giá chung cho quán (đổi BR-60): 1–5 sao, 1 / khách / quán, phải có đơn hoàn thành; `reviews`, `ratingScore` (Bayes), `/api/restaurants/:idOrSlug/reviews[/me]`, `/api/merchant/reviews`, `/api/admin/reviews`; lọc `minRating`; thông báo `REVIEW_NEW` + mời đánh giá khi đơn hoàn thành; migration 002; FE: thẻ quán + lọc "Từ 4★" ở `/menu`, phần đánh giá trên trang quán, trang Đánh giá cho chủ quán và admin | 204 |
| 12 — OTP email | 08/10/2026 | Đăng ký bằng email phải xác thực mã OTP 6 số gửi qua Gmail (`nodemailer`; chế độ `log` khi chưa cấu hình); `/api/auth/otp/send`, `/api/auth/otp/verify` → vé 15 phút; mã băm HMAC, 5 phút, 5 lần sai, gửi lại sau 60 s, ≤ 5 mã / giờ; `users.emailVerified`; SĐT chưa áp dụng OTP; FE: bước nhập mã trong form đăng ký | 214 |
| 13 — Quên mật khẩu | 09/10/2026 | `/api/auth/password/forgot` + `/password/reset`: mã 6 số qua Gmail (mục đích `RESET_PASSWORD`, tách khỏi mã đăng ký), không lộ email nào đã đăng ký, đặt lại → đăng xuất mọi phiên + email báo đã đổi; FE: link "Quên mật khẩu?" ở trang đăng nhập của khách / chủ quán / admin | 221 |
| 14 — API-9 (báo cáo + admin) | 09/10/2026 | `/api/merchant/reports/{summary,revenue,top-items}`, `/api/admin/reports/summary`, `/api/admin/users` (+ khóa / mở, khóa chủ quán → tắt nhận đơn), `/api/admin/orders`; khoảng ngày giờ VN, doanh thu chỉ đơn hoàn thành; FE: `/owner/dashboard`, `/admin/stats` (biểu đồ cột doanh thu + bảng), `/admin/users`, `/admin/orders`, trang Tài khoản (đổi mật khẩu) cho chủ quán / admin | 230 |

**Lệnh hay dùng (trong `backend/`):**

```bash
npm run dev            # chạy server (cần MONGODB_URI, JWT_SECRET trong .env)
npm test               # chạy toàn bộ test (không cần MongoDB thật)
npm run seed:admin     # tạo tài khoản ADMIN
npm run seed:demo      # tạo 3 quán demo + 16 món + tài khoản demo
npm run db:init-replset # MongoDB cài trên máy: bật replica set 1 node (đặt đơn cần transaction)
npm run migrate:001    # chuyển dữ liệu quán cũ sang trạng thái mới (thêm `-- --dry-run` để xem trước)
npm run migrate:002    # tính điểm đánh giá / ratingScore cho quán có sẵn (API-8)
```
