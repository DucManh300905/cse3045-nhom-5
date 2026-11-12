# Kế hoạch quản lý cấu hình — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 12/11/2026. Phiên bản hiện tại: **v0.1.0**.
> Tài liệu liên quan: [GIT.md](GIT.md) (nhánh, Pull Request, tag) · [TEAM.md](TEAM.md) (RACI) · [STAKEHOLDERS.md](STAKEHOLDERS.md) · [RISKS.md](RISKS.md)

Bản kế hoạch rút gọn, trả lời 7 câu hỏi của quản lý cấu hình. Việc đã thực hiện ghi "(Đã làm)", việc mới là kế hoạch ghi "(Chưa làm)".

## 1. Quản lý những gì (các hạng mục cấu hình)

| Mã | Hạng mục | Vị trí | Lưu trong Git |
|---|---|---|---|
| CI-01 | Mã nguồn backend | `backend/src/`, `backend/package.json`, `backend/package-lock.json` | Có |
| CI-02 | Mã nguồn frontend | `frontend/src/`, `frontend/public/`, `frontend/package.json`, `frontend/package-lock.json`, `vite.config.ts` | Có |
| CI-03 | Test tự động | `backend/tests/` (330 test), `HW3/tests/` | Có |
| CI-04 | Migration và script dữ liệu | `backend/src/utils/migrations/001…003`, `seedDemo.js`, `seeAdmin.js`, `loadTestOrders.js` | Có |
| CI-05 | Cấu hình CI | `.github/workflows/ci.yml` | Có |
| CI-06 | Mẫu biến môi trường | `backend/.env.example`, `frontend/.env.example` (chỉ tên biến và giá trị mẫu) | Có |
| CI-07 | Tài liệu đặc tả và quản lý | `docs/*.md`, `README.md`, `Requirements.md` | Có |
| CI-08 | Kế hoạch | `HW3/WBS food ordering.png`, `HW3/Gantt_MVP_he_thong_dat_mon.xlsx` | Có |
| CI-09 | Biến môi trường thật (mật khẩu, khóa API) | `backend/.env` trên VPS và trên máy mỗi người | **Không**, bị chặn bởi `.gitignore` (RISKS R2) |
| CI-10 | Dữ liệu MongoDB | MongoDB trên VPS (replica set 1 node) | **Không**, sao lưu riêng (mục 7) |
| CI-11 | File người dùng tải lên (giấy tờ quán, ảnh giao hàng, ảnh chân dung tài xế) | `backend/uploads/` trên VPS | **Không**, bị chặn bởi `.gitignore`, sao lưu riêng (mục 7) |
| CI-12 | Cấu hình máy chủ (pm2, `mongod.conf`, swap) | VPS lab `sv22.bcse-vju.com` | Không, ghi lại thông số trong [RISKS.md](RISKS.md) R1 |

**Không quản lý cấu hình:** `node_modules/` và `frontend/dist/`. Hai thư mục này luôn tạo lại được từ `package-lock.json` và mã nguồn.

## 2. Vai trò và trách nhiệm

Theo bảng RACI trong [TEAM.md](TEAM.md):

| Vai trò | Người | Trách nhiệm |
|---|---|---|
| Quản lý cấu hình (người tạo tag, giữ quyền merge vào `main`) | An Đức Mạnh | Tạo tag phát hành, cập nhật số phiên bản, giữ `.env` trên VPS, chạy sao lưu |
| Phê duyệt phát hành (A của mảng "Triển khai VPS và phát hành") | Lương Minh Khánh (PO) | Quyết định khi nào một bản được gắn tag và đưa lên VPS |
| Người review PR | Người A của mảng tương ứng trong RACI | Duyệt PR trước khi merge vào `develop` |
| Mọi thành viên | Cả nhóm | Làm việc trên nhánh riêng, không đưa bí mật lên Git, mỗi thay đổi đi qua PR |

## 3. Công cụ

| Mục đích | Công cụ |
|---|---|
| Quản lý phiên bản mã nguồn | Git, GitHub (`DucManh300905/cse3045-nhom-5`) |
| Theo dõi thay đổi, review | GitHub Pull Request, GitHub Issues |
| Kiểm thử tự động | Jest + Supertest + mongodb-memory-server; GitHub Actions |
| Quản lý thư viện | npm, `package-lock.json` (cài bằng `npm ci` để đúng phiên bản) |
| Triển khai | `git pull` trên VPS, pm2 giữ backend chạy |
| Sao lưu dữ liệu | `mongodump` / `mongorestore`, `tar` |

**CI hiện tại** (`.github/workflows/ci.yml`) có 3 job, chạy khi push lên `develop` / `feat/**` và khi mở PR vào `develop`:
- `test`: test ở thư mục gốc (`HW3/tests`);
- `backend-test`: 330 test backend, có cache binary MongoDB;
- `frontend-build`: kiểm tra TypeScript và build frontend.
- (Chưa làm) Thêm `main` và các tiền tố nhánh mới (`feature/**`, `fix/**`, `hotfix/**`, `docs/**`, theo [GIT.md](GIT.md)) vào điều kiện chạy CI. Hiện PR vào `main` và push lên các nhánh này chưa kích hoạt CI.

## 4. Điểm mốc (baseline)

Mỗi điểm mốc là một **tag Git dạng SemVer** đặt trên nhánh `main`. Cách tạo tag: xem [GIT.md](GIT.md) mục 5.

| Tag | Mốc | Nội dung |
|---|---|---|
| **v0.1.0** | Sprint 1 (hiện tại) | Bản MVP: khách đặt món (tiền mặt hoặc VietQR qua SePay), quán nhận và xử lý đơn, admin duyệt quán, voucher, tài xế MAK, đăng ký ca tài xế, sửa nghẽn ghi khi đặt đơn (R11), tài liệu quản lý dự án. Trùng với `develop` sau PR có tài liệu này |
| v0.2.0 | Cuối Sprint 2 (dự kiến) | VPS ổn định (R1), kiểm thử thủ công đủ 7 luồng nghiệm thu, CI chạy test backend |
| v1.0.0 | Bản nộp cuối kỳ / bảo vệ | Bản được giảng viên nghiệm thu |

Ngoài tag phát hành, nhóm còn hai điểm mốc nhẹ hơn:
- Mỗi PR đã merge vào `develop` là một mốc tích hợp.
- Mỗi lần VPS `git pull` thì ghi mã commit đang chạy vào nhật ký tiến độ ([project.md](project.md) mục 11).

## 5. Quy ước đặt tên

**Số phiên bản theo SemVer** `MAJOR.MINOR.PATCH`:

| Tăng | Khi nào | Ví dụ |
|---|---|---|
| MAJOR | Thay đổi phá vỡ tương thích: đổi hoặc xóa endpoint, đổi cấu trúc dữ liệu cần migration không tương thích ngược. Trước v1.0.0 thì thay đổi loại này chỉ tăng MINOR | `1.0.0` → `2.0.0` |
| MINOR | Thêm tính năng mới, tương thích ngược; kết thúc mỗi Sprint | `0.1.0` → `0.2.0` |
| PATCH | Chỉ sửa lỗi, không thêm tính năng | `0.1.0` → `0.1.1` |

**Quy tắc về phiên bản:**
- Tag luôn có chữ `v` ở đầu (`v0.1.0`) và là tag có chú thích (`git tag -a`).
- Trường `version` trong `package.json` (gốc, `backend/`, `frontend/`) luôn trùng với tag mới nhất. Từ v0.1.0 cả ba đã được đồng bộ về `0.1.0`; trước đó backend để `1.0.0` và frontend để `0.2.0` mà không theo quy tắc nào.
- Bản thử trước phát hành có thể gắn hậu tố, ví dụ `v0.2.0-rc.1`.

**Tên khác:** tên nhánh và thông điệp commit theo [GIT.md](GIT.md) mục 2 và 3. File migration đánh số `NNN-mo-ta.js` kèm script `migrate:NNN`. Tài liệu trong `docs/` có tên file viết hoa nếu là tài liệu quản lý (`RISKS.md`, `TEAM.md`), viết thường nếu là tài liệu kỹ thuật (`database.md`, `loadtest.md`).

## 6. Quy ước thay đổi

1. **Mọi thay đổi** đi qua PR vào `develop`, không push thẳng (chi tiết ở [GIT.md](GIT.md) mục 4).
2. **Thay đổi nghiệp vụ** (BR, phạm vi) phải có issue nhãn `decision` được PO phê duyệt **trước** khi code ([TEAM.md](TEAM.md) mục 4.3).
3. **Thay đổi cấu trúc dữ liệu:**
   - viết migration mới, không sửa migration đã chạy;
   - cập nhật [database.md](database.md) trong cùng PR;
   - ghi lệnh chạy migration vào mô tả PR để người triển khai làm theo.
4. **Thay đổi API:** cập nhật [API.md](API.md) trong cùng PR. Nếu đổi hoặc xóa endpoint đang dùng, ghi rõ "Thay đổi phá vỡ" trong mô tả PR.
5. **Thay đổi biến môi trường:**
   - thêm biến mới vào `.env.example` với giá trị mẫu, trong cùng PR;
   - người triển khai thêm giá trị thật vào `.env` trên VPS trước khi `git pull`;
   - không bao giờ dán giá trị thật vào chat, issue hay PR.
6. **Phát hành:** PR `develop` → `main`, được PO đồng ý, rồi gắn tag (mục 4).
7. **Sửa lỗi gấp trên bản đã phát hành:**
   - tạo nhánh `hotfix/...` từ `main`;
   - mở PR vào `main` và gắn tag PATCH;
   - sau đó merge `main` ngược về `develop`.
8. **Quay lại bản cũ khi bản mới lỗi:** trên VPS chạy `git checkout v0.1.0` rồi `pm2 restart`. Nếu bản mới đã chạy migration thì khôi phục dữ liệu từ bản sao lưu ngay trước lúc phát hành (mục 7).

## 7. Sao lưu

| Đối tượng | Cách sao lưu | Tần suất | Lưu ở đâu | Trạng thái |
|---|---|---|---|---|
| Mã nguồn, tài liệu, tag | Repo GitHub + bản clone trên máy của 3 thành viên | Mỗi lần push | GitHub và 3 máy | (Đã làm) |
| Dữ liệu MongoDB | `mongodump --uri "$MONGODB_URI" --gzip --archive=~/backups/db-$(date +%F).gz` | Hằng ngày và ngay trước mỗi lần phát hành / chạy migration | `~/backups/` trên VPS, chép thêm 1 bản về máy người quản lý cấu hình | (Chưa làm) |
| File tải lên | `tar czf ~/backups/uploads-$(date +%F).tgz -C ~/cse3045-nhom-5/backend uploads` | Hằng ngày | Như trên | (Chưa làm) |
| `.env` của VPS | Người quản lý cấu hình giữ một bản trong trình quản lý mật khẩu cá nhân | Mỗi khi đổi khóa | Ngoài Git, ngoài nhóm chat | (Chưa làm) |

**Quy tắc sao lưu:**
- Giữ 7 bản sao lưu dữ liệu gần nhất, xóa bản cũ hơn để tiết kiệm ổ đĩa VPS.
- Mỗi Sprint thử khôi phục một lần bằng `mongorestore --gzip --archive=<file>` vào một database tạm, để chắc bản sao lưu dùng được.
- Thư mục `~/backups/` không nằm trong repo, để dữ liệu thật của người dùng không bao giờ lên GitHub.
