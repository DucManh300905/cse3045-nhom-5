# Báo cáo hoàn thiện Sprint 0 — MAK Food and Drink

> Nhóm 5, CSE3045. Ngày báo cáo: 27/10/2026. Người điều phối Sprint 0: An Đức Mạnh.
> Tài liệu liên quan: [scrum.md](scrum.md) (backlog Sprint 0 lập ở Buổi 4) · [TEAM.md](TEAM.md) · [project.md](project.md) · [RISKS.md](RISKS.md)

Repo: https://github.com/DucManh300905/cse3045-nhom-5. Các đường dẫn `PR #n` và mã commit bên dưới đều trỏ vào repo này.

## 1. Tóm tắt

- **Mục tiêu Sprint 0:** có nền tảng kỹ thuật và bản MVP chạy được luồng *khách xem quán → đặt món → quán nhận đơn*.
- **Kết quả:** **đạt.** 11/13 hạng mục xong (32/35 SP), 2 hạng mục đang dở (3 SP), không bỏ hạng mục nào.
- **Ngoài backlog:** trong lúc chạy Sprint 0, nhóm làm thêm nhiều tính năng (voucher, VietQR, tài xế, ca làm…), xem mục 3. Đây cũng là điểm Retro cần rút kinh nghiệm (mục 4).

## 2. Trạng thái từng hạng mục backlog Sprint 0

| # | Hạng mục | R | SP | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| 1 | Chốt phạm vi MVP, 3 vai người dùng, luồng nghiệm thu | Trương An | 3 | Xong | [project.md](project.md) mục 1, 4, 9; thêm vào commit [ca234a5](https://github.com/DucManh300905/cse3045-nhom-5/commit/ca234a5), [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12) |
| 2 | Lập WBS và Gantt cho MVP | Trương An | 2 | Xong | `HW3/WBS food ordering.png`, `HW3/Gantt_MVP_he_thong_dat_mon.xlsx`; commit [7bb619e](https://github.com/DucManh300905/cse3045-nhom-5/commit/7bb619e), vào `develop` qua [PR #11](https://github.com/DucManh300905/cse3045-nhom-5/pull/11) |
| 3 | Repo GitHub, nhánh `main` / `develop` / `feature/*`, làm việc qua PR | Đức Mạnh | 1 | Xong | Nhánh `develop`, `feature/hw1`, `feature/HW4`, `feature/HW5`, `FP/*`; PR đầu tiên [PR #5](https://github.com/DucManh300905/cse3045-nhom-5/pull/5), tới nay đã có 25 PR |
| 4 | Chọn tech stack, khởi tạo backend (Express + MongoDB) và frontend (React + Vite) | Đức Mạnh, Minh Khánh | 2 | Xong | Commit [384eac4](https://github.com/DucManh300905/cse3045-nhom-5/commit/384eac4), [PR #11](https://github.com/DucManh300905/cse3045-nhom-5/pull/11); [project.md](project.md) mục 2 |
| 5 | Thiết kế CSDL: người dùng, quán, thực đơn, đơn hàng | Đức Mạnh | 3 | Xong | [database.md](database.md); commit [ca234a5](https://github.com/DucManh300905/cse3045-nhom-5/commit/ca234a5), [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12) |
| 6 | Đặc tả API và mã lỗi | Đức Mạnh | 3 | Xong | [API.md](API.md); commit [ca234a5](https://github.com/DucManh300905/cse3045-nhom-5/commit/ca234a5), [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12) |
| 7 | Kiểm thử tự động + CI (Jest, GitHub Actions) | Đức Mạnh | 2 | Xong | `.github/workflows/ci.yml` chạy khi push / mở PR vào `develop`; commit [bbb66ba](https://github.com/DucManh300905/cse3045-nhom-5/commit/bbb66ba), [PR #11](https://github.com/DucManh300905/cse3045-nhom-5/pull/11). Hiện có 330 test backend |
| 8 | Phác thảo giao diện khách → giao diện React | Minh Khánh | 5 | Xong | Bản HTML `HW1/index.html` ([PR #5](https://github.com/DucManh300905/cse3045-nhom-5/pull/5)); giao diện React [PR #11](https://github.com/DucManh300905/cse3045-nhom-5/pull/11), [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12) |
| 9 | Đăng ký, đăng nhập theo vai; mật khẩu mã hóa | Mạnh (API), Khánh (giao diện) | 3 | Xong | Module `backend/src/modules/auth`; commit [384eac4](https://github.com/DucManh300905/cse3045-nhom-5/commit/384eac4), [PR #11](https://github.com/DucManh300905/cse3045-nhom-5/pull/11); OTP email [PR #13](https://github.com/DucManh300905/cse3045-nhom-5/pull/13) |
| 10 | Khách xem danh sách quán và thực đơn + dữ liệu mẫu | Mạnh, Khánh | 3 | Xong | `npm run seed:demo` (`backend/src/utils/seedDemo.js`); commit [ca234a5](https://github.com/DucManh300905/cse3045-nhom-5/commit/ca234a5), [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12) |
| 11 | Khách đặt món, trả tiền mặt khi nhận | Mạnh, Khánh | 5 | Xong | Giá do server tính, chặn đặt quá số suất (có test 5 khách tranh 1 suất); [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12). Sửa nghẽn ghi khi tải cao: commit [67412e0](https://github.com/DucManh300905/cse3045-nhom-5/commit/67412e0), [PR #24](https://github.com/DucManh300905/cse3045-nhom-5/pull/24) |
| 12 | Chuẩn bị demo: kịch bản, ảnh chụp, tài khoản demo | Trương An | 1 | **Đang dở** | Đã có kịch bản demo 3 phút và tài khoản demo ([scrum.md](scrum.md) mục 4, [PR #16](https://github.com/DucManh300905/cse3045-nhom-5/pull/16)). **Thiếu:** thư mục `docs/images/` chưa có ảnh; đường link `trycloudflare` trong kịch bản đã cũ, phải đổi sang `https://sv22.bcse-vju.com` |
| 13 | Môi trường chạy thử trên VPS của lab | Đức Mạnh | 2 | **Đang dở** | Đã chạy tại `https://sv22.bcse-vju.com`. Đo tải ([loadtest.md](loadtest.md), [PR #25](https://github.com/DucManh300905/cse3045-nhom-5/pull/25)): chịu khoảng 60 request/phút, chậm hơn máy cá nhân 10–20 lần do thiếu RAM (RISKS R1). **Chưa đạt** "ổn định để demo" |

**Tổng:** 35 SP. Xong 32 SP (91%). Đang dở 3 SP, chuyển sang Sprint 1. Bỏ 0 SP.

## 3. Việc làm thêm ngoài backlog Sprint 0

Các việc này không có trong backlog lập ở Buổi 4 nhưng đã được merge vào `develop`:

| Nội dung | Bằng chứng |
|---|---|
| Kênh chủ quán, trang quản trị, chuông đơn mới realtime | [PR #12](https://github.com/DucManh300905/cse3045-nhom-5/pull/12), [PR #13](https://github.com/DucManh300905/cse3045-nhom-5/pull/13) |
| Ví đối soát, nạp tiền, thanh toán VietQR qua SePay | [PR #14](https://github.com/DucManh300905/cse3045-nhom-5/pull/14), [PR #15](https://github.com/DucManh300905/cse3045-nhom-5/pull/15) |
| Tài liệu Scrum, RISKS, QUALITY (bài tập Buổi 4, 5) | [PR #16](https://github.com/DucManh300905/cse3045-nhom-5/pull/16), [PR #17](https://github.com/DucManh300905/cse3045-nhom-5/pull/17) |
| Voucher MAK và voucher quán, bản đồ và quãng đường (Goong), giờ mở cửa | [PR #18](https://github.com/DucManh300905/cse3045-nhom-5/pull/18) |
| Tài xế MAK: điều phối, ảnh giao hàng, đăng ký ca, thang phạt | [PR #19](https://github.com/DucManh300905/cse3045-nhom-5/pull/19), [PR #20](https://github.com/DucManh300905/cse3045-nhom-5/pull/20), [PR #21](https://github.com/DucManh300905/cse3045-nhom-5/pull/21) |
| Đo kiểm tải, sửa nghẽn đặt đơn | [PR #23](https://github.com/DucManh300905/cse3045-nhom-5/pull/23), [PR #24](https://github.com/DucManh300905/cse3045-nhom-5/pull/24), [PR #25](https://github.com/DucManh300905/cse3045-nhom-5/pull/25) |

## 4. Nhận xét (Retro Sprint 0)

**Làm tốt:**
- Luồng MVP chạy được từ sớm (06/10).
- Mọi thay đổi vào `develop` đều qua PR có CI.
- Quyết định nghiệp vụ được ghi kèm ngày trong [project.md](project.md).

**Cần cải thiện:**
1. **Phạm vi phình ra:** làm thêm nhiều tính năng ngoài backlog trong khi hạng mục 12 (1 SP) vẫn chưa xong (RISKS R8). Từ Sprint 1, việc mới phải được PO (A của mảng Backlog) đưa vào Sprint Planning rồi mới làm.
2. **Dồn việc vào một người:** gần như toàn bộ commit do một thành viên tạo (RISKS R7). Sprint 1 áp dụng bảng RACI trong [TEAM.md](TEAM.md): mỗi người duyệt (A) phần việc của người khác, và mỗi người tự demo được luồng nghiệm thu.
3. **Hạ tầng phát hiện muộn:** VPS thiếu RAM chỉ lộ ra khi đo tải ngày 27/10. Sprint 1 cần chốt phương án hạ tầng sớm.

## 5. Phạm vi Sprint 1 (28/10 – 03/11/2026)

- **Người điều phối:** An Đức Mạnh
- **Mục tiêu Sprint 1:** phát hành bản MVP ổn định trên VPS trước hạn **02/11/2026**. Cả 7 luồng nghiệm thu phải pass khi kiểm thử thủ công, và cả 3 thành viên tự demo được.
- **Nguyên tắc:** không nhận tính năng mới. Chỉ làm việc dở, kiểm thử, sửa lỗi, tài liệu.

| # | Product Backlog Item | R | A | SP | Tiêu chí hoàn thành | Hạn |
|---|---|---|---|---|---|---|
| S1-1 | Ổn định VPS: xin lab tăng RAM, hoặc chuyển MongoDB sang Atlas; đo lại 100 request/phút (hạng mục 13 chuyển sang; RISKS R1) | Đức Mạnh | Trương An | 3 | Bước "Đặt đơn" có p95 dưới 2 giây ở mức 60 request/phút trở lên; kết quả ghi vào [loadtest.md](loadtest.md) | 31/10 |
| S1-2 | Kiểm thử thủ công 7 luồng nghiệm thu trên `https://sv22.bcse-vju.com` | Trương An | Đức Mạnh | 3 | Checklist pass đủ 7 luồng; mỗi lỗi tìm được có một issue | 31/10 |
| S1-3 | Sửa lỗi giao diện phát hiện ở S1-2, kiểm tra hiển thị trên điện thoại | Minh Khánh | Đức Mạnh | 3 | Mọi issue lỗi mức cao đã đóng bằng PR | 01/11 |
| S1-4 | Rà soát bảo mật: phân quyền chéo giữa các quán cho đơn, voucher, tài xế; đổi mật khẩu Gmail (SMTP) và các khóa trên VPS (RISKS R2) | Đức Mạnh | Minh Khánh | 2 | Có test "quán A không đọc / sửa được dữ liệu quán B" cho các module mới; khóa cũ hết hiệu lực | 01/11 |
| S1-5 | Hoàn tất chuẩn bị demo: ảnh chụp vào `docs/images/`, cập nhật đường link trong kịch bản (hạng mục 12 chuyển sang) | Trương An | Minh Khánh | 1 | [scrum.md](scrum.md) mục 4 hiện đủ 6 ảnh, link đúng | 01/11 |
| S1-6 | Mỗi thành viên tự chạy dự án và tự demo trọn luồng nghiệm thu (RISKS R7) | Cả nhóm, mỗi người tự làm phần của mình | Lương Minh Khánh (điều phối) | 2 | Mỗi người demo được một lần trong buổi họp ngày 30/10 | 30/10 |
| S1-7 | Slide và báo cáo cuối kỳ | Trương An | Minh Khánh | 3 | Slide đúng kịch bản demo; báo cáo dẫn link tới `docs/` | 02/11 |
| S1-8 | Cập nhật tài liệu sau phát hành: nhật ký tiến độ ([project.md](project.md) mục 11), RISKS, báo cáo Sprint 1 | Đức Mạnh | Trương An | 1 | Tài liệu khớp với bản đã phát hành | 03/11 |

**Tổng Sprint 1:** 18 SP. Sprint 0 làm được 32 SP trong backlog, nhưng Sprint 1 chỉ có 1 tuần và chủ yếu là kiểm thử, sửa lỗi, nên nhóm chủ động nhận ít hơn để giữ hạn MVP.

**Ngoài Sprint 1** (để lại trong Product Backlog, xem lại ở Sprint 2):
- COD hoàn chỉnh `paymentStatus` ([project.md](project.md) P4.1);
- Swagger `/api/docs`;
- đơn tiền mặt cho tài xế MAK;
- nhân viên quán (RBAC).
