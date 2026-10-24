# Rủi ro xác định — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 19/10/2026. Hạn MVP: 02/11/2026.
> Tài liệu liên quan: [scrum.md](scrum.md) · [QUALITY.md](QUALITY.md) · [project.md](project.md)

## 1. Cách đánh giá

Xác suất (P) và tác động (I) được chấm trước khi có biện pháp kiểm soát.

| Điểm | Xác suất (P) | Tác động (I) |
|---|---|---|
| 1 | Gần như không xảy ra | Không đáng kể, tự khắc phục trong vài phút |
| 2 | Hiếm | Ảnh hưởng nhỏ, sửa trong 1 ngày |
| 3 | Có thể xảy ra | Một chức năng không dùng được, trễ 1–2 ngày |
| 4 | Nhiều khả năng xảy ra | Luồng chính hỏng, sai dữ liệu / tiền, trễ một sprint |
| 5 | Gần như chắc chắn / đã xảy ra | Không demo được, mất dữ liệu / tiền thật, trượt hạn MVP |

**Mức ưu tiên**:
- 🔴 **Cao**
- 🟠 **Trung bình**
- 🟢 **Thấp**

**Chiến lược:**
- Né tránh: bỏ hoặc đổi cách làm để rủi ro không còn xảy ra.
- Giảm thiểu: giảm xác suất hoặc tác động.
- Chuyển giao: giao cho bên khác chịu trách nhiệm.
- Chấp nhận: theo dõi, có phương án dự phòng.

**Trạng thái:**
- Mở: chưa xử lý.
- Đang xử lý: đang thực hiện biện pháp.
- Đã kiểm soát: biện pháp đã có hiệu lực, vẫn tiếp tục theo dõi.
- Đóng: rủi ro không còn.

## 2. Bảng tổng hợp

| ID | Rủi ro | Loại | P | I | Điểm | Ưu tiên | Chiến lược | Phụ trách | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| R1 | VPS thiếu RAM, MongoDB bị tắt / web chậm | Kỹ thuật | 5 | 5 | 25 | 🔴 Cao | Giảm thiểu + chuyển giao | An Đức Mạnh | Đang xử lý |
| R2 | Bí mật (mật khẩu, khóa) vô tình bị đưa lên GitHub | Kỹ thuật | 4 | 4 | 16 | 🔴 Cao | Giảm thiểu | An Đức Mạnh | Đang xử lý |
| R3 | Bán quá số suất khi nhiều khách đặt cùng lúc | Sản phẩm | 4 | 4 | 16 | 🔴 Cao | Giảm thiểu | An Đức Mạnh | Đã kiểm soát |
| R4 | Sai lệch tiền: giá đơn, hoa hồng, số dư ví | Sản phẩm | 3 | 5 | 15 | 🔴 Cao | Giảm thiểu | An Đức Mạnh | Đã kiểm soát |
| R5 | Khách chuyển khoản nhưng đơn không được xác nhận | Sản phẩm | 3 | 4 | 12 | 🟠 TB | Giảm thiểu + chấp nhận | An Đức Mạnh | Đã kiểm soát |
| R6 | Chủ quán nhầm giờ mở cửa (SA/CH), quán đóng ngoài ý muốn | Sản phẩm | 4 | 3 | 12 | 🟠 TB | Giảm thiểu | Lương Minh Khánh | Mở |
| R7 | Kiến thức và khối lượng code dồn vào một người | Con người | 4 | 5 | 20 | 🔴 Cao | Giảm thiểu | An Đức Mạnh | Đang xử lý |
| R8 | Phình phạm vi, không kịp hoàn thiện MVP | Phạm vi | 4 | 4 | 16 | 🔴 Cao | Né tránh + giảm thiểu | Trương An | Đang xử lý |
| R9 | Thành viên vắng vì lý do cá nhân, sprint bị trễ | Con người | 3 | 3 | 9 | 🟠 TB | Chấp nhận + giảm thiểu | Trương An | Mở |
| R10 | Tài liệu không khớp với code | Phạm vi | 3 | 2 | 6 | 🟢 Thấp | Giảm thiểu | Trương An | Đã kiểm soát |

Có 6 rủi ro sản phẩm / kỹ thuật (R1–R6) và 4 rủi ro con người / phạm vi (R7–R10).

## 3. Chi tiết từng rủi ro

### R1 — VPS thiếu RAM 🔴 (25)
- **Nguyên nhân:**
  - VPS dùng chung của phòng lab được ghi 4GB RAM, nhưng bên trong máy chỉ có ~331MB (giảm dần từ 462MB). Nhiều khả năng máy chủ thu bớt RAM để chia cho nhóm khác.
  - Riêng MongoDB cần ~145MB, cộng thêm backend Node.js và hệ điều hành.
- **Sự kiện có thể xảy ra:** hết RAM, hệ thống tắt MongoDB (OOM kill) hoặc đẩy dữ liệu xuống swap trên ổ đĩa.
- **Hậu quả:**
  - Web không đặt được đơn ("Máy chủ gặp sự cố"), hoặc API mất trên 3 giây.
- **Đã xảy ra:** 12/10/2026 — MongoDB bị OOM kill; API đo được 3,2 giây.
- **Hành động:**
  1. ✅ Thêm swap, giới hạn bộ đệm MongoDB (`cacheSizeGB: 0.25`), tắt các dịch vụ hệ thống không cần.
  2. ✅ Không build frontend trên VPS nữa; build trên máy cá nhân rồi chép thư mục `dist`.
  3. ⬜ *Chuyển giao:* báo người quản lý lab, kèm bằng chứng 
  4. ⬜ Tính toán phương án chuyển sang những cơ sở dữ liệu nhẹ hơn
  5. ✅ Dự phòng cho buổi demo: chạy bản trên máy cá nhân (`localhost`) với dữ liệu mẫu `npm run seed:demo`.
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đang xử lý

### R2 — Lộ bí mật lên GitHub 🔴 (16)
- **Nguyên nhân:** nhiều người cùng cấu hình môi trường, dễ chép nhầm giá trị thật từ `.env` vào `.env.example` (file được commit), hoặc dán mật khẩu vào nhóm chat.
- **Sự kiện có thể xảy ra:** mật khẩu ứng dụng Gmail, `JWT_SECRET`, khóa SePay bị đẩy lên repository.
- **Hậu quả:**
  - Người ngoài dùng Gmail của nhóm để gửi thư rác.
  - Người ngoài giả token đăng nhập, hoặc giả webhook thanh toán để xác nhận đơn không trả tiền.
- **Đã xảy ra:** mật khẩu ứng dụng Gmail từng nằm trong `backend/.env.example` trên GitHub (phát hiện 11/10/2026).
- **Hành động:**
  1. ✅ Thay giá trị thật trong `.env.example` bằng ô trống. `.env` và `backend/uploads/` nằm trong `.gitignore`.
  2. ⬜ Thu hồi mật khẩu ứng dụng Gmail cũ và tạo mật khẩu mới, chỉ điền vào `.env`. Commit cũ vẫn còn trong lịch sử git.
  3. ✅ Server từ chối khởi động nếu `JWT_SECRET` ngắn hơn 32 ký tự hoặc còn chữ "change-me". Webhook SePay so khóa bằng `timingSafeEqual`.
  4. ⬜ Bật *Secret scanning* của GitHub. Thêm mục "không có bí mật trong diff" vào checklist review Pull Request.
- **Phụ trách:** An Đức Mạnh 
- **Trạng thái:** Đang xử lý

### R3 — Bán quá số suất 🔴 (16)
- **Nguyên nhân:** món có giới hạn suất/ngày (ví dụ 10 suất), và giờ trưa nhiều sinh viên đặt cùng lúc.
- **Sự kiện có thể xảy ra:** hai request cùng đọc "còn 1 suất" rồi cùng trừ, tạo ra 2 đơn cho 1 suất.
- **Hậu quả:** quán phải hủy đơn đã nhận, khách mất lòng tin, đánh giá xấu.
- **Hành động:**
  1. ✅ Trừ suất nguyên tử (`updateOne` có điều kiện `soldToday + qty <= dailyLimit`) trong transaction MongoDB.
  2. ✅ Idempotency-Key chống bấm "Đặt món" hai lần.
  3. ✅ Test tự động: *5 khách tranh suất cuối → 1 thành công, 4 nhận 409* (`backend/tests/order/order.test.js`).
- **Phụ trách:** An Đức Mạnh
- **Trạng thái:** Đã kiểm soát

### R4 — Sai lệch tiền 🔴 (15)
- **Nguyên nhân:**
  - Client có thể gửi giá tùy ý.
  - Số thực gây sai số làm tròn.
  - Ví đối soát có nhiều luồng tiền: hoa hồng, voucher, nạp, rút, hoàn tiền.
- **Sự kiện có thể xảy ra:** đơn tính sai tổng tiền, ví quán bị trừ / cộng sai, tiền "biến mất" trong sổ.
- **Hậu quả:** thiệt hại tiền thật cho quán hoặc nền tảng, khiếu nại, mất uy tín.
- **Hành động:**
  1. ✅ Server tự tính giá từ thực đơn, không nhận giá từ client (BR-31). Mọi số tiền là số nguyên VND (BR-50).
  2. ✅ Ví dùng sổ cái kép, chỉ ghi thêm. Mỗi bút toán có tổng bằng 0, và có `ref` riêng để chống ghi trùng.
  3. ✅ Trang admin có ô "Đối soát sổ cái" báo ✓/✗. Test kiểm tra tổng số dư bằng 0 qua mọi tình huống (`tests/wallet`, `tests/payment`).
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đã kiểm soát

### R5 — Chuyển khoản không được xác nhận 🟠 (12)
- **Nguyên nhân:**
  - Xác nhận tự động phụ thuộc webhook SePay.
  - Địa chỉ Cloudflare Quick Tunnel đổi mỗi lần khởi động lại.
  - Tài khoản SePay chưa liên kết.
- **Sự kiện có thể xảy ra:** khách đã chuyển tiền nhưng webhook không tới backend, đơn tự hủy sau 15 phút.
- **Hậu quả:** khách mất tiền tạm thời, phải hoàn tiền tay, khiếu nại.
- **Hành động:**
  1. ✅ Chỉ hiện lựa chọn chuyển khoản khi đã cấu hình đủ tài khoản nhận và khóa SePay. Hiện đang tắt trên VPS.
  2. ✅ Tiền về muộn / thiếu / thừa / trùng tự tạo lệnh hoàn tiền. Admin có tab "Hoàn tiền" và "Giao dịch ngân hàng" để xử lý.
  3. ✅ Demo bằng `npm run sepay:pay` (giả lập ngân hàng), không chuyển tiền thật.
  4. ⬜ Dùng tên miền cố định (Cloudflare Named Tunnel) trước khi bật thanh toán thật.
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đã kiểm soát (thanh toán thật đang tắt)

### R6 — Nhầm giờ mở cửa SA/CH 🟠 (12)
- **Nguyên nhân:** ô chọn giờ hiển thị kiểu 12 giờ theo ngôn ngữ máy ("12:00 CH" là 12 giờ **trưa**). Trang khách chỉ ghi chung "Tạm nghỉ", không nói lý do.
- **Sự kiện có thể xảy ra:** chủ quán đặt giờ đóng là 12:00 CH vì tưởng là nửa đêm, và quán đóng từ trưa.
- **Hậu quả:** khách không đặt được đơn dù quán vẫn mở thật, quán mất doanh thu, nhóm mất thời gian dò lỗi.
- **Đã xảy ra:** 2 lần trong lúc test (11/10 và 12/10/2026).
- **Hành động:**
  1. ⬜ Hiện kèm giờ 24h cạnh ô nhập ("đóng lúc 12:00 trưa") và cảnh báo khi giờ đóng sớm bất thường.
  2. ⬜ Trang khách ghi rõ lý do: "Ngoài giờ mở cửa · mở lại lúc 06:00", "Quán tạm ngưng nhận đơn".
  3. ✅ Ghi vào tài liệu hướng dẫn chạy (bảng lỗi hay gặp).
- **Phụ trách:** Lương Minh Khánh, Trương An
- **Trạng thái:** Mở

### R7 — Kiến thức dồn vào một người 🔴 (20)
- **Nguyên nhân:**
  - Phần lớn code backend và frontend do một thành viên viết.
  - Hai thành viên còn lại chưa chạy dự án trên máy và chưa đọc code.
- **Sự kiện có thể xảy ra:** người đó ốm, bận thi, hoặc mất máy đúng tuần cuối. Khi vấn đáp, giảng viên hỏi thành viên khác về code.
- **Hậu quả:** dự án đứng; thành viên không trả lời được khi bảo vệ; điểm cá nhân thấp.
- **Hành động:**
  1. ✅ Tài liệu "Hướng dẫn chạy MAK Food trên máy" để mọi thành viên tự chạy được dự án.
  2. ⬜ Từ Sprint 1, Lương Minh Khánh nhận các việc frontend (R6, giao diện voucher). Mọi Pull Request phải có **1 người khác review** trước khi merge.
  3. ⬜ Mỗi thành viên tự demo được trọn luồng nghiệm thu trước 30/10/2026.
  4. ⬜ Buổi đọc code 1 giờ mỗi tuần: người viết giải thích module mình làm.
- **Phụ trách:** An Đức Mạnh (Scrum Master) · 
- **Trạng thái:** Đang xử lý

### R8 — Phình phạm vi 🔴 (16)
- **Nguyên nhân:** trong lúc làm, nhóm liên tục thêm tính năng ngoài kế hoạch MVP: OTP email, ví đối soát, thanh toán VietQR + SePay.
- **Sự kiện có thể xảy ra:** thời gian dành cho các việc bắt buộc của MVP (voucher, kiểm thử toàn luồng, báo cáo) bị cắt.
- **Hậu quả:** tới 02/11/2026 MVP vẫn thiếu voucher, chưa kiểm thử đủ, báo cáo làm vội.
- **Hành động:**
  1. ✅ Product Owner quản lý Product Backlog (`docs/scrum.md`); mọi tính năng mới phải qua Sprint Planning.
  2. ⬜ *Né tránh:* đóng băng tính năng mới từ 26/10/2026. Sau mốc này chỉ sửa lỗi, kiểm thử, viết báo cáo.
  3. ⬜ Ưu tiên Sprint 1: voucher → kiểm thử luồng nghiệm thu → báo cáo. Tính năng ngoài MVP để sau.
- **Phụ trách:** Trương An (Product Owner) · **Trạng thái:** Đang xử lý

### R9 — Thành viên vắng vì lý do cá nhân 🟠 (9)
- **Nguyên nhân:** cả 3 thành viên học song song nhiều môn, thực tập, lịch trùng với các sprint cuối.
- **Sự kiện có thể xảy ra:** một thành viên không làm được việc của mình trong 3–5 ngày.
- **Hậu quả:** hạng mục trong sprint bị trễ, dồn việc vào tuần cuối.
- **Hành động:**
  1. ⬜ Mỗi người báo lịch của mình ở Sprint Planning; không giao việc lớn vào tuần thi của người đó.
  2. ⬜ Daily Scrum qua nhóm chat để phát hiện trễ sớm.
  3. ⬜ Giữ 3 ngày đệm cuối (30/10–02/11/2026) không xếp việc mới.
- **Phụ trách:**: cả nhóm  
- **Trạng thái:** Mở

### R10 — Tài liệu không khớp với code 🟢 (6)
- **Nguyên nhân:** code thay đổi nhanh, nhiều người sửa.
- **Sự kiện có thể xảy ra:** `docs/API.md`, `docs/database.md` mô tả endpoint hoặc trường dữ liệu đã đổi.
- **Hậu quả:** người khác làm sai theo tài liệu cũ, báo cáo ghi sai.
- **Hành động:**
  1. ✅ Definition of Done yêu cầu cập nhật `docs/` trong cùng Pull Request.
  2. ✅ `docs/project.md` mục 11 ghi nhật ký tiến độ từng bước, kèm số test.
- **Phụ trách:** Trương An · 
- **Trạng thái:** Đã kiểm soát

## 4. Theo dõi
- Rà soát bảng này ở mỗi Sprint Review: chấm lại P/I sau khi có biện pháp, cập nhật trạng thái, thêm rủi ro mới.
- Rủi ro mức 🔴 Cao được nhắc trong Daily Scrum cho tới khi chuyển sang "Đã kiểm soát".
