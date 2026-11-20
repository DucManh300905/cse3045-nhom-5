# Gantt — Tiến độ đồ án — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 20/11/2026. Người lập: Lương Minh Khánh.
> Tài liệu liên quan: [WBS.md](WBS.md) (mã gói công việc) · [project.md](project.md) mục 8 (lộ trình), mục 11 (nhật ký tiến độ) · [SPRINT0-REPORT.md](SPRINT0-REPORT.md) mục 5 (Sprint 1)

Bản Gantt kế hoạch gốc là `HW3/Gantt_MVP_he_thong_dat_mon.xlsx` (03/10 → 02/11/2026). File này không nằm trong Git vì `HW3/` bị `.gitignore` chặn, nên được dựng lại dưới đây bằng Mermaid, xem được trực tiếp trên GitHub. Ngày tháng lấy từ [project.md](project.md) và [SPRINT0-REPORT.md](SPRINT0-REPORT.md).

## 1. Kế hoạch MVP và tiến độ thực tế

Thanh màu xám (`done`) là việc đã xong; thanh đỏ (`crit`) là mốc hạn chót.

```mermaid
gantt
    title MAK Food and Drink - Ke hoach MVP va thuc te (2026)
    dateFormat YYYY-MM-DD
    axisFormat %d/%m

    section Sprint
    Sprint 0                              :done, s0, 2026-10-03, 2026-10-27
    Sprint 1                              :s1, 2026-10-28, 2026-11-04

    section Ke hoach (Gantt goc)
    P1 Pham vi va kien truc (WBS 2)       :done, p1, 2026-10-03, 2026-10-08
    P2 Thiet ke UI (WBS 3)                :done, p2, 2026-10-08, 2026-10-13
    P3 Nen tang dat mon (WBS 4.1-4.6)     :done, p3, 2026-10-13, 2026-10-23
    P4 Van hanh (WBS 4.7-4.9)             :done, p4, 2026-10-23, 2026-10-29
    P5 Kiem thu va phat hanh (WBS 6, 7)   :p5, 2026-10-29, 2026-11-02

    section Thuc te (nhat ky tien do)
    Backend MVP P3.0-P3.5                 :done, a1, 2026-10-06, 1d
    Bao mat, thong bao, danh gia, OTP     :done, a2, 2026-10-08, 2026-10-10
    Bao cao, admin, quen mat khau         :done, a3, 2026-10-09, 1d
    Vi doi soat, VietQR + SePay           :done, a4, 2026-10-11, 1d
    Voucher, rut gon luong don            :done, a5, 2026-10-19, 1d
    Ban do va quang duong                 :done, a6, 2026-10-20, 1d
    Tai xe MAK, dang ky ca                :done, a7, 2026-10-21, 2026-10-23
    Do kiem tai, sua nghen dat don        :done, a8, 2026-10-27, 1d
    Tai lieu quan ly du an                :done, a9, 2026-10-27, 2026-11-13

    section Sprint 1 (WBS)
    S1-1 On dinh VPS (7.2)                :t1, 2026-10-28, 2026-11-01
    S1-2 Kiem thu thu cong 7 luong (6.4)  :t2, 2026-10-28, 2026-11-01
    S1-6 Moi nguoi tu demo (8.4)          :t6, 2026-10-30, 1d
    S1-3 Sua loi giao dien (5.5)          :t3, 2026-10-30, 2026-11-02
    S1-4 Ra soat bao mat (6.5)            :t4, 2026-10-29, 2026-11-02
    S1-5 Anh chup demo (8.2)              :t5, 2026-10-30, 2026-11-02
    S1-7 Slide va bao cao (8.3)           :t7, 2026-10-30, 2026-11-03
    S1-8 Cap nhat tai lieu                :t8, 2026-11-02, 2026-11-04

    section Moc
    Han MVP                               :crit, milestone, m1, 2026-11-02, 0d
    Phat hanh v0.1.0                      :milestone, m2, 2026-11-12, 0d
```

Tên việc trong biểu đồ viết không dấu cho gọn. Bảng dưới là bản đầy đủ.

## 2. Bảng tiến độ

| WBS | Công việc | Kế hoạch | Thực tế / hạn | Người phụ trách (R) | |
|---|---|---|---|---|---|
| 2 | P1 — Phạm vi và kiến trúc | 03/10 – 08/10 | Xong; câu hỏi mục 10 còn mở | An Đức Mạnh, Lương Minh Khánh | 🟡 |
| 3 | P2 — Thiết kế UI | 08/10 – 13/10 | UI khách xong; wireframe chủ quán chưa có | Trương An | 🟡 |
| 4.1–4.6 | P3 — Nền tảng đặt món | 13/10 – 23/10 | **Xong sớm 06/10** | An Đức Mạnh | ✅ |
| 4.7–4.9 | P4 — Vận hành | 23/10 – 29/10 | Báo cáo 09/10, đánh giá 08/10; COD `paymentStatus` chưa làm | An Đức Mạnh | 🟡 |
| 4.10 | Mở rộng ngoài kế hoạch (voucher, ví, VietQR, bản đồ, tài xế, ca) | Không có trong Gantt gốc | 11/10 – 22/10 | An Đức Mạnh | ✅ |
| 6, 7 | P5 — Kiểm thử và phát hành | 29/10 – 02/11 | Đo tải 27/10; triển khai `sv22`; tag `v0.1.0` 12/11 | Cả nhóm | 🟡 |
| 7.2 | S1-1 Ổn định VPS | 28/10 – 31/10 | Hạn 31/10 | An Đức Mạnh | 🟡 |
| 6.4 | S1-2 Kiểm thử thủ công 7 luồng | 28/10 – 31/10 | Hạn 31/10 | Lương Minh Khánh | 🟡 |
| 5.5 | S1-3 Sửa lỗi giao diện | 30/10 – 01/11 | Hạn 01/11 | Trương An | 🟡 |
| 6.5 | S1-4 Rà soát bảo mật | 29/10 – 01/11 | Hạn 01/11 | An Đức Mạnh | 🟡 |
| 8.2 | S1-5 Ảnh chụp demo | 30/10 – 01/11 | Hạn 01/11, chưa có `docs/images/` | Lương Minh Khánh | ⬜ |
| 8.4 | S1-6 Mỗi người tự demo | 30/10 | Họp 30/10 | Cả nhóm | 🟡 |
| 8.3 | S1-7 Slide và báo cáo | 30/10 – 02/11 | Hạn 02/11 | Lương Minh Khánh | 🟡 |
| — | S1-8 Cập nhật tài liệu sau phát hành | 02/11 – 03/11 | Tài liệu cập nhật tới 12/11 | An Đức Mạnh | ✅ |

## 3. Nhận xét tiến độ

- **Backend đi trước kế hoạch:** P3 dự kiến 13/10 – 23/10 nhưng xong ngày 06/10 ([project.md](project.md) mục 8).
- **Phình phạm vi:** khoảng 11/10 – 22/10 nhóm làm thêm nhiều tính năng không có trong Gantt gốc (WBS 4.10), trong khi wireframe chủ quán (WBS 3.3) và ảnh demo (WBS 8.2) vẫn chưa xong ([RISKS.md](RISKS.md) R8, Retro Sprint 0).
- **Phát hành trễ hơn hạn MVP:** hạn MVP là 02/11, tag `v0.1.0` được gắn ngày 12/11.
- Từ Sprint 2, mỗi Sprint Planning cập nhật lại bảng mục 2 và thêm section mới vào biểu đồ. Ngày bắt đầu Sprint 2, 3 chưa được chốt trong [TEAM.md](TEAM.md) mục 3 ("Sau Sprint 1").
