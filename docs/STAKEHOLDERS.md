# Đăng ký các bên liên quan — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 12/11/2026.
> Tài liệu liên quan: [TEAM.md](TEAM.md) (giao tiếp trong nhóm) · [CONFIG.md](CONFIG.md) · [RISKS.md](RISKS.md) · [project.md](project.md)

## 1. Ma trận quyền lực × quan tâm

- **Quyền lực:** khả năng quyết định hoặc chặn dự án (chấm điểm, cấp máy chủ, cho phép thu tiền…).
- **Quan tâm:** mức độ bị ảnh hưởng bởi kết quả dự án và mong muốn theo dõi nó.

|  | **Quan tâm thấp** | **Quan tâm cao** |
|---|---|---|
| **Quyền lực cao** | **Giữ hài lòng**: SH-02 Quản trị hạ tầng lab, SH-08 Quy định pháp lý về thanh toán | **Quản lý sát sao**: SH-01 Giảng viên |
| **Quyền lực thấp** | **Theo dõi**: SH-07 Nhà cung cấp dịch vụ bên ngoài | **Giữ cho hiểu rõ**: SH-03 Chủ quán, SH-04 Khách hàng sinh viên, SH-05 Tài xế, SH-06 Nhóm phát triển |

## 2. Bản đăng ký

| Mã | Bên liên quan | Vai trò trong dự án | Mong đợi / mối quan tâm chính | Quyền lực | Quan tâm | Nhóm | Người phụ trách liên lạc |
|---|---|---|---|---|---|---|---|
| SH-01 | Giảng viên môn CSE3045 | Giao đề, chấm điểm, nghiệm thu MVP và bản cuối | Bài tập nộp đúng hạn, đúng yêu cầu từng buổi; demo chạy được; mỗi thành viên hiểu phần của mình | Cao | Cao | Quản lý sát sao | Người điều phối Sprint |
| SH-02 | Quản trị hạ tầng lab BCSE-VJU | Cấp VPS `sv22.bcse-vju.com`, cổng SSH, tên miền | Nhóm dùng tài nguyên đúng giới hạn, không làm ảnh hưởng máy khác | Cao | Thấp | Giữ hài lòng | An Đức Mạnh |
| SH-03 | Chủ quán ăn khu vực Hòa Lạc | Người dùng kênh chủ quán: nhận đơn, quản lý thực đơn, ví đối soát | Nhận đơn kịp (chuông báo), hoa hồng rõ ràng, rút tiền đúng | Thấp | Cao | Giữ cho hiểu rõ | Lương Minh Khánh (PO) |
| SH-04 | Khách hàng (chủ yếu sinh viên Hòa Lạc) | Người đặt món | Đặt nhanh, giá đúng, theo dõi đơn, chuyển khoản được xác nhận ngay | Thấp | Cao | Giữ cho hiểu rõ | Lương Minh Khánh (PO) |
| SH-05 | Tài xế MAK | Người nhận và giao đơn theo ca | Phí giao minh bạch, luật phạt công bằng, lịch ca rõ | Thấp | Cao | Giữ cho hiểu rõ | Lương Minh Khánh (PO) |
| SH-06 | Nhóm phát triển (Mạnh, Khánh, An) | Xây dựng, vận hành sản phẩm | Phân việc công bằng, điểm cá nhân, kịp hạn | Thấp (với kết quả chấm) | Cao | Giữ cho hiểu rõ | Người điều phối Sprint |
| SH-07 | Nhà cung cấp dịch vụ bên ngoài: SePay (webhook xác nhận chuyển khoản), Goong (bản đồ, quãng đường), Gmail SMTP (email OTP) | Cung cấp API mà hệ thống phụ thuộc | Dùng đúng điều khoản và hạn mức miễn phí | Thấp | Thấp | Theo dõi | An Đức Mạnh |
| SH-08 | Quy định pháp lý về thanh toán (Ngân hàng Nhà nước) | Không tham gia trực tiếp; quy định ai được giữ tiền của người dùng | Không vận hành ví điện tử khi chưa có giấy phép | Cao | Thấp | Giữ hài lòng | Lương Minh Khánh (PO) |

Ghi chú về cách xếp nhóm:
- **SH-03, SH-04, SH-05:** quan tâm cao nhưng quyền lực thấp, vì đồ án chưa có người dùng thật trả tiền. Khi sản phẩm chạy thật, chủ quán có thể chuyển lên "Quản lý sát sao", vì họ rời nền tảng là sản phẩm không còn giá trị.
- **SH-02:** quan tâm thấp, nhưng có thể làm dự án dừng ngay, bằng cách giữ RAM VPS ở mức thấp (RISKS R1) hoặc thu hồi máy.
- **SH-07:** nếu một dịch vụ đổi điều khoản hoặc hết hạn mức thì cần chuyển lên "Giữ hài lòng".

## 3. Chiến lược ứng xử theo nhóm

| Nhóm | Chiến lược chung | Áp dụng cụ thể |
|---|---|---|
| **Quản lý sát sao** (SH-01) | Liên lạc thường xuyên, hỏi ý kiến trước những quyết định lớn, không để bị bất ngờ | Nộp bài tập đúng hạn qua repo (có link PR / tag). Demo bản chạy được ở mỗi Sprint Review trên lớp. Hỏi lại yêu cầu ngay khi đề chưa rõ, không đoán. Báo trước ít nhất 48 giờ nếu một hạng mục có nguy cơ trễ, kèm phương án thay thế ([TEAM.md](TEAM.md) mục 4.4) |
| **Giữ hài lòng** (SH-02, SH-08) | Đáp ứng đúng yêu cầu của họ, liên lạc ngắn gọn khi cần, không làm phiền với chi tiết | SH-02: chỉ xin thêm tài nguyên kèm số liệu cụ thể ([loadtest.md](loadtest.md), `vmstat`); tôn trọng giới hạn tài nguyên; đo kiểm tải ngoài giờ cao điểm của lab. SH-08: giữ thiết kế "ví đối soát nội bộ", không giữ tiền hộ người dùng như ví điện tử ([project.md](project.md) mục "Việc cần chốt") |
| **Giữ cho hiểu rõ** (SH-03, SH-04, SH-05, SH-06) | Cung cấp thông tin đầy đủ, đều đặn; lấy phản hồi để cải thiện | SH-03, SH-04, SH-05: thông báo trong app và email cho mỗi thay đổi trạng thái đơn / ca; luật hoa hồng, phí ship, thang phạt công khai trong trang trợ giúp; mời 2–3 người dùng thử mỗi vai trước buổi bảo vệ và ghi phản hồi thành issue. SH-06: Daily trên nhóm chat, Review / Retro mỗi Sprint ([TEAM.md](TEAM.md)) |
| **Theo dõi** (SH-07) | Theo dõi định kỳ, ít công sức | Mỗi Sprint kiểm tra hạn mức Goong và lịch sử webhook SePay một lần. Khóa API chỉ để trong `.env` ([CONFIG.md](CONFIG.md) CI-09). Có phương án dự phòng khi dịch vụ lỗi: nếu Goong lỗi thì đổi `ROUTING_PROVIDER=estimate` trong `.env` để ước lượng quãng đường theo đường chim bay; nếu webhook SePay tới muộn thì hệ thống tự tạo lệnh hoàn tiền, admin xử lý ở tab "Hoàn tiền" / "Giao dịch ngân hàng" (RISKS R5) |

## 4. Cập nhật bản đăng ký

- Người điều phối Sprint xem lại bản đăng ký ở mỗi buổi Retro, cùng lúc với [RISKS.md](RISKS.md).
- Khi một bên liên quan đổi nhóm (ví dụ chủ quán dùng thật, hoặc Goong hết hạn mức miễn phí), sửa bảng ở mục 2 và ghi ngày đổi.
