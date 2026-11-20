# HW2 — Cấu trúc dữ liệu và Python nâng cao

> Phần việc của Lương Minh Khánh, nhánh `feature/hw2-khanh`.

Cài đặt các cấu trúc dữ liệu cho nghiệp vụ đặt món của MAK Food and Drink, viết bằng Python thuần (không thư viện ngoài), có test tự động.

| Module | Cấu trúc dữ liệu | Độ phức tạp | Nghiệp vụ |
|---|---|---|---|
| `mak_dsa/cart.py` | `dict` theo id món, `dataclass` bất biến | Thêm / sửa / xóa O(1) | Giỏ hàng, 1 quán / giỏ (BR-30), giá nguyên VND (BR-21) |
| `mak_dsa/order_state.py` | `StrEnum` + bảng chuyển `dict[Status, frozenset]` | Kiểm tra bước chuyển O(1) | Vòng đời đơn (BR-35) |
| `mak_dsa/order_queue.py` | Min-heap (`heapq`) | Thêm / lấy O(log n), xem đầu O(1) | Hàng đợi bếp: đơn hạn sớm làm trước |
| `mak_dsa/menu_search.py` | Cây Trie | Tìm O(độ dài từ khóa) | Tìm món theo tiền tố, không dấu |

Kỹ thuật Python nâng cao được dùng: `dataclass(frozen=True, slots=True)`, `StrEnum`, type hints (`ParamSpec`, `TypeVar`), generator (`KitchenQueue.drain`), decorator (`timed`), các phương thức đặc biệt (`__len__`, `__iter__`, `__contains__`).

## Chạy trên máy cá nhân

```powershell
cd hw2
uv sync                       # tạo .venv, cài pytest + ruff
uv run pytest -v              # chạy test
uv run ruff check .           # kiểm lỗi
uv run ruff format --check .  # kiểm định dạng
uv run python -m mak_dsa      # chạy demo + so sánh Trie với duyệt tuyến tính
```

## Dựng môi trường chạy thử trên VPS

Chạy trong terminal VPS sau khi `ssh bcse-kit` (xem hướng dẫn Buổi 1).

```bash
hostname                                  # phải là VPS nhóm được cấp (sv22)

# 1. Cài uv (một lần, vào ~/.local/bin, không cần sudo)
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/bin/env
uv --version

# 2. Lấy mã nguồn
mkdir -p ~/projects && cd ~/projects
[ -d cse3045-nhom-5 ] || git clone https://github.com/DucManh300905/cse3045-nhom-5.git
cd cse3045-nhom-5
git fetch origin
git checkout feature/hw2-khanh            # sau khi PR merge: git checkout develop
git pull

# 3. Cài Python 3.12 + thư viện, rồi kiểm tra
cd hw2
uv sync
uv run python --version
uv run pytest -v
uv run python -m mak_dsa
```

Đạt khi: `pytest` báo toàn bộ test `passed` và demo in ra kết quả so sánh thời gian.

Lưu ý:
- `uv` tự tải Python 3.12 theo `.python-version`, không đụng tới Python của hệ thống.
- Không cần `sudo` và không sửa cấu hình Nginx: phần này chỉ chạy trong thư mục người dùng.
- Mã nguồn luôn lấy từ GitHub; thư mục trên VPS không phải bản duy nhất.
