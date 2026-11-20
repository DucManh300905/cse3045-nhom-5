# Project Charter — MAK Food and Drink

> Nhóm 5, CSE3045 — Học theo dự án Khoa học và Kỹ thuật, Trường Đại học Việt Nhật. Cập nhật: 20/11/2026.
> Tài liệu này chốt **đề tài chính thức** và hoàn thiện bản mô tả dự án sơ bộ trong README. Chi tiết nằm ở các tài liệu được dẫn link.

## 1. Thông tin chung

| Mục | Nội dung |
|---|---|
| Tên dự án | **MAK Food and Drink** — Website đặt đồ ăn online cho các hàng ăn khu vực Hòa Lạc |
| Nhóm | Nhóm 5: An Đức Mạnh (23110310), Trương An (23110142), Lương Minh Khánh (23110181) |
| Người bảo trợ / nghiệm thu | Giảng viên học phần CSE3045 ([STAKEHOLDERS.md](STAKEHOLDERS.md) SH-01) |
| Product Owner | Lương Minh Khánh |
| Scrum Master, điều phối Sprint 0–1 | An Đức Mạnh |
| Mã nguồn | https://github.com/DucManh300905/cse3045-nhom-5 |
| Bản chạy thử | https://sv22.bcse-vju.com |
| Phiên bản hiện tại | `v0.1.0` (12/11/2026) |

## 2. Bối cảnh và vấn đề

Hòa Lạc sắp có nhiều trường đại học chuyển tới, nhưng các nền tảng giao đồ ăn như Grab, Be, Xanh SM chưa phục vụ nhiều ở khu vực này. Sinh viên và người dân khó tìm và đặt món; các hàng ăn nhỏ chưa có kênh nhận đơn trực tuyến.

**Dự án giúp ai, giải quyết việc gì:**
- **Khách hàng (chủ yếu sinh viên):** tìm quán, đặt món, trả tiền mặt hoặc chuyển khoản, theo dõi đơn realtime.
- **Chủ quán:** quản lý quán và thực đơn, nhận đơn có chuông báo, xem doanh thu.
- **Quản trị viên:** duyệt quán, giám sát nền tảng.

## 3. Mục tiêu

| # | Mục tiêu | Đo bằng | Hạn |
|---|---|---|---|
| O1 | Có bản MVP chạy trọn vòng một đơn: khách đặt → quán nhận → giao → hoàn thành | Pass đủ 7 luồng nghiệm thu ([project.md](project.md) mục 9) | 02/11/2026 |
| O2 | Bản chạy công khai trên VPS lab | Mở được `https://sv22.bcse-vju.com` từ thiết bị khác | 02/11/2026 |
| O3 | Hệ thống chịu tải tối thiểu của một khu vực nhỏ | Bước "Đặt đơn" p95 < 2 giây ở mức ≥ 60 request/phút ([SPRINT0-REPORT.md](SPRINT0-REPORT.md) S1-1) | Sprint 1 |
| O4 | Chất lượng code được kiểm soát tự động | Mọi PR vào `develop` có CI xanh (test backend, test frontend, build) | Liên tục |
| O5 | Mỗi thành viên hiểu và tự demo được sản phẩm | Cả 3 người tự demo trọn luồng nghiệm thu (S1-6) | 30/10/2026 |

## 4. Phạm vi

**Trong phạm vi** ([project.md](project.md) mục 5, cột "MVP"):
- Tài khoản: đăng ký email / SĐT, OTP email, hồ sơ, sổ địa chỉ, đổi / quên mật khẩu.
- Cửa hàng: hồ sơ quán và quy trình duyệt, giờ mở cửa, bật / tắt nhận đơn, giấy tờ pháp lý.
- Thực đơn: danh mục, món, size, topping, giới hạn suất / ngày, tìm món không dấu.
- Đơn hàng: giỏ 1 quán, giá do server tính, state machine, realtime, tự hủy sau 5 phút, đơn tự lấy.
- Thanh toán: tiền mặt (COD), chuyển khoản VietQR tự xác nhận qua SePay, ví đối soát nội bộ.
- Khuyến mãi: voucher MAK và voucher của quán.
- Đánh giá quán, thông báo trong app, dashboard quán và admin.
- Giao hàng: quán tự giao hoặc tài xế MAK (điều phối, ca làm), bản đồ và quãng đường.

**Ngoài phạm vi:**
- Ví điện tử giữ tiền hộ người dùng (cần giấy phép Ngân hàng Nhà nước — [STAKEHOLDERS.md](STAKEHOLDERS.md) SH-08); cổng VNPay / MoMo / ZaloPay.
- Ứng dụng di động riêng; push FCM, SMS, Zalo.
- Nhân viên quán nhiều vai (RBAC), nhiều chi nhánh cho một chủ.
- Combo, flash sale, quảng cáo trả phí, đơn hẹn giờ, đơn tại bàn QR, hóa đơn VAT.

## 5. Sản phẩm bàn giao

| # | Sản phẩm | Vị trí |
|---|---|---|
| D1 | Mã nguồn backend + frontend | Repo GitHub, nhánh `main` có tag |
| D2 | Bản chạy công khai | `https://sv22.bcse-vju.com` |
| D3 | Tài liệu đặc tả: nghiệp vụ, CSDL, API | [project.md](project.md), [database.md](database.md), [API.md](API.md) |
| D4 | Tài liệu quản lý dự án | [WBS.md](WBS.md), [GANTT.md](GANTT.md), [scrum.md](scrum.md), [TEAM.md](TEAM.md), [RISKS.md](RISKS.md), [STAKEHOLDERS.md](STAKEHOLDERS.md), [CONFIG.md](CONFIG.md), [GIT.md](GIT.md) |
| D5 | Test tự động và CI | `backend/tests/`, `frontend/src/**/*.test.ts`, `.github/workflows/ci.yml` |
| D6 | Slide, kịch bản demo, báo cáo cuối kỳ | [scrum.md](scrum.md) mục 4; S1-7 |

## 6. Mốc chính

| Mốc | Ngày | Trạng thái |
|---|---|---|
| Sprint 0 bắt đầu | 03/10/2026 | ✅ |
| Backend MVP chạy được luồng đặt đơn | 06/10/2026 | ✅ |
| Hạn MVP | 02/11/2026 | 🟡 (7 luồng đã có trên code; kiểm thử thủ công trên VPS ở S1-2) |
| Phát hành `v0.1.0` | 12/11/2026 | ✅ |
| `v0.2.0`: VPS ổn định, kiểm thử thủ công đủ 7 luồng | Cuối Sprint 2 | ⬜ |
| `v1.0.0`: bản nộp cuối kỳ | Buổi bảo vệ | ⬜ |

Tiến độ chi tiết: [GANTT.md](GANTT.md).

## 7. Các bên liên quan

Giảng viên CSE3045 (quản lý sát sao); quản trị hạ tầng lab BCSE-VJU và quy định pháp lý về thanh toán (giữ hài lòng); chủ quán, khách hàng sinh viên, tài xế, nhóm phát triển (giữ cho hiểu rõ); SePay, Goong, Gmail SMTP (theo dõi). Chi tiết và chiến lược ứng xử: [STAKEHOLDERS.md](STAKEHOLDERS.md).

## 8. Ràng buộc

1. **Thời gian:** MVP trước 02/11/2026; Sprint 1 tuần; bản cuối theo lịch học phần.
2. **Nhân lực:** 3 người, mỗi người kiêm nhiều vai ([TEAM.md](TEAM.md)).
3. **Hạ tầng và chi phí:** chạy trên VPS lab được cấp, RAM thấp (chịu khoảng 60 request/phút — [loadtest.md](loadtest.md)); chỉ dùng dịch vụ miễn phí trong hạn mức.
4. **Pháp lý:** không giữ tiền hộ người dùng như ví điện tử; chỉ dùng ví đối soát nội bộ.

## 9. Giả định

- Quy mô ban đầu khoảng 10 quán, dưới 500 đơn / ngày ([project.md](project.md) mục 10).
- Quán tự giao hoặc dùng tài xế MAK; khách được miễn phí giao hàng (chốt 06/10/2026).
- Lab tiếp tục cấp VPS `sv22` cho tới hết học phần.

## 10. Rủi ro chính

| Mã | Rủi ro | Mức |
|---|---|---|
| R1 | VPS thiếu RAM, web chậm | Cao (25) |
| R7 | Kiến thức và khối lượng code dồn vào một người | Cao (20) |
| R2 | Lộ bí mật lên GitHub | Cao (16) |
| R8 | Phình phạm vi, không kịp MVP | Cao (16) |

Danh sách đủ 11 rủi ro và cách xử lý: [RISKS.md](RISKS.md).

## 11. Tiêu chí thành công

Dự án được coi là thành công khi:
1. Giảng viên mở được bản chạy công khai và đi được trọn 7 luồng nghiệm thu.
2. Mọi thay đổi trên `develop` đều qua PR, được review và có CI xanh.
3. Mỗi thành viên tự giải thích và demo được phần mình làm.

## 12. Phê duyệt

| Vai trò | Người | Xác nhận |
|---|---|---|
| Product Owner | Lương Minh Khánh | Duyệt PR chứa tài liệu này |
| Scrum Master | An Đức Mạnh | Duyệt PR chứa tài liệu này |
| Developer | Trương An | Duyệt PR chứa tài liệu này |
| Giảng viên | — | Nhận xét trên LMS |
