# Rủi ro xác định — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 27/10/2026. Hạn MVP: 02/11/2026.
> Tài liệu liên quan: [scrum.md](scrum.md) · [QUALITY.md](QUALITY.md) · [project.md](project.md) · [loadtest.md](loadtest.md) (số liệu đo kiểm tải đầy đủ)

## 1. Cách đánh giá

Xác suất (P) và tác động (I) được chấm trước khi có biện pháp kiểm soát.

| Điểm | Xác suất (P) | Tác động (I) |
|---|---|---|
| 1 | Gần như không xảy ra | Không đáng kể, tự khắc phục trong vài phút |
| 2 | Hiếm | Ảnh hưởng nhỏ, sửa trong 1 ngày |
| 3 | Có thể xảy ra | Một chức năng không dùng được, trễ 1–2 ngày |
| 4 | Nhiều khả năng xảy ra | Luồng chính hỏng, sai dữ liệu / tiền, trễ một sprint |
| 5 | Gần như chắc chắn / đã xảy ra | Không demo được, mất dữ liệu / tiền thật, trượt hạn MVP |

**Mức ưu tiên** (theo điểm = P × I):
- **Cao:** từ 15 điểm.
- **Trung bình:** từ 8 đến 14 điểm.
- **Thấp:** dưới 8 điểm.

**Ký hiệu hành động:** (Đã làm) là biện pháp đã có hiệu lực; (Chưa làm) là biện pháp còn phải thực hiện.

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
| R1 | VPS thiếu RAM, MongoDB bị tắt / web chậm | Kỹ thuật | 5 | 5 | 25 | Cao | Giảm thiểu + chuyển giao | An Đức Mạnh | Đang xử lý |
| R2 | Bí mật (mật khẩu, khóa) vô tình bị đưa lên GitHub | Kỹ thuật | 4 | 4 | 16 | Cao | Giảm thiểu | An Đức Mạnh | Đang xử lý |
| R3 | Bán quá số suất khi nhiều khách đặt cùng lúc | Sản phẩm | 4 | 4 | 16 | Cao | Giảm thiểu | An Đức Mạnh | Đã kiểm soát |
| R4 | Sai lệch tiền: giá đơn, hoa hồng, số dư ví | Sản phẩm | 3 | 5 | 15 | Cao | Giảm thiểu | An Đức Mạnh | Đã kiểm soát |
| R5 | Khách chuyển khoản nhưng đơn không được xác nhận | Sản phẩm | 3 | 4 | 12 | Trung bình | Giảm thiểu + chấp nhận | An Đức Mạnh | Đã kiểm soát |
| R6 | Chủ quán nhầm giờ mở cửa (SA/CH), quán đóng ngoài ý muốn | Sản phẩm | 4 | 3 | 12 | Trung bình | Giảm thiểu | Lương Minh Khánh | Mở |
| R7 | Kiến thức và khối lượng code dồn vào một người | Con người | 4 | 5 | 20 | Cao | Giảm thiểu | An Đức Mạnh | Đang xử lý |
| R8 | Phình phạm vi, không kịp hoàn thiện MVP | Phạm vi | 4 | 4 | 16 | Cao | Né tránh + giảm thiểu | Trương An | Đang xử lý |
| R9 | Thành viên vắng vì lý do cá nhân, sprint bị trễ | Con người | 3 | 3 | 9 | Trung bình | Chấp nhận + giảm thiểu | Trương An | Mở |
| R10 | Tài liệu không khớp với code | Phạm vi | 3 | 2 | 6 | Thấp | Giảm thiểu | Trương An | Đã kiểm soát |
| R11 | Nghẽn ghi khi nhiều khách đặt đơn cùng lúc | Kỹ thuật | 4 | 4 | 16 | Cao | Giảm thiểu | An Đức Mạnh | Đã kiểm soát |

Có 7 rủi ro sản phẩm / kỹ thuật (R1–R6, R11) và 4 rủi ro con người / phạm vi (R7–R10).

## 3. Chi tiết từng rủi ro

### R1 — VPS thiếu RAM (mức Cao, 25 điểm)
- **Nguyên nhân:**
  - VPS dùng chung của phòng lab được ghi 4GB RAM, nhưng bên trong máy chỉ có ~331MB (giảm dần từ 462MB). Nhiều khả năng máy chủ thu bớt RAM để chia cho nhóm khác.
  - Riêng MongoDB cần ~145MB, cộng thêm backend Node.js và hệ điều hành.
- **Sự kiện có thể xảy ra:** hết RAM, hệ thống tắt MongoDB (OOM kill) hoặc đẩy dữ liệu xuống swap trên ổ đĩa.
- **Hậu quả:**
  - Web không đặt được đơn ("Máy chủ gặp sự cố"), hoặc API mất trên 3 giây.
- **Đã xảy ra:**
  - 12/10/2026: MongoDB bị OOM kill; API đo được 3,2 giây.
  - 21/10/2026: RAM dùng 96%, MongoDB chỉ còn khoảng 25 MB trong RAM và khoảng 126 MB nằm trong swap; backend đã khởi động lại 239 lần (pm2).
- **Đo kiểm tải 27/10/2026** (`npm run loadtest:orders`, chạy ngay trên VPS, 100 request/phút trong 1 phút, trọn vòng đời đơn: xem trước, đặt đơn, quán nhận, đi giao, đã giao, khách xem lại):

  | Chỉ số | VPS | Cùng code trên máy cá nhân |
  |---|---|---|
  | Thông lượng đạt được | 57 request/phút (mục tiêu 100) | khoảng 100 request/phút |
  | Đặt đơn: p50 / p95 | 114 giây / 133 giây | 43 ms / 92 ms |
  | Xem trước đơn: p50 | 8,6 giây | 9 ms |
  | Quán nhận / đi giao / đã giao: p50 | khoảng 9 giây | 30–40 ms |
  | Khách xem lại đơn (chỉ đọc): p50 | 3,5 giây | 6 ms |
  | Lỗi | 16/206 request (7,8%), đều là 500 khi đặt đơn | 0 |
  | Trọn vòng đời 1 đơn: p50 | 118 giây | 3 giây |

  Kết luận: sức chịu thực tế của VPS chỉ khoảng 30–50 request/phút cho luồng đặt đơn, độ trễ vượt xa mức chấp nhận được (QUALITY.md). Cùng code chạy trên máy cá nhân nhanh hơn hàng nghìn lần, nên nguyên nhân là tài nguyên của VPS. Lỗi 500 khi đặt đơn được tách thành rủi ro R11.
- **Đo lại 27/10/2026 sau khi sửa R11** (1 quán × 5 món, trừ dòng ghi "1 món"; mỗi lần 1 phút; backend không khởi động lại lần nào, pm2 giữ 240 lần):

  | Mức tải | Đặt đơn p50 / p95 | Tất cả request p95 | Đơn trọn vòng đời | Lỗi |
  |---|---|---|---|---|
  | 20 request/phút | 0,79 / 0,86 giây | 0,88 giây | 4/4 | 0 |
  | 40 request/phút | 0,72 / 1,58 giây | 1,24 giây | 7/7 | 0 |
  | 60 request/phút | 0,85 / 1,66 giây | 1,31 giây | 10/10 | 0 |
  | 60 request/phút, 1 món (xấu nhất) | 0,97 / 2,45 giây | 1,72 giây | 11/11 | 0 |

  Kết luận: VPS chịu được khoảng 60 request/phút (khoảng 10 đơn/phút trọn vòng đời) với p95 đặt đơn dưới 2 giây khi đơn chia ra nhiều món. Ngay cả ở 20 request/phút, mỗi request vẫn mất 0,4–0,9 giây, chậm hơn máy cá nhân 10–20 lần. Chưa đo lại mức 100 request/phút.
- **Bằng chứng do swap** (`vmstat 5` trong lúc test): cột `si`/`so` 11–81 MB/giây liên tục, CPU chờ ổ đĩa (`wa`) 14–54% trong khi CPU dùng thật (`us`) chỉ 1–9%. Đáng chú ý, cột `free` vẫn còn khoảng 105–125 MB trống mà hệ thống vẫn swap mạnh, khớp với giả thuyết các tiến trình bị giới hạn bộ nhớ riêng khi khởi động từ phiên SSH của lab (xem phát hiện bên dưới).
- **Phát hiện thêm (21/10/2026):** vào VPS qua cổng SSH của lab (`ssh-lab.bcse-vju.com`) chỉ thấy khoảng 331 MB RAM, trong khi vào cùng máy bằng cách khác thấy 1,9 GB. Nhiều khả năng phiên SSH (và pm2 khởi động từ phiên đó) bị giới hạn bộ nhớ. Đang thu thập `hostname`, `MemTotal`, cgroup ở cả hai nơi để gửi lab.
- **Hành động:**
  1. (Đã làm) Thêm swap, giới hạn bộ đệm MongoDB (`cacheSizeGB: 0.25`), tắt các dịch vụ hệ thống không cần.
  2. (Đã làm) Không build frontend trên VPS nữa; build trên máy cá nhân rồi chép thư mục `dist`.
  3. (Chưa làm) *Chuyển giao:* báo người quản lý lab, kèm bằng chứng: bảng đo kiểm tải ở trên, kết quả `free -h`, `vmstat`, và so sánh bộ nhớ khi vào qua cổng SSH với cách vào khác.
  4. (Chưa làm) Tính toán phương án chuyển sang những cơ sở dữ liệu nhẹ hơn
  5. (Đã làm) Dự phòng cho buổi demo: chạy bản trên máy cá nhân (`localhost`) với dữ liệu mẫu `npm run seed:demo`.
  6. (Đã làm) Script đo kiểm tải `npm run loadtest:orders` (nhịp request, số quán / món tùy chỉnh, in độ trễ p50/p90/p95/p99 từng bước, `--cleanup` xóa dữ liệu test).
  7. (Đã làm) Đo lại sau khi sửa R11 ở 20, 40, 60 request/phút (bảng ở trên): mức tải cao nhất đạt yêu cầu hiện là khoảng 60 request/phút.
  8. (Chưa làm) Đo lại mức 100 request/phút và sau mỗi thay đổi hạ tầng (tăng RAM, chuyển MongoDB sang Atlas) để so sánh.
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đang xử lý

### R2 — Lộ bí mật lên GitHub (mức Cao, 16 điểm)
- **Nguyên nhân:** nhiều người cùng cấu hình môi trường, dễ chép nhầm giá trị thật từ `.env` vào `.env.example` (file được commit), hoặc dán mật khẩu vào nhóm chat.
- **Sự kiện có thể xảy ra:** mật khẩu ứng dụng Gmail, `JWT_SECRET`, khóa SePay bị đẩy lên repository.
- **Hậu quả:**
  - Người ngoài dùng Gmail của nhóm để gửi thư rác.
  - Người ngoài giả token đăng nhập, hoặc giả webhook thanh toán để xác nhận đơn không trả tiền.
- **Đã xảy ra:** mật khẩu ứng dụng Gmail từng nằm trong `backend/.env.example` trên GitHub (phát hiện 11/10/2026).
- **Hành động:**
  1. (Đã làm) Thay giá trị thật trong `.env.example` bằng ô trống. `.env` và `backend/uploads/` nằm trong `.gitignore`.
  2. (Chưa làm) Thu hồi mật khẩu ứng dụng Gmail cũ và tạo mật khẩu mới, chỉ điền vào `.env`. Commit cũ vẫn còn trong lịch sử git.
  3. (Đã làm) Server từ chối khởi động nếu `JWT_SECRET` ngắn hơn 32 ký tự hoặc còn chữ "change-me". Webhook SePay so khóa bằng `timingSafeEqual`.
  4. (Chưa làm) Bật *Secret scanning* của GitHub. Thêm mục "không có bí mật trong diff" vào checklist review Pull Request.
- **Phụ trách:** An Đức Mạnh 
- **Trạng thái:** Đang xử lý

### R3 — Bán quá số suất (mức Cao, 16 điểm)
- **Nguyên nhân:** món có giới hạn suất/ngày (ví dụ 10 suất), và giờ trưa nhiều sinh viên đặt cùng lúc.
- **Sự kiện có thể xảy ra:** hai request cùng đọc "còn 1 suất" rồi cùng trừ, tạo ra 2 đơn cho 1 suất.
- **Hậu quả:** quán phải hủy đơn đã nhận, khách mất lòng tin, đánh giá xấu.
- **Hành động:**
  1. (Đã làm) Trừ suất nguyên tử (`updateOne` có điều kiện `soldToday + qty <= dailyLimit`) trong transaction MongoDB.
  2. (Đã làm) Idempotency-Key chống bấm "Đặt món" hai lần.
  3. (Đã làm) Test tự động: *5 khách tranh suất cuối → 1 thành công, 4 nhận 409* (`backend/tests/order/order.test.js`).
- **Phụ trách:** An Đức Mạnh
- **Trạng thái:** Đã kiểm soát

### R4 — Sai lệch tiền (mức Cao, 15 điểm)
- **Nguyên nhân:**
  - Client có thể gửi giá tùy ý.
  - Số thực gây sai số làm tròn.
  - Ví đối soát có nhiều luồng tiền: hoa hồng, voucher, nạp, rút, hoàn tiền.
- **Sự kiện có thể xảy ra:** đơn tính sai tổng tiền, ví quán bị trừ / cộng sai, tiền "biến mất" trong sổ.
- **Hậu quả:** thiệt hại tiền thật cho quán hoặc nền tảng, khiếu nại, mất uy tín.
- **Hành động:**
  1. (Đã làm) Server tự tính giá từ thực đơn, không nhận giá từ client (BR-31). Mọi số tiền là số nguyên VND (BR-50).
  2. (Đã làm) Ví dùng sổ cái kép, chỉ ghi thêm. Mỗi bút toán có tổng bằng 0, và có `ref` riêng để chống ghi trùng.
  3. (Đã làm) Trang admin có ô "Đối soát sổ cái" báo "Cân bằng" hoặc "Lệch". Test kiểm tra tổng số dư bằng 0 qua mọi tình huống (`tests/wallet`, `tests/payment`).
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đã kiểm soát

### R5 — Chuyển khoản không được xác nhận (mức Trung bình, 12 điểm)
- **Nguyên nhân:**
  - Xác nhận tự động phụ thuộc webhook SePay.
  - Địa chỉ Cloudflare Quick Tunnel đổi mỗi lần khởi động lại.
  - Tài khoản SePay chưa liên kết.
- **Sự kiện có thể xảy ra:** khách đã chuyển tiền nhưng webhook không tới backend, đơn tự hủy sau 15 phút.
- **Hậu quả:** khách mất tiền tạm thời, phải hoàn tiền tay, khiếu nại.
- **Hành động:**
  1. (Đã làm) Chỉ hiện lựa chọn chuyển khoản khi đã cấu hình đủ tài khoản nhận và khóa SePay. Hiện đang tắt trên VPS.
  2. (Đã làm) Tiền về muộn / thiếu / thừa / trùng tự tạo lệnh hoàn tiền. Admin có tab "Hoàn tiền" và "Giao dịch ngân hàng" để xử lý.
  3. (Đã làm) Demo bằng `npm run sepay:pay` (giả lập ngân hàng), không chuyển tiền thật.
  4. (Chưa làm) Dùng tên miền cố định (Cloudflare Named Tunnel) trước khi bật thanh toán thật.
- **Phụ trách:** An Đức Mạnh · 
- **Trạng thái:** Đã kiểm soát (thanh toán thật đang tắt)

### R6 — Nhầm giờ mở cửa SA/CH (mức Trung bình, 12 điểm)
- **Nguyên nhân:** ô chọn giờ hiển thị kiểu 12 giờ theo ngôn ngữ máy ("12:00 CH" là 12 giờ **trưa**). Trang khách chỉ ghi chung "Tạm nghỉ", không nói lý do.
- **Sự kiện có thể xảy ra:** chủ quán đặt giờ đóng là 12:00 CH vì tưởng là nửa đêm, và quán đóng từ trưa.
- **Hậu quả:** khách không đặt được đơn dù quán vẫn mở thật, quán mất doanh thu, nhóm mất thời gian dò lỗi.
- **Đã xảy ra:** 2 lần trong lúc test (11/10 và 12/10/2026).
- **Hành động:**
  1. (Chưa làm) Hiện kèm giờ 24h cạnh ô nhập ("đóng lúc 12:00 trưa") và cảnh báo khi giờ đóng sớm bất thường.
  2. (Chưa làm) Trang khách ghi rõ lý do: "Ngoài giờ mở cửa · mở lại lúc 06:00", "Quán tạm ngưng nhận đơn".
  3. (Đã làm) Ghi vào tài liệu hướng dẫn chạy (bảng lỗi hay gặp).
- **Phụ trách:** Lương Minh Khánh, Trương An
- **Trạng thái:** Mở

### R7 — Kiến thức dồn vào một người (mức Cao, 20 điểm)
- **Nguyên nhân:**
  - Phần lớn code backend và frontend do một thành viên viết.
  - Hai thành viên còn lại chưa chạy dự án trên máy và chưa đọc code.
- **Sự kiện có thể xảy ra:** người đó ốm, bận thi, hoặc mất máy đúng tuần cuối. Khi vấn đáp, giảng viên hỏi thành viên khác về code.
- **Hậu quả:** dự án đứng; thành viên không trả lời được khi bảo vệ; điểm cá nhân thấp.
- **Hành động:**
  1. (Đã làm) Tài liệu "Hướng dẫn chạy MAK Food trên máy" để mọi thành viên tự chạy được dự án.
  2. (Chưa làm) Từ Sprint 1, Lương Minh Khánh nhận các việc frontend (R6, giao diện voucher). Mọi Pull Request phải có **1 người khác review** trước khi merge.
  3. (Chưa làm) Mỗi thành viên tự demo được trọn luồng nghiệm thu trước 30/10/2026.
  4. (Chưa làm) Buổi đọc code 1 giờ mỗi tuần: người viết giải thích module mình làm.
- **Phụ trách:** An Đức Mạnh (Scrum Master) · 
- **Trạng thái:** Đang xử lý

### R8 — Phình phạm vi (mức Cao, 16 điểm)
- **Nguyên nhân:** trong lúc làm, nhóm liên tục thêm tính năng ngoài kế hoạch MVP: OTP email, ví đối soát, thanh toán VietQR + SePay.
- **Sự kiện có thể xảy ra:** thời gian dành cho các việc bắt buộc của MVP (voucher, kiểm thử toàn luồng, báo cáo) bị cắt.
- **Hậu quả:** tới 02/11/2026 MVP vẫn thiếu voucher, chưa kiểm thử đủ, báo cáo làm vội.
- **Hành động:**
  1. (Đã làm) Product Owner quản lý Product Backlog (`docs/scrum.md`); mọi tính năng mới phải qua Sprint Planning.
  2. (Chưa làm) *Né tránh:* đóng băng tính năng mới từ 26/10/2026. Sau mốc này chỉ sửa lỗi, kiểm thử, viết báo cáo.
  3. (Chưa làm) Ưu tiên Sprint 1: voucher → kiểm thử luồng nghiệm thu → báo cáo. Tính năng ngoài MVP để sau.
- **Phụ trách:** Trương An (Product Owner) · **Trạng thái:** Đang xử lý

### R9 — Thành viên vắng vì lý do cá nhân (mức Trung bình, 9 điểm)
- **Nguyên nhân:** cả 3 thành viên học song song nhiều môn, thực tập, lịch trùng với các sprint cuối.
- **Sự kiện có thể xảy ra:** một thành viên không làm được việc của mình trong 3–5 ngày.
- **Hậu quả:** hạng mục trong sprint bị trễ, dồn việc vào tuần cuối.
- **Hành động:**
  1. (Chưa làm) Mỗi người báo lịch của mình ở Sprint Planning; không giao việc lớn vào tuần thi của người đó.
  2. (Chưa làm) Daily Scrum qua nhóm chat để phát hiện trễ sớm.
  3. (Chưa làm) Giữ 3 ngày đệm cuối (30/10–02/11/2026) không xếp việc mới.
- **Phụ trách:**: cả nhóm  
- **Trạng thái:** Mở

### R10 — Tài liệu không khớp với code (mức Thấp, 6 điểm)
- **Nguyên nhân:** code thay đổi nhanh, nhiều người sửa.
- **Sự kiện có thể xảy ra:** `docs/API.md`, `docs/database.md` mô tả endpoint hoặc trường dữ liệu đã đổi.
- **Hậu quả:** người khác làm sai theo tài liệu cũ, báo cáo ghi sai.
- **Hành động:**
  1. (Đã làm) Definition of Done yêu cầu cập nhật `docs/` trong cùng Pull Request.
  2. (Đã làm) `docs/project.md` mục 11 ghi nhật ký tiến độ từng bước, kèm số test.
- **Phụ trách:** Trương An · 
- **Trạng thái:** Đã kiểm soát

### R11 — Nghẽn ghi khi nhiều khách đặt đơn cùng lúc (mức Cao, 16 điểm)
- **Nguyên nhân:**
  - Mỗi lần đặt đơn, trong cùng một transaction MongoDB, backend sửa chung một số bản ghi: bộ đếm mã đơn của ngày (mọi đơn trên toàn hệ thống cùng sửa) và số suất của món.
  - MongoDB chỉ cho một transaction sửa một bản ghi tại một thời điểm; các transaction còn lại bị xung đột ghi (`WriteConflict`) và phải chạy lại.
- **Sự kiện có thể xảy ra:** giờ cao điểm nhiều khách đặt cùng lúc, các transaction xếp hàng chạy lại; trên máy chậm (R1) mỗi lần chạy lại càng lâu.
- **Hậu quả:** đặt đơn mất hàng chục tới hàng trăm giây, một phần đơn thất bại với lỗi 500 "Máy chủ gặp sự cố"; khách bấm đặt lại nhiều lần.
- **Đã xảy ra:** đo kiểm tải 27/10/2026 trên VPS: 16/45 đơn thất bại khi đặt (HTTP 500), log backend ghi `WriteConflict` / `TransientTransactionError`. Bài test dồn mọi đơn vào cùng 1 món nên là trường hợp xấu nhất.
- **Hành động:**
  1. (Đã làm) Lấy số thứ tự mã đơn **trước** transaction đặt đơn (tăng nguyên tử, không trùng mã), nên các đơn đặt đồng thời không còn tranh bộ đếm. Đánh đổi: đơn đặt thất bại (hết suất, sai voucher...) làm mã đơn nhảy số, vd có 0005 và 0007 nhưng không có 0006.
  2. (Đã làm) Xung đột ghi còn sót lại sau khi transaction đã tự chạy lại trả **409 SYSTEM_BUSY** ("Hệ thống đang bận, vui lòng bấm thử lại") thay cho lỗi 500. Đặt đơn có Idempotency-Key nên bấm lại không tạo đơn trùng.
  3. (Đã làm) Script đo kiểm tải có tùy chọn nhiều quán, nhiều món (`--shops`, `--items`, mặc định 1 quán × 5 món) để đo sát thực tế; `--items=1` để thử trường hợp xấu nhất.
  4. (Đã làm) Test tự động cho việc ánh xạ lỗi xung đột ghi (`backend/tests/utils/error-middleware.test.js`).
  5. (Đã làm) Đo lại trên VPS 27/10/2026: 20, 40, 60 request/phút và 60 request/phút dồn vào 1 món đều 0 lỗi, 32/32 đơn trọn vòng đời; đặt đơn p95 từ 0,86 đến 2,45 giây (trước khi sửa: 114 giây p50, 7,8% lỗi 500). Số liệu chi tiết ở R1.
  6. Chấp nhận: số suất của **cùng một món** vẫn là bản ghi dùng chung. Đây là điều kiện cần để không bán quá suất (R3); nhiều khách tranh đúng một món thì vẫn phải xếp hàng.
- **Phụ trách:** An Đức Mạnh
- **Trạng thái:** Đã kiểm soát

## 4. Theo dõi
- Rà soát bảng này ở mỗi Sprint Review: chấm lại P/I sau khi có biện pháp, cập nhật trạng thái, thêm rủi ro mới.
- Rủi ro mức Cao được nhắc trong Daily Scrum cho tới khi chuyển sang "Đã kiểm soát".
