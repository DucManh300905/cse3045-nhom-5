# Quản lý nhân lực và giao tiếp — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 27/10/2026.
> Tài liệu liên quan: [scrum.md](scrum.md) (quy trình Scrum, vai trò) · [SPRINT0-REPORT.md](SPRINT0-REPORT.md) · [RISKS.md](RISKS.md)

## 1. Thành viên

| Thành viên | MSSV | Vai trò Scrum | Thế mạnh chính |
|---|---|---|---|
| An Đức Mạnh | 23110310 | Scrum Master + Developer | Backend, CSDL, CI, triển khai VPS |
| Trương An | 23110181 | Developer | Frontend (React + TypeScript) |
| Lương Minh Khánh | 23110142 | Product Owner | Yêu cầu, kiểm thử thủ công, báo cáo, slide |

## 2. Bảng RACI

**Ký hiệu:**
- **R** (Responsible, Chịu trách nhiệm): người trực tiếp làm việc.
- **A** (Accountable, Phê duyệt): người duyệt kết quả và chịu trách nhiệm cuối.
- **C** (Consulted, Được hỏi ý kiến): người được hỏi trước khi quyết định.
- **I** (Informed, Được thông báo): người được báo kết quả.

**Quy tắc:**
- Mỗi mảng có **đúng một A và đúng một R**.
- A và R luôn là hai người khác nhau, để mọi kết quả đều có người thứ hai kiểm tra.
- Mỗi thành viên phải là A của ít nhất một mảng mình không trực tiếp làm. Nhờ vậy ai cũng phải đọc phần việc của người khác: đây là cách giảm rủi ro "chỉ một người hiểu code" (RISKS R7).

| # | Mảng công việc | Đầu ra | Đức Mạnh | Minh Khánh | Trương An |
|---|---|---|---|---|---|
| 1 | Product Backlog và ưu tiên | GitHub Issues, mục "Features" trong [project.md](project.md), user story kèm tiêu chí nghiệm thu | R | C | **A** |
| 2 | Backend, API, cơ sở dữ liệu | Code `backend/`, [API.md](API.md), [database.md](database.md) | R | **A** | I |
| 3 | Frontend (giao diện 4 vai) | Code `frontend/` | **A** | R | C |
| 4 | Kiểm thử tự động và CI | Test Jest, GitHub Actions xanh trước khi merge | R | **A** | I |
| 5 | Kiểm thử nghiệm thu thủ công | Checklist 7 luồng nghiệm thu ([project.md](project.md) mục 9), danh sách lỗi dạng issue | **A** | C | R |
| 6 | Triển khai VPS và phát hành | Bản chạy tại `https://sv22.bcse-vju.com`, `.env` trên VPS, số liệu [loadtest.md](loadtest.md) | R | C | **A** |
| 7 | Tài liệu và báo cáo môn học | Các file trong `docs/`, báo cáo cuối kỳ | **A** | C | R |
| 8 | Slide và kịch bản demo | Slide, kịch bản demo 3 phút, ảnh chụp màn hình | C | **A** | R |
| 9 | Điều phối Sprint (Planning, Daily, Review, Retro, cập nhật bảng việc) | Biên bản họp, bảng Sprint Backlog cập nhật | **A** | R | C |
| 10 | Quản lý rủi ro | [RISKS.md](RISKS.md) xem lại mỗi Sprint | **A** | I | R |

Ghi chú:
- Dòng 6: PO là A vì PO quyết định khi nào phát hành bản mới cho người dùng thử.
- Dòng 9: cột R thuộc về người điều phối của Sprint hiện tại. Bảng trên là Sprint 1 (Minh Khánh điều phối). Sang Sprint khác, chữ R chuyển theo lịch luân phiên ở mục 3; các ô khác giữ nguyên.
- Mảng nào có 2 người cùng code (ví dụ một tính năng cần cả API và giao diện) thì vẫn tách thành 2 issue, mỗi issue một R.

## 3. Luân phiên vai điều phối theo Sprint

Vai trò Scrum (PO, Developer) cố định. Riêng **vai điều phối Sprint** luân phiên, để cả 3 người đều tập dẫn họp, theo dõi tiến độ và nắm toàn bộ dự án.

| Sprint | Thời gian | Người điều phối | Người dự phòng |
|---|---|---|---|
| Sprint 0 | 03/10 – 26/10/2026 | An Đức Mạnh | Trương An |
| Sprint 1 | 28/10 – 03/11/2026 | Lương Minh Khánh | An Đức Mạnh |
| Sprint 2 | 04/11 – 10/11/2026 | Trương An | Lương Minh Khánh |
| Sprint 3 trở đi | Lặp lại theo thứ tự Mạnh → Khánh → An | | |

**Việc của người điều phối trong Sprint:**
1. Chủ trì Sprint Planning (đầu Sprint), Sprint Review và Retrospective (cuối Sprint).
2. Mỗi tối kiểm tra tin Daily của cả nhóm. Ai chưa gửi trước 22:00 thì nhắc.
3. Giữ bảng Sprint Backlog (GitHub Issues / Projects) khớp với thực tế: issue nào đang làm, xong, bị chặn.
4. Ghi biên bản Planning / Review / Retro vào một issue nhãn `meeting`.
5. Là đầu mối báo tin xấu lên giảng viên nếu Sprint có nguy cơ trễ (mục 4.4).

**Bàn giao giữa hai Sprint**, làm ngay sau buổi Retro (15 phút):
- Người điều phối cũ chuyển cho người mới: danh sách issue chưa xong và lý do, các rủi ro đang mở, các quyết định còn treo.
- Người mới xác nhận bằng một bình luận "Đã nhận" trong issue biên bản Retro.

**Người dự phòng:** nếu người điều phối vắng quá 2 ngày (RISKS R9), người dự phòng điều phối thay. Việc này được ghi vào issue biên bản.

Quyền merge vào `develop` không đi theo luân phiên. Mọi PR vẫn cần người A của mảng đó duyệt (bảng RACI) và CI xanh.

## 4. Quy ước giao tiếp

### 4.1 Kênh và khi nào dùng

| Kênh | Loại | Dùng khi | Không dùng khi |
|---|---|---|---|
| Họp trực tiếp hoặc Google Meet | Đồng bộ | Sprint Planning, Review, Retro; bàn việc mà chat qua lại quá 10 tin chưa xong; sự cố chặn việc hơn 2 giờ; tập demo | Báo cáo tiến độ thường ngày |
| Gọi điện | Đồng bộ, khẩn | Web production lỗi, trước buổi demo / bảo vệ dưới 24 giờ | Mọi việc chờ được tới tối |
| Nhóm chat của nhóm | Bất đồng bộ | Daily Scrum (theo mẫu ở 4.2), thông báo ngắn, hẹn lịch, hỏi nhanh | Chốt quyết định, giao việc (phải chuyển sang issue) |
| GitHub Issues | Bất đồng bộ, lưu lâu dài | Giao việc, báo lỗi, ghi quyết định (nhãn `decision`), biên bản họp (nhãn `meeting`) | Trò chuyện |
| GitHub Pull Request | Bất đồng bộ, lưu lâu dài | Review code, thảo luận cách cài đặt cụ thể | Bàn lại nghiệp vụ đã chốt (mở issue) |
| Thư mục `docs/` | Lưu lâu dài | Đặc tả đã chốt: nghiệp vụ (BR), API, CSDL, rủi ro | Bản nháp chưa thống nhất |

**Thời gian phản hồi:**
- Tin nhắn có tag tên: trả lời trong 12 giờ (trong tuần demo: 4 giờ).
- PR chờ review: người A review trong 24 giờ.
- Quá thời gian trên thì gọi điện, không nhắn thêm.

### 4.2 Mẫu Daily Scrum (gửi trong nhóm chat trước 22:00)

```
[Daily dd/mm] Tên
- Hôm qua: ... (#issue)
- Hôm nay: ... (#issue)
- Vướng: không / ... (cần ai giúp)
```

### 4.3 Ghi lại quyết định

Quy tắc: Quyết định chưa ghi vào GitHub thì coi như chưa có. Quyết định nói miệng hoặc chốt trong chat phải được người A của mảng đó ghi lại trong 24 giờ.

1. Mở một issue nhãn `decision`, tiêu đề `[Quyết định] <nội dung ngắn>`, theo mẫu:
   ```
   Bối cảnh: vì sao phải quyết định
   Các phương án: A / B / C (ưu, nhược)
   Quyết định: ...
   Người phê duyệt (A): ...      Ngày: dd/mm/yyyy
   Ảnh hưởng: file / tính năng / BR nào phải sửa
   ```
2. Nếu đổi nghiệp vụ thì cập nhật bảng "Việc cần chốt" hoặc mục Business Rules (BR-xx) trong [project.md](project.md), ghi ngày chốt. Ví dụ đã có: "Quán tự giao (06/10/2026)", "Chỉ xác thực email (08/10/2026)".
3. PR thực hiện quyết định phải ghi `Liên quan: #<số issue>` trong mô tả. Như vậy có thể lần từ code → PR → issue → lý do.
4. Muốn đổi một quyết định đã chốt: mở issue `decision` mới, dẫn link issue cũ, không sửa đè issue cũ.

### 4.4 Quy tắc báo tin xấu

Tin xấu gồm: trễ hạn, lỗi trên production, làm hỏng dữ liệu, lộ bí mật, không làm được việc đã nhận, ốm hoặc bận đột xuất.

1. **Báo sớm.** Báo ngay khi thấy khả năng trễ quá 1 ngày so với ước lượng, không đợi tới Daily hoặc tới hạn. Báo sớm không bị trách; giấu tới phút cuối mới là lỗi.
2. **Báo trên kênh chung**, không nhắn riêng: tag người A của mảng và người điều phối Sprint.
3. **Theo mẫu 5 dòng** để người nghe quyết định được ngay:
   ```
   Chuyện gì: ...
   Ảnh hưởng: việc / ngày / người dùng nào bị ảnh hưởng
   Đã thử: ...
   Cần: ai giúp gì, trước khi nào
   Đề xuất: cắt phạm vi / lùi hạn / đổi người
   ```
4. **Không đổ lỗi.** Retro bàn về quy trình ("vì sao lỗi lọt qua review"), không bàn về người.
5. **Sự cố production:** báo ngay trong nhóm chat. Người R của mảng 6 xử lý. Sau đó ghi nguyên nhân và cách xử lý vào [RISKS.md](RISKS.md). Ví dụ đã làm: lỗi 500 khi đặt đơn lúc đo tải được báo, sửa và ghi thành rủi ro R11 ngay trong ngày 27/10/2026.
6. **Lộ bí mật** (mật khẩu, khóa API): báo ngay, đổi khóa trước rồi mới tìm nguyên nhân (RISKS R2).
7. **Báo giảng viên:** nếu một hạng mục bắt buộc của môn có nguy cơ không kịp, người điều phối báo giảng viên ít nhất 48 giờ trước hạn, kèm phương án thay thế.
