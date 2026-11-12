# Quy ước Git, nhánh và Pull Request — MAK Food and Drink

> Nhóm 5, CSE3045. Cập nhật: 12/11/2026.
> Tài liệu liên quan: [CONFIG.md](CONFIG.md) (phiên bản SemVer, điểm mốc) · [TEAM.md](TEAM.md) (người duyệt theo RACI)

## 1. Mô hình nhánh

```
main      ──●────────────────●──────────►   chỉ chứa bản đã phát hành, mỗi mốc có tag (v0.1.0, v0.2.0…)
             \              /
develop   ────●──●──●──●──●─────────────►   nhánh tích hợp; VPS chạy nhánh này
               \    /  \ /
feature/…       ●──●    ●                   nhánh ngắn, mỗi nhánh một việc
```

| Nhánh | Mục đích | Ai được merge vào | Cách merge vào |
|---|---|---|---|
| `main` | Bản đã phát hành, ổn định | Người quản lý cấu hình (An Đức Mạnh), khi PO đồng ý | Chỉ qua PR từ `develop` hoặc `hotfix/*` |
| `develop` | Tích hợp mọi thay đổi; VPS lab `git pull` nhánh này | Người A của mảng tương ứng trong RACI | Chỉ qua PR |
| `feature/<mo-ta>` | Tính năng mới | — | Tách từ `develop`, PR vào `develop` |
| `fix/<mo-ta>` | Sửa lỗi chưa phát hành | — | Tách từ `develop`, PR vào `develop` |
| `docs/<mo-ta>` | Chỉ sửa tài liệu | — | Tách từ `develop`, PR vào `develop` |
| `hotfix/<mo-ta>` | Sửa gấp lỗi trên bản đã phát hành | — | Tách từ `main`, PR vào `main`, sau đó merge `main` về `develop` |

Tên nhánh viết thường, không dấu, nối bằng gạch ngang. Ví dụ: `feature/push-notification`, `fix/chuong-don-dau-tien`, `docs/sprint1-report`.

**Nhánh cũ:** các nhánh `FP/Update-Demo-DucManh`, `FP/Update-Demo-User`, `feature/hw1`… `feature/HW5`, `feat/ci-test` được tạo trước khi có quy ước này.
- Nhánh `FP/Update-Demo-<Tên>` là nhánh làm việc dài hạn của từng người. Nhánh này vẫn được dùng tới hết v0.1.0.
- Từ Sprint 2, mỗi việc dùng một nhánh ngắn theo bảng trên và xóa nhánh sau khi merge.

## 2. Thông điệp commit

Theo dạng Conventional Commits, nhóm đã dùng từ đầu dự án:

```
<loại>(<phạm vi, không bắt buộc>): <mô tả ngắn, tiếng Việt không dấu hoặc tiếng Anh>
```

| Loại | Dùng khi | Ví dụ trong repo |
|---|---|---|
| `feat` | Thêm tính năng | `feat: MAK shipper` |
| `fix` | Sửa lỗi | `fix: ma don lay ngoai transaction, xung dot ghi tra 409` |
| `docs` | Chỉ sửa tài liệu | `docs(RISKS): ket qua do tai sau khi sua R11` |
| `test` | Thêm / sửa test | `test: luong dat don` |
| `chore` | Cấu hình, thư viện, việc lặt vặt | `chore: add gitignore` |
| `refactor` | Sửa cấu trúc code, không đổi hành vi | — |

Quy tắc:
- Mỗi commit làm một việc.
- Mô tả nói "làm gì" chứ không ghi "update", "fix bug" chung chung. Commit `feat: Function Improvement` là ví dụ cần tránh.
- Không commit `.env`, `backend/uploads/`, `node_modules/`.

## 3. Quy trình một thay đổi

```bash
git checkout develop && git pull origin develop      # 1. lấy develop mới nhất
git checkout -b feature/ten-viec                      # 2. tạo nhánh
# ... code, chạy test: cd backend && npm test ...
git add <file> && git commit -m "feat: ..."           # 3. commit
git pull --no-edit origin develop                     # 4. cập nhật develop trước khi mở PR
git push -u origin feature/ten-viec                   # 5. đẩy nhánh lên, mở PR vào develop
```

## 4. Quy tắc Pull Request

1. **Đích:** mọi PR vào `develop`, trừ PR phát hành và `hotfix`, hai loại này vào `main`.
2. **Tiêu đề:** dùng đúng dạng thông điệp commit (mục 2).
3. **Mô tả** theo mẫu `.github/pull_request_template.md`:
   - làm gì, vì sao;
   - issue liên quan (`Liên quan: #12`);
   - cách kiểm tra;
   - tài liệu đã cập nhật;
   - lệnh migration hoặc biến `.env` mới, nếu có.
4. **Điều kiện để merge:**
   - CI xanh cả 3 job `test`, `backend-test`, `frontend-build` ([CONFIG.md](CONFIG.md) mục 3). PR vào `main` hiện chưa kích hoạt CI, nên chỉ merge `develop` vào `main` khi commit cuối trên `develop` đã xanh;
   - ít nhất **1 người duyệt** là người A của mảng đó trong RACI, không tự duyệt PR của chính mình;
   - tài liệu `docs/` liên quan đã được cập nhật trong cùng PR.
5. **Kích thước:** nên dưới khoảng 400 dòng thay đổi. PR lớn hơn thì chia nhỏ, hoặc ghi rõ thứ tự đọc trong mô tả.
6. **Thời gian review:** người duyệt phản hồi trong 24 giờ ([TEAM.md](TEAM.md) mục 4.1).
7. **Cách merge:** "Create a merge commit", giữ lịch sử từng commit. Merge xong thì xóa nhánh ngắn.
8. **Lưu ý:** trước khi đẩy lên, nếu bạn chạy `git pull --no-edit origin develop` thì Git tạo thêm commit `Merge branch 'develop'…`. Đây là bình thường: commit đó chỉ đưa thay đổi mới của `develop` vào nhánh của bạn, nên trong PR sẽ thấy thêm một dòng.

**Bảo vệ nhánh (Chưa làm):** bật Branch protection cho `main` và `develop` (GitHub, Settings → Branches): bắt buộc PR, bắt buộc 1 người duyệt, bắt buộc CI xanh, cấm force push.

## 5. Phát hành và gắn tag

Số phiên bản theo SemVer ([CONFIG.md](CONFIG.md) mục 5). Các bước:

1. PO đồng ý phát hành ([TEAM.md](TEAM.md), RACI mảng 6).
2. Trên `develop`: cập nhật `version` trong `package.json` (gốc, `backend/`, `frontend/`) và nhật ký tiến độ ([project.md](project.md) mục 11). Mở PR vào `develop` và merge.
3. Mở PR `develop` → `main`, tiêu đề `release: vX.Y.Z`, rồi merge.
4. Gắn tag có chú thích trên `main` và đẩy tag lên:
   ```bash
   git checkout main && git pull origin main
   git tag -a vX.Y.Z -m "vX.Y.Z - <tóm tắt mốc>"
   git push origin vX.Y.Z
   ```
5. Tạo GitHub Release từ tag đó (Releases → Draft a new release), dán tóm tắt thay đổi.
6. Sao lưu MongoDB trước khi cập nhật VPS ([CONFIG.md](CONFIG.md) mục 7).

**Các tag đã phát hành:**

| Tag | Ngày | Mốc | Commit |
|---|---|---|---|
| v0.1.0 | 12/11/2026 | Sprint 1: bản MVP + tài liệu quản lý dự án | Commit merge của PR `release: v0.1.0` trên `main` |

**Không bao giờ** xóa hoặc di chuyển một tag đã đẩy lên. Nếu gắn nhầm thì phát hành bản PATCH mới.
