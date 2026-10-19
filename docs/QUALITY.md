# Kế hoạch chất lượng — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 19/10/2026.
> Tài liệu liên quan: [RISKS.md](RISKS.md) · [scrum.md](scrum.md) · [API.md](API.md) · [project.md](project.md) (mục 9 — luồng nghiệm thu)

QA (Quality Assurance) là các biện pháp phòng ngừa trong quá trình làm, để lỗi khó xảy ra.
QC (Quality Control) là các ca kiểm tra trên sản phẩm, để phát hiện lỗi. Mỗi ca có kết quả mong đợi và bằng chứng.

## 1. Tổng hợp

| ID | Hạng mục | Ngưỡng đạt | Phụ trách | Hiện trạng (19/10/2026) |
|---|---|---|---|---|
| Q1 | Đúng nghiệp vụ (backend) | 0 test lỗi trên CI cho mỗi Pull Request; mỗi endpoint MVP có ít nhất 1 ca thành công và 1 ca lỗi; 7/7 tình huống nghiệp vụ cốt lõi có test | An Đức Mạnh | ✅ 265/265 test pass, 22 bộ test |
| Q2 | Bảo mật & phân quyền | 0 bí mật trong repo; sai vai trò → 403 ở mọi nhóm route quản trị; khóa đăng nhập sau 10 lần sai / 15 phút | An Đức Mạnh | 🟡 Còn thu hồi mật khẩu Gmail cũ |
| Q3 | Hiệu năng & realtime | API danh sách quán ≤ 300 ms trên máy, ≤ 1 s trên VPS (trung vị 20 lần đo); đơn mới hiện ở trang quán ≤ 2 s | An Đức Mạnh | 🟡 Máy đạt; VPS 3,2 s (thiếu RAM — RISKS R1) |
| Q4 | Luồng nghiệm thu & dễ dùng | 7/7 luồng nghiệm thu chạy được bằng tay; khách mới đặt được đơn đầu tiên trong ≤ 3 phút; 0 thông báo lỗi tiếng Anh ở các luồng chính | Trương An, Lương Minh Khánh | 🟡 6/7 luồng (thiếu voucher) |

---

## Q1 — Đúng nghiệp vụ backend

**Ngưỡng đạt (đo được):**
- CI (GitHub Actions, `.github/workflows/ci.yml`) báo 0 test lỗi ở mọi Pull Request vào `develop`. Có test đỏ thì không merge.
- Mỗi endpoint của MVP trong `docs/API.md` có ít nhất 1 ca thành công và 1 ca lỗi (sai dữ liệu / sai quyền / sai trạng thái).
- 7/7 tình huống nghiệp vụ cốt lõi ở bảng QC dưới có test tự động.

**Biện pháp QA (phòng ngừa):**
- Viết test cùng lúc với tính năng: Jest + Supertest, MongoDB chạy trong RAM (replica set) để test được cả transaction.
- Kiểm tra dữ liệu đầu vào ở route (express-validator) và ở model (Mongoose). Lỗi trả về theo một định dạng thống nhất có `code`.
- Quy tắc nghiệp vụ được đánh mã BR-xx trong `docs/project.md`, và mỗi test ghi rõ nó kiểm tra quy tắc nào.
- Mọi thay đổi vào `develop` đi qua Pull Request và được review.

**Ca kiểm tra QC:**

| Mã | Tình huống | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|
| TC-Q1-01 | 5 khách cùng đặt suất cuối cùng | 1 đơn thành công (201), 4 nhận 409 `ITEM_OUT_OF_STOCK` | `tests/order/order.test.js` |
| TC-Q1-02 | Gửi lại cùng Idempotency-Key, kể cả gửi song song | Chỉ tạo 1 đơn, không trừ suất lần 2 | `tests/order/order.test.js` |
| TC-Q1-03 | Quán chuyển trạng thái đơn sai thứ tự (ví dụ READY → PLACED) | 409 `INVALID_STATUS_TRANSITION` | `tests/order/merchant-order.test.js` |
| TC-Q1-04 | Đơn chờ quán nhận quá 5 phút | Tự hủy, hoàn lại suất | `tests/order/merchant-order.test.js` |
| TC-Q1-05 | Đơn COD hoàn thành, hoa hồng 10% của đơn 70.000đ | Ví quán −7.000, ví nền tảng +7.000, tổng mọi ví = 0 | `tests/wallet/wallet.test.js` |
| TC-Q1-06 | Webhook SePay gửi lại cùng một giao dịch | Lần 2 trả `DUPLICATE_WEBHOOK`, số dư không đổi | `tests/payment/payment.test.js` |
| TC-Q1-07 | Khách chưa có đơn hoàn thành ở quán mà viết đánh giá | 403 `REVIEW_NOT_ALLOWED` | `tests/review/review.test.js` |

**Bằng chứng tổng:**
- Lệnh `cd backend && npm test`, kết quả hiện tại: `Test Suites: 22 passed · Tests: 265 passed`.
- Tab **Actions** trên GitHub: mỗi Pull Request có dấu ✓ xanh.

**Phụ trách:** An Đức Mạnh

---

## Q2 — Bảo mật & phân quyền

**Ngưỡng đạt (đo được):**
- 0 mật khẩu / khóa thật trong các file được git theo dõi (kiểm tra bằng lệnh ở TC-Q2-01).
- Token của khách gọi vào mọi nhóm route `/api/merchant/` (hồ sơ quán, thực đơn, đơn, đánh giá, báo cáo, ví) và `/api/admin/` đều nhận 403. Không có token thì nhận 401.
- Chủ quán A gọi tài nguyên của quán B (món, đơn) nhận 404, không lộ việc tài nguyên đó tồn tại.
- Đăng nhập sai 10 lần trong 15 phút thì lần tiếp theo nhận 429 `RATE_LIMITED`.
- Mật khẩu lưu dạng bcrypt; `JWT_SECRET` có ít nhất 32 ký tự, ngắn hơn thì server không khởi động.

**Biện pháp QA (phòng ngừa):**
- `.env` và `backend/uploads/` nằm trong `.gitignore`; `.env.example` chỉ chứa ô trống.
- Checklist review Pull Request có mục "không có bí mật trong diff".
- Middleware `authenticate` đọc lại tài khoản ở mỗi request, nên tài khoản bị khóa giữa chừng bị chặn ngay.
- Header bảo mật (`helmet`), giới hạn kích thước body 100 KB, kiểm tra "magic bytes" của file upload.
- Không bao giờ dán mật khẩu / khóa vào nhóm chat. Khi dán log lỗi phải che mật khẩu.

**Ca kiểm tra QC:**

| Mã | Tình huống | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|
| TC-Q2-01 | Chạy lệnh quét bí mật bên dưới bảng | Không in dòng nào (mã thoát 1) | Ảnh chụp kết quả lệnh |
| TC-Q2-02 | Token khách gọi `/api/admin/users`, `/api/merchant/orders`, `/api/merchant/wallet` | 403 | `tests/wallet/wallet.test.js`, `tests/admin/*` |
| TC-Q2-03 | Chủ quán A sửa món / xem đơn của quán B | 404 | `tests/menu/merchant-menu.test.js`, `tests/order/merchant-order.test.js` |
| TC-Q2-04 | Đăng nhập sai liên tiếp vượt giới hạn | 429 `RATE_LIMITED` | `tests/auth/rate-limit.test.js` |
| TC-Q2-05 | Upload file `.exe` đổi tên thành `.jpg` | 400 `INVALID_FILE_TYPE` | `tests/auth/security.test.js` |
| TC-Q2-06 | Gọi webhook SePay với khóa sai / không có khóa | 401, không ghi giao dịch nào | `tests/payment/payment.test.js` |


**Bằng chứng tổng:** kết quả `npm test` + ảnh chụp lệnh TC-Q2-01 trước mỗi lần merge vào `main`.

**Phụ trách:** An Đức Mạnh 

---

## Q3 — Hiệu năng & realtime

**Ngưỡng đạt (đo được):**
- `GET /api/restaurants`: trung vị **≤ 300 ms** trên máy cá nhân và **≤ 1 s** trên VPS, đo 20 lần liên tiếp.
- Từ lúc khách bấm "Đặt món" tới lúc trang chủ quán hiện đơn mới và kêu chuông: **≤ 2 giây**, không cần tải lại trang.
- Trang khách đã build (`dist/`) có file JavaScript gzip **≤ 200 KB** (hiện 143 KB).
- Backend **không tự khởi động lại** (cột `↺` của `pm2 status` không tăng) trong 1 giờ chạy bình thường.

**Biện pháp QA (phòng ngừa):**
- Có index MongoDB cho các truy vấn chính: đơn theo quán + trạng thái, quán theo điểm đánh giá, ...
- Truy vấn danh sách luôn phân trang (tối đa 100 dòng mỗi trang).
- Realtime dùng Socket.IO theo phòng (`restaurant:{id}`, `user:{id}`), chỉ gửi cho đúng người cần.
- Không build frontend trên VPS (thiếu RAM); build trên máy rồi chép `dist`.
- Giới hạn bộ nhớ đệm MongoDB trên VPS (`cacheSizeGB: 0.25`).

**Ca kiểm tra QC:**

| Mã | Tình huống | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|
| TC-Q3-01 | `for i in $(seq 20); do curl -s -o /dev/null -w "%{time_total}\n" http://localhost/api/restaurants; done \| sort -n \| sed -n 10p` | Trung vị ≤ 1 s (VPS), ≤ 0,3 s (máy) | Ảnh chụp kết quả |
| TC-Q3-02 | 2 trình duyệt: khách đặt đơn, chủ quán mở trang Đơn hàng | Đơn mới hiện + chuông ≤ 2 s | Video quay màn hình |
| TC-Q3-03 | `npm run build` ở `frontend/` | File `.js` gzip ≤ 200 KB | Log build (`index-*.js … gzip: 143 KB`) |
| TC-Q3-04 | `pm2 status` lúc bắt đầu và sau 1 giờ | Cột `↺` không tăng | Ảnh chụp 2 lần |

**Hiện trạng:**
- Trên máy cá nhân: đạt.
- Trên VPS: **chưa đạt**, đo được 3,2 s vì VPS chỉ có ~331MB RAM ([RISKS.md](RISKS.md) R1). Không phải lỗi code; đang xin cấp RAM hoặc chuyển MongoDB sang Atlas.

**Phụ trách:** An Đức Mạnh

---

## Q4 — Luồng nghiệm thu & dễ dùng

**Ngưỡng đạt (đo được):**
- 7/7 luồng nghiệm thu MVP (`docs/project.md` mục 9) chạy được bằng tay trên bản demo, không lỗi.
- Một người chưa từng dùng (bạn cùng lớp) đặt được đơn đầu tiên trong ≤ 3 phút, không cần hướng dẫn, kể từ khi mở trang chủ đã đăng nhập sẵn.
- **0** thông báo lỗi tiếng Anh hoặc mã lỗi thô hiện ra ở các luồng chính. Mọi mã lỗi trong bảng mục 4 của `docs/API.md` có câu tiếng Việt trong `frontend/src/api/client.ts`.
- Giao diện dùng được ở màn hình điện thoại rộng 360 px: không bị thanh cuộn ngang, nút bấm không bị che.

**Biện pháp QA (phòng ngừa):**
- Mỗi tính năng giao diện có tiêu chí nghiệm thu viết trước, trong user story ở `docs/scrum.md`.
- Bảng dịch mã lỗi sang tiếng Việt tập trung trong `client.ts`; thêm mã lỗi mới ở backend thì thêm câu tiếng Việt trong cùng Pull Request.
- Trước mỗi Sprint Review, Product Owner chạy lại toàn bộ luồng nghiệm thu bằng dữ liệu mẫu `npm run seed:demo`.

**Ca kiểm tra QC:**

| Mã | Tình huống | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|
| TC-Q4-01 | Chạy lần lượt 7 luồng nghiệm thu với tài khoản demo | 7/7 đạt; luồng lỗi được ghi lại kèm bước tái hiện | Bảng checklist + ảnh chụp từng luồng |
| TC-Q4-02 | Mời 3 bạn cùng lớp tự đặt một đơn, bấm giờ | Cả 3 người ≤ 3 phút | Bảng ghi thời gian + nhận xét |
| TC-Q4-03 | Cố tình gây lỗi: đặt khi quán đóng, đặt vượt suất, đăng nhập sai | Thông báo tiếng Việt dễ hiểu | Ảnh chụp từng thông báo |
| TC-Q4-04 | Mở trang chủ, trang quán, thanh toán ở chế độ điện thoại 360 px (DevTools) | Không có cuộn ngang, đủ nút bấm | Ảnh chụp 3 trang |

**Hiện trạng:** 6/7 luồng đạt; luồng 3 còn thiếu voucher (Sprint 1).

**Phụ trách:** Trương An (chạy kiểm tra, ghi bằng chứng), Lương Minh Khánh (sửa lỗi giao diện).
