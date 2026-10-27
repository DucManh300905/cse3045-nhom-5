# Đo kiểm tải — vòng đời đơn hàng

> Nhóm 5, CSE3045. Cập nhật: 27/10/2026.
> Tài liệu liên quan: [RISKS.md](RISKS.md) (R1, R11) · [QUALITY.md](QUALITY.md) · [API.md](API.md)

## 1. Mục đích

Đo độ trễ và tỉ lệ lỗi của **trọn vòng đời một đơn hàng** khi nhiều khách đặt cùng lúc, để biết VPS chịu được mức tải nào và tìm điểm nghẽn trước buổi demo / bảo vệ MVP (02/11/2026).

## 2. Công cụ và cách đo

Script: `backend/src/utils/loadTestOrders.js`, chạy bằng `npm run loadtest:orders` trong thư mục `backend/` (backend phải đang chạy).

**Vòng đời 1 đơn** (giao tận nơi, tiền mặt), mỗi bước là 1 request API thật:

| Bước | Request |
|---|---|
| 1. Xem trước | `POST /orders/preview` |
| 2. Đặt đơn | `POST /orders` (có Idempotency-Key) |
| 3. Quán nhận đơn | `POST /merchant/orders/:id/accept` |
| 4. Đi giao | `POST /merchant/orders/:id/status` → `DELIVERING` |
| 5. Đã giao | `POST /merchant/orders/:id/status` → `COMPLETED` |
| 6. Khách xem lại đơn | `GET /orders/:id` (kiểm tra đơn đã hoàn thành) |

**Nhịp tải:** cứ `60000 / rpm` mili giây gửi đúng 1 request. Ưu tiên bước kế tiếp của các đơn đang chạy, rảnh mới mở đơn mới. Hết thời gian thì không mở đơn mới, chỉ chạy nốt các đơn dở.

**Dữ liệu test:**
- Quán "Quán Load Test" (hoa hồng 0% để ví không âm, quán không bị khóa giữa chừng), mỗi món 30.000 đ, không giới hạn suất.
- 5 tài khoản khách, mật khẩu ngẫu nhiên mỗi lần chạy.
- Nơi nhận cố định nên quãng đường chỉ tính 1 lần rồi lấy từ bộ nhớ đệm, không tốn lượt Goong.
- Chạy xong dọn bằng `npm run loadtest:orders -- --cleanup`.

**Chỉ số:**
- min / avg / p50 / p90 / p95 / p99 / max: độ trễ theo mili giây. p95 nghĩa là 95% request nhanh hơn mức này.
- "Trọn vòng đời 1 đơn": từ lúc xem trước tới khi khách thấy "Hoàn thành". Con số này **gồm cả thời gian chờ tới lượt theo nhịp**, nên không phải thời gian server xử lý.

**Tiêu chí đạt** (mục tiêu nhóm đặt ra): không lỗi, và p95 của bước "Đặt đơn" dưới 2 giây.

## 3. Môi trường

| | VPS (lab) | Máy cá nhân (chỉ để so sánh) |
|---|---|---|
| Nơi chạy script | Ngay trên VPS, gọi API qua `localhost` (không qua Internet / Cloudflare) | Máy phát triển, gọi API qua `localhost` |
| MongoDB | MongoDB trên VPS, replica set 1 node, `cacheSizeGB: 0.25` | MongoDB tạm trong RAM (mongodb-memory-server) |
| Bộ nhớ | Khoảng 331 MB RAM khi vào qua cổng SSH của lab + 4 GB swap; RAM dùng 96–97% | Không giới hạn đáng kể |

Lưu ý: trên VPS, script test cũng chạy trên chính máy đó nên tranh RAM với backend và MongoDB. Kết quả vì vậy hơi xấu hơn so với khách gọi từ bên ngoài, nhưng không đổi kết luận.

## 4. Kết quả

### 4.1 Lần 1 — VPS, trước khi sửa nghẽn ghi (27/10/2026)

Cấu hình: 100 request/phút, 1 phút, 1 quán × 1 món (mọi đơn tranh cùng một món).

| Chỉ số | Giá trị |
|---|---|
| Thời gian chạy | 216,0 giây |
| Request | 206 (≈ 57,2 request/phút, mục tiêu 100) |
| Lỗi | 16 (7,77%) |
| Đơn | 45 mở · 29 trọn vòng đời · 16 dừng giữa chừng |

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 45 | 0 | 726 | 10023 | 8633 | 21123 | 21686 | 24717 | 24717 |
| 2. Đặt đơn | 45 | 16 | 3589 | 91100 | 113636 | 132616 | 133300 | 137594 | 137594 |
| 3. Quán nhận đơn | 29 | 0 | 1765 | 8951 | 9521 | 15611 | 16017 | 19210 | 19210 |
| 4. Đi giao | 29 | 0 | 1173 | 9050 | 9529 | 15924 | 16300 | 17516 | 17516 |
| 5. Đã giao | 29 | 0 | 1063 | 8438 | 8797 | 15303 | 16974 | 18100 | 18100 |
| 6. Khách xem lại đơn | 29 | 0 | 485 | 3401 | 3509 | 5673 | 7025 | 7656 | 7656 |
| **Tất cả request** | 206 | 16 | 485 | 26291 | 9529 | 124487 | 130153 | 133300 | 137594 |

Trọn vòng đời 1 đơn: 29 đơn · p50 117,7 giây · p95 162,7 giây · max 166,2 giây.

Lỗi: 16 × `HTTP 500 INTERNAL_ERROR` ở bước "Đặt đơn". Log backend ghi `WriteConflict` (code 112) / `TransientTransactionError`.

**Nguyên nhân:**
- Mọi đơn trong transaction đặt đơn cùng sửa **bộ đếm mã đơn của ngày** và **số suất của cùng một món**, nên các transaction xung đột ghi và phải chạy lại liên tục.
- VPS chậm vì thiếu RAM làm mỗi lần chạy lại càng lâu, tới mức bị bỏ và trả lỗi 500.

### 4.2 Sửa (27/10/2026) — xem RISKS R11

1. Lấy số thứ tự mã đơn **trước** transaction (tăng nguyên tử, không trùng mã). Đơn đặt thất bại thì mã nhảy số.
2. Xung đột ghi còn sót lại trả `409 SYSTEM_BUSY` ("Hệ thống đang bận, vui lòng bấm thử lại") thay vì 500.
3. Script có thêm `--shops` / `--items` để đo sát thực tế (mặc định 1 quán × 5 món).

### 4.3 Lần 2 — VPS, sau khi sửa (27/10/2026)

Cấu hình chung: 1 phút mỗi lần, 1 quán × 5 món (trừ lần ghi "1 món"), 5 khách. Backend không khởi động lại lần nào (pm2 giữ 240 lần trước và sau).

**Tóm tắt:**

| Mức tải | Request (đạt / phút) | Lỗi | Đơn trọn vòng đời | Đặt đơn p50 / p95 | Tất cả p50 / p95 | Đạt tiêu chí |
|---|---|---|---|---|---|---|
| 20 request/phút | 24 (20,7) | 0 | 4/4 | 790 / 864 ms | 669 / 878 ms | Có |
| 40 request/phút | 42 (40,7) | 0 | 7/7 | 715 / 1583 ms | 708 / 1241 ms | Có |
| 60 request/phút | 60 (60,0) | 0 | 10/10 | 849 / 1659 ms | 733 / 1307 ms | Có |
| 60 request/phút, 1 món | 66 (59,5) | 0 | 11/11 | 974 / 2453 ms | 638 / 1717 ms | Không (p95 > 2 giây) |

**Chi tiết — 20 request/phút** (69,4 giây):

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 4 | 0 | 478 | 623 | 485 | 994 | 994 | 994 | 994 |
| 2. Đặt đơn | 4 | 0 | 726 | 798 | 790 | 864 | 864 | 864 | 864 |
| 3. Quán nhận đơn | 4 | 0 | 577 | 719 | 691 | 878 | 878 | 878 | 878 |
| 4. Đi giao | 4 | 0 | 635 | 704 | 669 | 834 | 834 | 834 | 834 |
| 5. Đã giao | 4 | 0 | 598 | 656 | 611 | 711 | 711 | 711 | 711 |
| 6. Khách xem lại đơn | 4 | 0 | 409 | 435 | 432 | 461 | 461 | 461 | 461 |
| **Tất cả request** | 24 | 0 | 409 | 656 | 669 | 864 | 878 | 994 | 994 |

Trọn vòng đời: p50 15,4 giây · p95 15,5 giây · max 15,5 giây.

**Chi tiết — 40 request/phút** (62,0 giây):

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 7 | 0 | 176 | 586 | 538 | 1057 | 1057 | 1057 | 1057 |
| 2. Đặt đơn | 7 | 0 | 660 | 865 | 715 | 1583 | 1583 | 1583 | 1583 |
| 3. Quán nhận đơn | 7 | 0 | 556 | 860 | 798 | 1205 | 1205 | 1205 | 1205 |
| 4. Đi giao | 7 | 0 | 596 | 788 | 647 | 1241 | 1241 | 1241 | 1241 |
| 5. Đã giao | 7 | 0 | 624 | 987 | 777 | 2042 | 2042 | 2042 | 2042 |
| 6. Khách xem lại đơn | 7 | 0 | 393 | 500 | 430 | 915 | 915 | 915 | 915 |
| **Tất cả request** | 42 | 0 | 176 | 764 | 708 | 1190 | 1241 | 2042 | 2042 |

Trọn vòng đời: p50 9,4 giây · p95 14,0 giây · max 14,0 giây.

**Chi tiết — 60 request/phút** (60,0 giây):

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 10 | 0 | 380 | 658 | 655 | 734 | 1307 | 1307 | 1307 |
| 2. Đặt đơn | 10 | 0 | 742 | 951 | 849 | 1019 | 1659 | 1659 | 1659 |
| 3. Quán nhận đơn | 10 | 0 | 416 | 768 | 614 | 1035 | 1600 | 1600 | 1600 |
| 4. Đi giao | 10 | 0 | 498 | 735 | 733 | 815 | 1118 | 1118 | 1118 |
| 5. Đã giao | 10 | 0 | 433 | 834 | 618 | 1294 | 1718 | 1718 | 1718 |
| 6. Khách xem lại đơn | 10 | 0 | 65 | 414 | 282 | 754 | 1096 | 1096 | 1096 |
| **Tất cả request** | 60 | 0 | 65 | 727 | 733 | 1096 | 1307 | 1718 | 1718 |

Trọn vòng đời: p50 7,3 giây · p95 11,1 giây · max 11,1 giây.

**Chi tiết — 60 request/phút, 1 quán × 1 món** (trường hợp xấu nhất, 66,5 giây):

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 11 | 0 | 229 | 599 | 507 | 1219 | 1351 | 1351 | 1351 |
| 2. Đặt đơn | 11 | 0 | 628 | 1135 | 974 | 1825 | 2453 | 2453 | 2453 |
| 3. Quán nhận đơn | 11 | 0 | 484 | 675 | 636 | 703 | 1413 | 1413 | 1413 |
| 4. Đi giao | 11 | 0 | 584 | 1085 | 917 | 1627 | 2355 | 2355 | 2355 |
| 5. Đã giao | 11 | 0 | 441 | 807 | 681 | 1295 | 1717 | 1717 | 1717 |
| 6. Khách xem lại đơn | 11 | 0 | 237 | 518 | 463 | 796 | 823 | 823 | 823 |
| **Tất cả request** | 66 | 0 | 229 | 803 | 638 | 1413 | 1717 | 2453 | 2453 |

Trọn vòng đời: p50 9,8 giây · p95 12,7 giây · max 12,7 giây.

Sau 4 lần chạy, `npm run loadtest:orders -- --cleanup` đã xóa 32 đơn, 128 thông báo, 6 tài khoản và 1 quán test.

### 4.4 Tài nguyên VPS trong lúc đo (`vmstat 5`)

| Cột | Khoảng giá trị | Ý nghĩa |
|---|---|---|
| `swpd` | 480–552 MB | Dung lượng đang nằm trong swap |
| `free` | 104–127 MB | RAM còn trống theo hệ điều hành |
| `si` / `so` | 10–81 MB/giây / 6–51 MB/giây | Đọc từ swap lên / ghi xuống swap |
| `wa` | 9–54% | CPU ngồi chờ ổ đĩa |
| `us` | 1–9% | CPU dùng cho tính toán thật |

Hệ thống chuyển dữ liệu liên tục giữa RAM và swap, nên CPU chủ yếu chờ ổ đĩa. Cột `free` vẫn còn hơn 100 MB mà vẫn swap mạnh. Điều này khớp với giả thuyết các tiến trình (backend, MongoDB) bị giới hạn bộ nhớ riêng khi khởi động từ phiên SSH của lab (RISKS R1).

### 4.5 Đối chiếu: máy cá nhân (MongoDB tạm trong RAM)

Cấu hình: 100 request/phút, 30 giây, 1 quán × 1 món (bản script đầu tiên).

| Bước | Số | Lỗi | min | avg | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|
| 1. Xem trước | 9 | 0 | 8 | 13 | 9 | 40 | 40 | 40 | 40 |
| 2. Đặt đơn | 9 | 0 | 31 | 52 | 43 | 92 | 92 | 92 | 92 |
| 3. Quán nhận đơn | 9 | 0 | 24 | 42 | 32 | 68 | 68 | 68 | 68 |
| 4. Đi giao | 9 | 0 | 27 | 46 | 43 | 66 | 66 | 66 | 66 |
| 5. Đã giao | 9 | 0 | 23 | 40 | 30 | 74 | 74 | 74 | 74 |
| 6. Khách xem lại đơn | 9 | 0 | 5 | 7 | 6 | 9 | 9 | 9 | 9 |
| **Tất cả request** | 54 | 0 | 5 | 33 | 28 | 66 | 73 | 92 | 92 |

54 request (≈ 101,7 request/phút), 0 lỗi, 9/9 đơn trọn vòng đời; trọn vòng đời p50 3,0 giây (gần như toàn bộ là thời gian chờ tới lượt theo nhịp).

## 5. Kết luận

1. **Lỗi đặt đơn khi tải cao đã được xử lý.** Trước khi sửa: 7,8% request lỗi 500 và đặt đơn p50 114 giây. Sau khi sửa: 0 lỗi ở mọi mức đã đo, kể cả khi mọi đơn tranh cùng một món.
2. **Sức chịu hiện tại của VPS khoảng 60 request/phút**, tương đương khoảng 10 đơn trọn vòng đời mỗi phút, với p95 đặt đơn dưới 2 giây khi đơn chia ra nhiều món. Khi mọi đơn dồn vào 1 món, p95 đặt đơn lên 2,45 giây.
3. **VPS chậm hơn máy cá nhân khoảng 10–20 lần ngay cả khi tải nhẹ** (mỗi request 0,4–0,9 giây so với 10–90 ms). Nguyên nhân là thiếu RAM / swap, không phải code. Cách cải thiện: xin lab tăng RAM, hoặc chuyển MongoDB sang Atlas (RISKS R1).
4. Chưa đo lại mức 100 request/phút sau khi sửa.

## 6. Chạy lại

Trong `backend/` (trên VPS: sau `ssh bcse-kit`, thư mục `~/cse3045-nhom-5/backend`):

```bash
mkdir -p ~/loadtest-results
npm run loadtest:orders -- --rpm=60 --minutes=1 --out=$HOME/loadtest-results/lt-60.json | tee ~/loadtest-results/lt-60.txt
npm run loadtest:orders -- --cleanup
```

Tham số: `--rpm` (nhịp request/phút), `--minutes`, `--flow=delivery|pickup|prepaid`, `--shops`, `--items`, `--customers`, `--out` (lưu JSON), `--cleanup` (xóa dữ liệu test). Script từ chối chạy vào API không phải `localhost` trừ khi thêm `--yes`.

Mỗi lần đo mới, thêm một mục vào phần 4 (ghi ngày, cấu hình, bảng kết quả) và cập nhật kết luận.
