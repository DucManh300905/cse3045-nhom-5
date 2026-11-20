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
2. Trương An - 23110142
3. Lương Minh Khánh - 23110181

## Phân vai sơ bộ

| Thành viên | Vai trò |
|---|---|
| An Đức Mạnh | Nhóm trưởng · Phụ trách backend · Phụ trách hạ tầng (VPS, triển khai) |
| Trương An | Phụ trách frontend |
| Lương Minh Khánh | Thư ký (biên bản, tài liệu) · Phụ trách yêu cầu và kiểm thử |

## Bản mô tả dự án sơ bộ (Project charter mini)

**Tên dự án:** MAK Food and Drink — Website đặt đồ ăn online cho các hàng ăn khu vực Hòa Lạc.

**Mục tiêu:** Giúp sinh viên và người dân Hòa Lạc tìm và đặt món từ các quán ăn địa phương, đồng thời giúp chủ quán nhận và quản lý đơn hàng trực tuyến.

**Phạm vi — làm:**
- Khách: xem quán, tìm món, giỏ hàng, đặt đơn (tiền mặt / chuyển khoản VietQR), theo dõi đơn realtime, đánh giá quán.
- Chủ quán: hồ sơ quán, thực đơn, nhận / từ chối / xử lý đơn, voucher, dashboard doanh thu.
- Quản trị viên: duyệt / khóa quán, quản lý người dùng, thống kê nền tảng.

**Phạm vi — không làm (trong đồ án):**
- Cổng thanh toán VNPay/MoMo/ZaloPay, ví điện tử giữ tiền hộ người dùng.
- Ứng dụng di động native, push FCM / SMS / Zalo.
- Nhiều chi nhánh cho một chủ quán, phân quyền nhân viên quán.

**Các bên liên quan:** Giảng viên CSE3045; quản trị hạ tầng lab BCSE-VJU; chủ quán ăn Hòa Lạc; khách hàng (chủ yếu sinh viên); tài xế; nhóm phát triển; nhà cung cấp dịch vụ ngoài (SePay, Goong, Gmail SMTP). Chi tiết: [docs/STAKEHOLDERS.md](docs/STAKEHOLDERS.md).

**Ba ràng buộc:**
1. **Thời gian:** MVP hoàn thành trước 02/11/2026, bản cuối theo lịch học phần.
2. **Nhân lực:** nhóm 3 người, mỗi người kiêm nhiều vai.
3. **Hạ tầng / chi phí:** chạy trên VPS lab được cấp (RAM hạn chế), chỉ dùng dịch vụ miễn phí.

## Liên kết

- Kho GitHub: https://github.com/DucManh300905/cse3045-nhom-5
- Trang chạy công khai: https://sv22.bcse-vju.com
