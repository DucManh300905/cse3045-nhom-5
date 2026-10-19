# Áp dụng Scrum cho đồ án — MAK Food and Drink

> Nhóm 5, CSE3045. Website đặt đồ ăn online cho các hàng ăn khu vực Hòa Lạc, gồm 3 vai người dùng: khách hàng, chủ quán, quản trị viên.
> Tài liệu liên quan: [project.md](project.md) (phạm vi, lộ trình), [API.md](API.md), [database.md](database.md).

## 1. Quy trình: Scrum

Nhóm chọn Scrum vì:
- đồ án có hạn chót rõ ràng (MVP 02/11/2026);
- yêu cầu thay đổi trong quá trình làm (ví dụ: chốt "quán tự giao, miễn phí ship", thêm OTP email, thanh toán VietQR);
- cần có bản chạy được để demo sau mỗi giai đoạn.

| Thành phần Scrum | Cách nhóm áp dụng |
|---|---|
| Sprint | 1 tuần |
| Sprint Planning | Đầu tuần: chọn việc từ Product Backlog vào Sprint Backlog |
| Daily Scrum | Mỗi tối, 10 phút trên nhóm chat: hôm qua làm gì, hôm nay làm gì, đang vướng gì |
| Sprint Review | Cuối tuần: demo bản chạy được cho cả nhóm / trên lớp |
| Retrospective | Sau Review: 1 điều làm tốt, 1 điều cần cải thiện |
| Công cụ | GitHub (code, Pull Request, review), Jest + GitHub Actions (kiểm thử tự động), thư mục `docs/` (đặc tả) |

**Definition of Done** — một hạng mục chỉ được tính là xong khi:
1. Code đã qua review và được merge vào `develop`.
2. Test tự động pass.
3. Tài liệu trong `docs/` đã được cập nhật.
4. Chạy được trên máy demo.

## 2. (a) Phân vai trò

| Thành viên | MSSV | Vai trò Scrum | Phụ trách chính |
|---|---|---|---|
| **An Đức Mạnh** | 23110310 | **Scrum Master / điều phối** + Developer | **Backend**: Node.js/Express, MongoDB, API, realtime, kiểm thử tự động, CI, triển khai lên VPS. Tổ chức các buổi họp Scrum, review và merge Pull Request. |
| **Lương Minh Khánh** | 23110181 | Developer | **Frontend**: React + TypeScript (Vite). Giao diện khách hàng, kênh chủ quán, trang quản trị; nối giao diện với API. |
| **Trương An** | _(bổ sung)_ | **Product Owner** + phụ trách tài liệu | **Báo cáo / tài liệu**: quản lý Product Backlog, viết user story và tiêu chí nghiệm thu, WBS/Gantt, báo cáo, slide. Kiểm thử thủ công các luồng chính trước mỗi buổi demo. |

## 3. (b) Backlog Sprint 0

**Mục tiêu Sprint 0:** có nền tảng kỹ thuật và một bản MVP chạy được luồng cơ bản *khách xem quán → đặt món → quán nhận đơn*, đủ để demo ý tưởng cho lớp.

SP là story point ước lượng độ khó tương đối. ✅ là đã hoàn thành, kèm bằng chứng trong repo.

| # | Hạng mục / User story | Người phụ trách | SP | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|---|---|
| 1 | Chốt phạm vi MVP, 3 vai người dùng, luồng nghiệm thu | Trương An | 3 | Có danh sách tính năng MVP và luồng nghiệm thu ([project.md](project.md)) | ✅ |
| 2 | Lập WBS và Gantt cho MVP | Trương An | 2 | `HW3/WBS food ordering.png`, `HW3/Gantt_MVP_he_thong_dat_mon.xlsx` | ✅ |
| 3 | Tạo repo GitHub, quy ước nhánh `main` / `develop` / `feature/*`, làm việc qua Pull Request | Đức Mạnh | 1 | Mọi thay đổi vào `develop` đều qua PR | ✅ |
| 4 | Chọn tech stack, khởi tạo backend (Express + MongoDB) và frontend (React + Vite) | Đức Mạnh, Minh Khánh | 2 | Cả hai chạy được trên máy bằng `npm run dev` | ✅ |
| 5 | Thiết kế cơ sở dữ liệu: người dùng, quán, thực đơn, đơn hàng | Đức Mạnh | 3 | [database.md](database.md) | ✅ |
| 6 | Đặc tả API và mã lỗi | Đức Mạnh | 3 | [API.md](API.md) | ✅ |
| 7 | Kiểm thử tự động + CI (Jest, GitHub Actions) | Đức Mạnh | 2 | Test tự chạy mỗi lần push / mở PR | ✅ |
| 8 | Phác thảo giao diện khách: trang chủ, danh sách quán, trang quán, giỏ hàng, thanh toán | Minh Khánh | 5 | Bản HTML đầu tiên (`HW1/`) → giao diện React | ✅ |
| 9 | *Là khách / chủ quán, tôi muốn đăng ký, đăng nhập để dùng hệ thống* | Mạnh (API), Khánh (giao diện) | 3 | Đăng nhập được theo từng vai; mật khẩu được mã hóa | ✅ |
| 10 | *Là khách, tôi muốn xem danh sách quán và thực đơn* (+ dữ liệu mẫu để demo) | Mạnh, Khánh | 3 | Dữ liệu lấy từ API; `npm run seed:demo` tạo sẵn quán mẫu | ✅ |
| 11 | *Là khách, tôi muốn đặt món và trả tiền mặt khi nhận* | Mạnh, Khánh | 5 | Giá do server tính; không đặt quá số suất còn lại | ✅ |
| 12 | Chuẩn bị demo: kịch bản, ảnh chụp, tài khoản demo | Trương An | 1 | Có kịch bản demo 3 phút và ảnh (mục 4) | ⬜ |
| 13 | Môi trường chạy thử trên VPS của lab | Đức Mạnh | 2 | Truy cập được bằng đường link | 🟡 Đã chạy nhưng chậm vì VPS chỉ có ~331MB RAM; đang xin cấp thêm |

**Tổng: 35 SP**, đã xong 32 SP.

**Chuyển sang Sprint 1 trở đi (Product Backlog còn lại):**
- voucher;
- rà soát bảo mật và phân quyền chéo giữa các quán;
- ổn định môi trường VPS;
- kiểm thử toàn bộ luồng nghiệm thu;
- hoàn thiện báo cáo và slide.

## 4. (c) Demo ý tưởng / MVP

- **Mã nguồn:** https://github.com/DucManh300905/cse3045-nhom-5 (nhánh `develop`)
- **Bản chạy thử:** `https://<địa chỉ>.trycloudflare.com` — điền đường link lúc demo vì địa chỉ đổi mỗi lần khởi động lại tunnel. Dự phòng: chạy trên máy cá nhân tại `http://localhost:5173`.
- **Tài khoản demo** (tạo bởi `npm run seed:demo`):
  - Khách: `khach@mak.com` / `Demo@123`
  - Chủ quán: `owner.quana@mak.com` / `Demo@123`

### Ảnh chụp màn hình

Lưu ảnh vào `docs/images/` với đúng tên bên dưới thì ảnh sẽ hiện trong tài liệu này.

| # | Màn hình | File |
|---|---|---|
| 1 | Trang chủ / danh sách quán (điểm đánh giá, trạng thái "Đang nhận đơn") | `images/01-danh-sach-quan.png` |
| 2 | Trang quán: thực đơn, hộp chọn size/topping | `images/02-trang-quan.png` |
| 3 | Giỏ hàng và thanh toán (giá do server tính, miễn phí giao hàng) | `images/03-thanh-toan.png` |
| 4 | Kênh chủ quán: nhận đơn mới, chuông realtime | `images/04-chu-quan-nhan-don.png` |
| 5 | "Đơn của tôi" phía khách: thanh tiến trình trạng thái đơn | `images/05-theo-doi-don.png` |
| 6 | Trang quản trị: duyệt hồ sơ quán | `images/06-admin-duyet-quan.png` |

![Danh sách quán](images/01-danh-sach-quan.png)
![Trang quán](images/02-trang-quan.png)
![Thanh toán](images/03-thanh-toan.png)
![Chủ quán nhận đơn](images/04-chu-quan-nhan-don.png)
![Theo dõi đơn](images/05-theo-doi-don.png)
![Admin duyệt quán](images/06-admin-duyet-quan.png)

Kế hoạch: ![WBS](../HW3/WBS%20food%20ordering.png)

### Kịch bản demo 3 phút

1. *(30 giây)* Vấn đề: sinh viên ở Hòa Lạc khó đặt đồ ăn vì Grab/Be chưa phủ tới. Giải pháp: MAK kết nối khách với các hàng ăn quanh trường.
2. *(60 giây)* Khách đăng nhập, chọn quán, chọn món kèm size/topping, đặt đơn trả tiền mặt.
3. *(60 giây)* Ở một tab khác, chủ quán nghe chuông và nhận đơn. Khách thấy trạng thái đơn cập nhật ngay, không cần tải lại trang.
4. *(30 giây)* Admin duyệt quán mới. Kết thúc bằng các việc của Sprint tiếp theo.
