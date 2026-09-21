# cse3045-nhom-5
# Website bán hàng online cho các hàng ăn trên Hòa Lạc

## Giới thiệu

Đây là dự án xây dựng **Website bán hàng online cho các hàng ăn trên khu vực Hòa Lạc**.

Hệ thống cung cấp nền tảng kết nối giữa **khách hàng và các cửa hàng ăn uống**, cho phép khách hàng tìm kiếm món ăn, đặt hàng trực tuyến và theo dõi đơn hàng. Đồng thời, cửa hàng có thể quản lý sản phẩm và đơn hàng thông qua hệ thống.

## Mục tiêu
- Hòa Lạc hiện nay đang là một nơi mà trong tương lai sẽ có rất nhiều trường đại học được di dời tới. Tuy nhiên, việc tìm kiếm đồ ăn đang là một vấn đề đáng chú ý cho khi các nền tảng công nghệ như Grab, Be, Xanh SM chưa tiếp cận được quá nhiều để phục vụ cho người dân đặc biệt là các sinh viên trong tương lai.
- Xây dựng website bán hàng online dành cho các hàng ăn tại Hòa Lạc.
- Hỗ trợ khách hàng tìm kiếm và đặt món ăn trực tuyến.
- Hỗ trợ cửa hàng quản lý món ăn và đơn hàng.
- Quản lý thông tin người dùng và cửa hàng.
- Áp dụng kiến thức về phát triển Web, Database và Software Engineering.
## Thành viên nhóm
1. An Đức Mạnh - 23110310
2. Trương An - 23110310
3. Lương Minh Khánh - 23110181
## Pre-mortem – Những lý do dự án có thể thất bại

### C – Coordination (Phối hợp)
**Rủi ro:** Các thành viên không thống nhất công việc, dẫn đến trùng lặp hoặc bỏ sót nhiệm vụ.

**Phòng tránh:** Phân chia nhiệm vụ rõ ràng, cập nhật tiến độ thường xuyên và thống nhất công việc trước khi triển khai.

### H – Human (Con người)
**Rủi ro:** Thành viên nghỉ hoặc không hoàn thành phần việc được giao đúng thời hạn.

**Phòng tránh:** Mỗi nhiệm vụ có một người phụ trách chính và một thành viên có thể hỗ trợ khi cần.

### A – Architecture (Kiến trúc)
**Rủi ro:** Các thành viên xây dựng các phần hệ thống theo những cách khác nhau, gây khó khăn khi tích hợp.

**Phòng tránh:** Thống nhất kiến trúc, cấu trúc project và quy ước code trước khi phát triển.

### O – Operations (Vận hành)
**Rủi ro:** Website gặp lỗi khi triển khai lên VPS hoặc môi trường thực tế.

**Phòng tránh:** Kiểm thử việc triển khai thường xuyên và kiểm tra môi trường trước mỗi lần release.

### S – Scope (Phạm vi)
**Rủi ro:** Phạm vi dự án quá lớn so với thời gian và nguồn lực của nhóm.

**Phòng tránh:** Xác định các chức năng MVP trước, ưu tiên những chức năng quan trọng và hạn chế mở rộng ngoài phạm vi.

### C – Code & Collaboration (Code và cộng tác)
**Rủi ro:** Xung đột code hoặc thành viên làm việc trên phiên bản code không đồng bộ.

**Phòng tránh:** Sử dụng Git theo mô hình `main → develop → feature branch`, tạo Pull Request và review code trước khi merge.

### H – Hosting & Hardware (Hosting và phần cứng)
**Rủi ro:** VPS gặp sự cố hoặc thiếu tài nguyên khiến website không hoạt động ổn định.

**Phòng tránh:** Theo dõi tài nguyên VPS, kiểm tra trạng thái dịch vụ thường xuyên và có phương án backup khi xảy ra sự cố.
