# Scrum cho đồ án — MAK Food and Drink

> Nhóm 5, CSE3045. Website đặt đồ ăn online cho các hàng ăn khu vực Hòa Lạc, gồm 3 vai người dùng: khách hàng, chủ quán, quản trị viên.
> Tài liệu liên quan: [project.md](project.md) (phạm vi, lộ trình) · [TEAM.md](TEAM.md) (RACI, giao tiếp) · [SPRINT0-REPORT.md](SPRINT0-REPORT.md) (kết quả Sprint 0, phạm vi Sprint 1) · [GIT.md](GIT.md) · [API.md](API.md) · [database.md](database.md).
> Cập nhật: 12/11/2026.

## 1. Quy trình: Scrum

Nhóm chọn Scrum vì:
- đồ án có hạn chót rõ ràng (MVP 02/11/2026);
- yêu cầu thay đổi trong quá trình làm (ví dụ: chốt "quán tự giao, miễn phí ship", thêm OTP email, thanh toán VietQR);
- cần có bản chạy được để demo sau mỗi giai đoạn.

| Thành phần Scrum | Cách nhóm áp dụng |
|---|---|
| Sprint | 1 tuần |
| Sprint Planning | Đầu tuần: chọn việc từ Product Backlog vào Sprint Backlog |
| Daily Scrum | Cách 3 ngày một lần, trên nhóm chat: đã làm gì từ lần trước, sắp làm gì, đang vướng gì (mẫu ở [TEAM.md](TEAM.md) mục 4.2) |
| Sprint Review | Cuối Sprint: demo bản chạy được cho cả nhóm |
| Retrospective | Sau Review: 1 điều làm tốt, 1 điều cần cải thiện |
| Công cụ | GitHub (code, Pull Request, review, tag phát hành), Jest + GitHub Actions (kiểm thử tự động), thư mục `docs/` (đặc tả) |

**Definition of Done** — một hạng mục chỉ được tính là xong khi:
1. Code đã qua review và được merge vào `develop`.
2. Test tự động pass.
3. Tài liệu trong `docs/` đã được cập nhật.
4. Chạy được trên máy demo.

## 2. (a) Phân vai trò

| Thành viên | MSSV | Vai trò Scrum | Phụ trách chính |
|---|---|---|---|
| **An Đức Mạnh** | 23110310 | Scrum Master + Developer | **Backend**: Node.js/Express, MongoDB, API, realtime, kiểm thử tự động, CI, triển khai lên VPS, quản lý cấu hình (tag phát hành). Review và merge Pull Request. Điều phối Sprint 0 và Sprint 1 ([TEAM.md](TEAM.md) mục 3). |
| **Trương An** | 23110142 | Developer | **Frontend**: React + TypeScript (Vite). Giao diện khách hàng, kênh chủ quán, tài xế, trang quản trị; nối giao diện với API. |
| **Lương Minh Khánh** | 23110181 | Product Owner + phụ trách tài liệu | **Báo cáo / tài liệu**: quản lý Product Backlog, viết user story và tiêu chí nghiệm thu, WBS/Gantt, báo cáo, slide. Kiểm thử thủ công các luồng chính trước mỗi buổi demo. Phê duyệt phát hành. |

## 3. (b) Backlog Sprint 0

**Mục tiêu Sprint 0:** có nền tảng kỹ thuật và một bản MVP chạy được luồng cơ bản *khách xem quán → đặt món → quán nhận đơn*, đủ để demo ý tưởng cho lớp.

SP là story point ước lượng độ khó tương đối. ✅ là đã hoàn thành, kèm bằng chứng trong repo.

| # | Hạng mục / User story | Người phụ trách | SP | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|---|---|
| 1 | Chốt phạm vi MVP, 3 vai người dùng, luồng nghiệm thu | Lương Minh Khánh | 3 | Có danh sách tính năng MVP và luồng nghiệm thu ([project.md](project.md)) | ✅ |
| 2 | Lập WBS và Gantt cho MVP | Lương Minh Khánh | 2 | `HW3/WBS food ordering.png`, `HW3/Gantt_MVP_he_thong_dat_mon.xlsx` | ✅ |
| 3 | Tạo repo GitHub, quy ước nhánh `main` / `develop` / `feature/*`, làm việc qua Pull Request | Đức Mạnh | 1 | Mọi thay đổi vào `develop` đều qua PR | ✅ |
| 4 | Chọn tech stack, khởi tạo backend (Express + MongoDB) và frontend (React + Vite) | Đức Mạnh, Trương An | 2 | Cả hai chạy được trên máy bằng `npm run dev` | ✅ |
| 5 | Thiết kế cơ sở dữ liệu: người dùng, quán, thực đơn, đơn hàng | Đức Mạnh | 3 | [database.md](database.md) | ✅ |
| 6 | Đặc tả API và mã lỗi | Đức Mạnh | 3 | [API.md](API.md) | ✅ |
| 7 | Kiểm thử tự động + CI (Jest, GitHub Actions) | Đức Mạnh | 2 | Test tự chạy mỗi lần push / mở PR | ✅ |
| 8 | Phác thảo giao diện khách: trang chủ, danh sách quán, trang quán, giỏ hàng, thanh toán | Trương An | 5 | Bản HTML đầu tiên (`HW1/`) → giao diện React | ✅ |
| 9 | *Là khách / chủ quán, tôi muốn đăng ký, đăng nhập để dùng hệ thống* | Mạnh (API), An (giao diện) | 3 | Đăng nhập được theo từng vai; mật khẩu được mã hóa | ✅ |
| 10 | *Là khách, tôi muốn xem danh sách quán và thực đơn* (+ dữ liệu mẫu để demo) | Mạnh, An | 3 | Dữ liệu lấy từ API; `npm run seed:demo` tạo sẵn quán mẫu | ✅ |
| 11 | *Là khách, tôi muốn đặt món và trả tiền mặt khi nhận* | Mạnh, An | 5 | Giá do server tính; không đặt quá số suất còn lại | ✅ |
| 12 | Chuẩn bị demo: kịch bản, ảnh chụp, tài khoản demo | Lương Minh Khánh | 1 | Có kịch bản demo 3 phút và ảnh (mục 4) | 🟡 Có kịch bản và tài khoản demo; còn thiếu ảnh chụp màn hình (chuyển sang Sprint 1, S1-5) |
| 13 | Môi trường chạy thử trên VPS của lab | Đức Mạnh | 2 | Truy cập được bằng đường link | ✅ Chạy tại `https://sv22.bcse-vju.com`. Hiệu năng còn thấp do VPS thiếu RAM ([loadtest.md](loadtest.md), RISKS R1), xử lý ở Sprint 1 (S1-1) |

**Tổng: 35 SP**, đã xong 34 SP. Chi tiết và bằng chứng (link commit / PR): [SPRINT0-REPORT.md](SPRINT0-REPORT.md).

**Sprint 1 (đang chạy):** phạm vi, người phụ trách và tiêu chí hoàn thành ở [SPRINT0-REPORT.md](SPRINT0-REPORT.md) mục 5. Tóm tắt:
- ổn định VPS (RAM / chuyển MongoDB sang Atlas) và đo lại tải;
- kiểm thử thủ công 7 luồng nghiệm thu trên VPS, sửa lỗi giao diện;
- rà soát bảo mật, phân quyền chéo giữa các quán; đổi khóa trên VPS;
- ảnh chụp màn hình cho demo, slide và báo cáo cuối kỳ;
- phát hành bản đầu tiên có tag `v0.1.0` ([GIT.md](GIT.md) mục 5).

## 4. (c) Demo ý tưởng / MVP

- **Mã nguồn:** https://github.com/DucManh300905/cse3045-nhom-5 (nhánh `develop`)
- **Bản chạy thử:** `https://sv22.bcse-vju.com` (VPS lab, nhánh `develop`). Dự phòng: chạy trên máy cá nhân tại `http://localhost:5173`.
- **Phiên bản phát hành:** tag `v0.1.0` trên nhánh `main`.
- **Tài khoản demo** (tạo bởi `npm run seed:demo`; mật khẩu lấy từ `DEMO_PASSWORD` trong `.env`, không ghi trong repo):
  - Khách: `khach@mak.com`
  - Chủ quán: `owner.quana@mak.com`

### Ảnh chụp màn hình

Chưa có ảnh (thư mục `docs/images/` chưa được tạo), làm ở Sprint 1 (S1-5). Danh sách ảnh cần chụp:

| # | Màn hình | File |
|---|---|---|
| 1 | Trang chủ / danh sách quán (điểm đánh giá, trạng thái "Đang nhận đơn") | `images/01-danh-sach-quan.png` |
| 2 | Trang quán: thực đơn, hộp chọn size/topping | `images/02-trang-quan.png` |
| 3 | Giỏ hàng và thanh toán (giá do server tính, voucher, tiền mặt / VietQR) | `images/03-thanh-toan.png` |
| 4 | Kênh chủ quán: nhận đơn mới, chuông realtime | `images/04-chu-quan-nhan-don.png` |
| 5 | "Đơn của tôi" phía khách: thanh tiến trình trạng thái đơn, ảnh tài xế | `images/05-theo-doi-don.png` |
| 6 | Trang quản trị: duyệt hồ sơ quán | `images/06-admin-duyet-quan.png` |

Kế hoạch: ![WBS](../HW3/WBS%20food%20ordering.png)

### Kịch bản demo 3 phút

1. *(30 giây)* Vấn đề: sinh viên ở Hòa Lạc khó đặt đồ ăn vì Grab/Be chưa phủ tới. Giải pháp: MAK kết nối khách với các hàng ăn quanh trường.
2. *(60 giây)* Khách đăng nhập, chọn quán, chọn món kèm size/topping, đặt đơn trả tiền mặt.
3. *(60 giây)* Ở một tab khác, chủ quán nghe chuông và nhận đơn. Khách thấy trạng thái đơn cập nhật ngay, không cần tải lại trang.
4. *(30 giây)* Admin duyệt quán mới. Kết thúc bằng các việc của Sprint tiếp theo.
