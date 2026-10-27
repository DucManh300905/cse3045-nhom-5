# Đặc tả API — MAK Food and Drink

> REST + JSON, base URL `http://localhost:8080/api` (FE đọc từ `VITE_API_URL`).
> Tài liệu liên quan: [project.md](project.md) (nghiệp vụ, mã `BR-xx`) · [database.md](database.md)
> **Cập nhật lần cuối: 06/10/2026** — sau Bước 6b.

Ký hiệu: ✅ đã có (có test) · 🟡 có nhưng còn thiếu · ⬜ chưa làm · ⏭️ sau MVP
Quyền: 🌐 public · 👤 CUSTOMER · 🏪 RESTAURANT_OWNER · 🛡️ ADMIN · 🔑 mọi user đã đăng nhập

---

## 1. Quy ước chung

### 1.1 Response ✅

```json
// thành công
{ "success": true, "message": "Restaurant created successfully", "data": { } }

// danh sách có phân trang
{ "success": true, "data": { "items": [ ], "page": 1, "limit": 20, "total": 134 } }

// lỗi
{ "success": false, "message": "Item is out of stock", "code": "ITEM_OUT_OF_STOCK",
  "errors": [ { "field": "items[0].qty", "msg": "..." } ] }
```

- Mọi lỗi có **`code`** (máy đọc được, bảng ở mục 4). FE nên map `code` sang tiếng Việt; `message` tiếng Anh vẫn giữ như cũ để `getErrorMessage` hiện tại không vỡ. ✅
- `errors` có khi lỗi validate (400) hoặc thiếu hồ sơ (422 `PROFILE_INCOMPLETE`).
- Mọi response trả **`id`** (không có `_id`, `__v`, `password`) — plugin `toJSON` dùng chung. `GET /users/me` giờ cũng trả `id`, FE có thể bỏ `normalizeUser`. ✅
- Tiền là số nguyên VND; thời gian là ISO 8601 UTC; giờ mở cửa `HH:mm` theo giờ Việt Nam.

### 1.2 HTTP status

| Status | Khi nào |
|---|---|
| 200 / 201 | Thành công / tạo mới |
| 400 | Dữ liệu không hợp lệ (`VALIDATION_ERROR`), id sai định dạng, file sai loại |
| 401 | Thiếu / sai / hết hạn token, token cấp trước khi đổi mật khẩu |
| 403 | Sai vai trò, tài khoản bị khóa (`ACCOUNT_BLOCKED`), quán bị khóa (`RESTAURANT_BLOCKED`) |
| 404 | Không tìm thấy — **cũng dùng khi tài nguyên thuộc quán/người khác** (không lộ sự tồn tại) |
| 409 | Trùng dữ liệu, chuyển trạng thái sai, đang chờ duyệt, danh mục còn món, hết hàng |
| 422 | Vi phạm nghiệp vụ (hồ sơ thiếu, quán chưa duyệt, danh mục quán khác, quá số địa chỉ…) |
| 429 | Vượt rate limit (`RATE_LIMITED`) ✅ |

### 1.3 Xác thực & header

- `Authorization: Bearer <JWT>`; payload `{ userId, role }`, hết hạn 1 ngày. Mỗi request **đọc lại user trong DB**: bị khóa → 403, đã đổi mật khẩu sau khi cấp token → 401, role lấy từ DB. ✅
- FE: interceptor tự đăng xuất khi 401 hoặc 403 `ACCOUNT_BLOCKED` và báo lý do. ✅
- `Idempotency-Key: <uuid>` — **bắt buộc** với `POST /orders` (BR-38). Gửi lại cùng key trong 24h → 200 + đơn cũ. ✅
- Query danh sách: `page` (mặc định 1), `limit` (mặc định 20, tối đa 100). ✅
- Upload file: `multipart/form-data`; ảnh jpg/png/webp ≤ 2MB (field `image`), giấy tờ thêm pdf (field `file`); server kiểm tra chữ ký đầu file (magic bytes), không tin `mimetype` → sai thì 400 `INVALID_FILE_TYPE`. ✅
- Mật khẩu mới (đăng ký, đổi mật khẩu): ≥ 8 ký tự, không nằm trong danh sách phổ biến (`utils/passwordPolicy.js`); mật khẩu admin ≥ 12 ký tự. ✅

> ⚠️ **Express 5:** `req.query` chỉ đọc — sanitizer của express-validator (`.toInt()`, `.trim()`) **không** ghi lại được giá trị query, chỉ phần validate có tác dụng. Controller phải tự ép kiểu (`Number(req.query.page)`). Với `req.body` thì sanitizer hoạt động bình thường.

### 1.4 Middleware

| Middleware | File | Việc | |
|---|---|---|---|
| `authenticate` | `middlewares/auth.middleware.js` | Giải mã JWT, đọc lại user (status, role, `passwordChangedAt`) → `req.user` | ✅ |
| `authorizeRoles(...roles)` | `middlewares/role.middleware.js` | Chặn sai vai trò | ✅ |
| `loadMyRestaurant` | `middlewares/restaurant.middleware.js` | Tìm quán của owner → `req.restaurant`; chưa có → 404 | ✅ |
| `requireApprovedRestaurant` | ″ | Chỉ quán `APPROVED` (→ 422 `RESTAURANT_NOT_APPROVED`) | ✅ |
| `requireNotBlockedRestaurant` | ″ | Quán `BLOCKED` không được sửa (→ 403 `RESTAURANT_BLOCKED`) | ✅ |
| `validate` | `middlewares/validate.middleware.js` | Gom lỗi express-validator → 400 `VALIDATION_ERROR` | ✅ |
| `restaurantImageUpload`, `menuItemImageUpload`, `restaurantDocumentUpload` | `middlewares/upload.middleware.js` | `multer` lưu ổ đĩa, kiểm tra loại + dung lượng, bắt buộc có file | ✅ |
| `notFound`, `errorHandler` | `middlewares/error.middleware.js` | 404 route; gom `AppError`, `ValidationError`, `CastError`, lỗi trùng 11000, JSON hỏng | ✅ |
| `rateLimit` | `middlewares/rateLimit.middleware.js` | Đăng nhập / đổi mật khẩu: 10 lần **sai** / 15 phút / IP; đăng ký: 10 / giờ / IP. Sau proxy cần `TRUST_PROXY` | ✅ |
| `helmet` | `app.js` | Header bảo mật (nosniff, chống iframe, HSTS…), body JSON tối đa 100kb (→ 413) | ✅ |
| `idempotency` | `modules/order/order.service.js` | Header `Idempotency-Key` cho đặt đơn (xử lý trong service, không cần middleware riêng) | ✅ |

Tiện ích cho controller: `throw new AppError(status, code, message, errors?)` + bọc bằng `asyncHandler`; phân trang `getPagination` / `paginate` / `escapeRegex` (`utils/pagination.js`); rule validate dùng chung `textRule`, `phoneRule`, `locationRules`, `moneyRule` (`utils/validationRules.js`).

---

## 2. Danh sách endpoint

### 2.1 Health & file tĩnh

| Method | Path | Quyền | Mô tả | |
|---|---|---|---|---|
| GET | `/health` | 🌐 | Kiểm tra server | ✅ |
| GET | `/uploads/restaurants/<file>`, `/uploads/menu-items/<file>` | 🌐 | Ảnh quán/món (không có tiền tố `/api`) | ✅ |
| GET | `/docs` | 🌐 | Swagger UI | ⬜ |

### 2.2 Auth — `/auth`

| Method | Path | Quyền | Mô tả | BR | |
|---|---|---|---|---|---|
| POST | `/auth/register` | 🌐 | Đăng ký CUSTOMER / RESTAURANT_OWNER. **Đăng ký bằng email phải kèm `verificationToken`** (thiếu / sai → 400 `OTP_REQUIRED`); bằng SĐT chưa cần OTP | BR-01..03 | ✅ |
| POST | `/auth/login` | 🌐 | Đăng nhập bằng `identifier` (email/SĐT); vẫn nhận field `email` cũ | BR-04 | ✅ |
| PUT | `/auth/change-password` | 🔑 | `{ currentPassword, newPassword }` → trả **token mới** | BR-05 | ✅ |
| POST | `/auth/refresh` | 🌐 | Cấp lại access token | | ⏭️ |
| POST | `/auth/otp/send` | 🌐 | `{ email }` gửi mã OTP **6 số** qua Gmail (hết hạn 5 phút; gửi lại sau 60 giây; ≤ 5 mã / giờ / email; 10 lần / 15 phút / IP). Email đã có tài khoản → 409 | BR-01 | ✅ |
| POST | `/auth/otp/verify` | 🌐 | `{ email, code }` → `{ verificationToken }` (15 phút). Sai → 400 `OTP_INVALID` + `attemptsLeft`; sai 5 lần → 429 `OTP_TOO_MANY_ATTEMPTS`; mỗi mã dùng 1 lần | BR-01 | ✅ |
| POST | `/auth/password/forgot` | 🌐 | `{ email }` gửi mã 6 số đặt lại mật khẩu. **Luôn trả 200 giống nhau** dù email có tài khoản hay không (chống dò email); tài khoản bị khóa không nhận mã. Cùng giới hạn như OTP đăng ký | BR-05 | ✅ |
| POST | `/auth/password/reset` | 🌐 | `{ email, code, newPassword }` — đúng mã → đặt mật khẩu mới (chính sách ≥ 8 ký tự, không phổ biến), `passwordChangedAt` → mọi phiên cũ hết hiệu lực, gửi email báo đã đổi. Mật khẩu yếu bị từ chối **trước** khi tính lượt nhập mã. Mã đăng ký không dùng được ở đây | BR-05 | ✅ |

`POST /auth/register`
```json
// request
{ "fullName": "Nguyễn Văn A", "email": "a@gmail.com", "phone": "0912345678", "password": "123456", "role": "CUSTOMER" }
// 201
{ "success": true, "message": "User registered successfully",
  "data": { "id": "…", "email": "a@gmail.com", "fullName": "Nguyễn Văn A", "phone": "0912345678", "role": "CUSTOMER", "status": "ACTIVE", "createdAt": "…" } }
```
Lỗi: 400 thiếu field / sai định dạng / role `ADMIN` · 409 `Email already exists` / `Phone already exists`.

`POST /auth/login`
```json
{ "identifier": "0912345678", "password": "123456" }
// 200 → { "data": { "token": "eyJ…", "user": { … } } }
```
Lỗi: 401 sai tài khoản · 403 bị khóa.

`PUT /auth/change-password`
```json
{ "currentPassword": "123456", "newPassword": "abcdef" }
// 200 → { "message": "Password changed successfully", "data": { "token": "eyJ…" } }
```
Lỗi: 400 `INVALID_PASSWORD` (sai mật khẩu cũ — **không** trả 401 để FE không tự đăng xuất) · 400 mật khẩu mới < 6 ký tự hoặc trùng mật khẩu cũ. FE phải lưu token mới vì token cũ hết hiệu lực.

### 2.3 User — `/users`

| Method | Path | Quyền | Mô tả | |
|---|---|---|---|---|
| GET | `/users/me` | 🔑 | Hồ sơ của tôi (kèm `addresses`) | ✅ |
| PUT | `/users/me` | 🔑 | Sửa `fullName`, `phone` (chuẩn hóa; `""` = xóa), `avatarUrl` | ✅ |
| GET | `/users/me/addresses` | 👤 | Danh sách địa chỉ | ✅ |
| POST | `/users/me/addresses` | 👤 | `{ receiverName, phone, addressLine, label?, isDefault?, lat?, lng? }` — tối đa 5 | ✅ |
| PUT | `/users/me/addresses/:addressId` | 👤 | Sửa / `isDefault: true` để đặt mặc định | ✅ |
| DELETE | `/users/me/addresses/:addressId` | 👤 | Xóa, trả danh sách còn lại | ✅ |

Lỗi: 400 SĐT sai, `lat`/`lng` thiếu cặp · 400 xóa SĐT khi không có email (BR-07) · 409 SĐT trùng · 422 `ADDRESS_LIMIT` · 404 địa chỉ không phải của mình · 403 nếu không phải CUSTOMER.

### 2.4 Public — quán & menu (khách xem, không cần đăng nhập) ✅

Chỉ hiện quán `APPROVED`, danh mục `isActive`, món chưa xóa (BR-12). Không trả giấy tờ, hoa hồng, chủ quán, trạng thái duyệt, `soldToday`, `dailyLimit`.

| Method | Path | Mô tả | |
|---|---|---|---|
| GET | `/restaurants` | Query: `q` (tìm không dấu theo tên), `cuisine`, `isOpen=true` (đang bật nhận đơn **và** trong giờ mở cửa VN), `sort=rating\|name\|newest` (mặc định `rating`), `page`, `limit` | ✅ |
| GET | `/restaurants/:idOrSlug` | Chi tiết quán (id hoặc slug, ví dụ `quan-a`) + `isOpenNow`, `canAcceptOrders` | ✅ |
| GET | `/restaurants/:idOrSlug/menu` | Menu theo danh mục; món hết vẫn hiện với `isOrderable: false`; danh mục rỗng bị bỏ | ✅ |
| GET | `/menu-items` | Tìm món toàn hệ thống (thay `data/menu.ts`). Query: `q` (không dấu), `type=FOOD\|DRINK`, `restaurant` (id), `inStock=true`, `sort=popular\|price\|-price\|newest` (mặc định `popular`), `page`, `limit` | ✅ |
| GET | `/menu-items/:id` | Chi tiết món + variants + optionGroups + quán | ✅ |
| GET | `/restaurants/:idOrSlug/reviews` | Đánh giá đang hiện của quán (mới sửa nhất trước), `?rating=1..5`, phân trang; kèm `summary { ratingAvg, ratingCount, distribution }`; tên khách rút gọn | ✅ |
| GET | `/restaurants?minRating=4` · `/menu-items?minRating=4` | Chỉ quán (món của quán) từ 4★, đã có đánh giá. `sort=rating` (mặc định) = điểm có trọng số `ratingScore` | ✅ |
| GET | `/restaurants?lat=&lng=&sort=distance` | Sắp theo khoảng cách | ⏭️ (`$near` không đi chung phân trang hiện tại) |

Ví dụ `GET /restaurants/quan-c/menu`
```json
{ "success": true, "data": {
  "restaurant": { "id": "…", "name": "Quán C", "slug": "quan-c", "minOrderAmount": 20000,
                  "openingHours": [ { "dayOfWeek": 1, "open": "06:00", "close": "21:00" } ],
                  "isOpenNow": true, "canAcceptOrders": true, "ratingAvg": 0, "ratingCount": 0 },
  "categories": [ { "id": "…", "name": "Đồ uống", "items": [
    { "id": "…", "name": "Trà sữa trân châu", "basePrice": 25000, "imageUrl": "…", "type": "DRINK",
      "variants": [ { "id": "…", "name": "M", "price": 25000, "isDefault": true },
                    { "id": "…", "name": "L", "price": 32000, "isDefault": false } ],
      "optionGroups": [ { "id": "…", "name": "Topping", "minSelect": 0, "maxSelect": 2,
                          "options": [ { "id": "…", "name": "Trân châu", "price": 5000, "isAvailable": true } ] } ],
      "isAvailable": true, "soldCount": 99, "remainingToday": 30, "isOrderable": true } ] } ] } }
```

Mỗi phần tử của `GET /menu-items` có thêm `restaurant: { id, name, slug, isOpenNow, canAcceptOrders }`.

### 2.5 Merchant — chủ quán quản lý quán của mình

Tất cả: `authenticate` + `authorizeRoles('RESTAURANT_OWNER')` + `loadMyRestaurant` (trừ `POST /merchant/restaurant`). Tài nguyên của quán khác → 404.
Route cũ `/api/restaurants`, `/api/restaurants/my-restaurant` **đã bỏ** (đường dẫn `/api/restaurants` giờ là API public ở mục 2.4).

**Hồ sơ quán — `/merchant/restaurant`** ✅

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| POST | `/merchant/restaurant` | Tạo quán (`DRAFT`), tự sinh slug. Body: `name`, `address`, `phone` (bắt buộc), `description`, `cuisineTypes`, `minOrderAmount`, `deliveryRadiusKm`, `avgPrepMinutes`, `lat`+`lng` | BR-10, 17 | ✅ |
| GET | `/merchant/restaurant` | Xem quán của tôi (kèm `documents` không có đường dẫn, `isOpenNow`, `canAcceptOrders`) | | ✅ |
| PUT | `/merchant/restaurant` | Sửa các field như trên. Bỏ qua `status`, `commissionRate`, `owner`… `SUBMITTED` → 409, `BLOCKED` → 403 | BR-14 | ✅ |
| PUT | `/merchant/restaurant/opening-hours` | `{ openingHours: [{ dayOfWeek, open, close }] }` ghi đè toàn bộ; chặn `close ≤ open`, khung chồng nhau | BR-13 | ✅ |
| POST | `/merchant/restaurant/images/:kind` | `kind` = `logo` \| `cover`, multipart field `image` | BR-72 | ✅ |
| POST | `/merchant/restaurant/documents` | multipart: `type` (`BUSINESS_LICENSE`\|`FOOD_SAFETY`\|`ID_CARD`) + `file`; cùng loại thì thay. Chỉ khi `DRAFT`/`REJECTED` | BR-14, 18 | ✅ |
| POST | `/merchant/restaurant/submit` | `DRAFT`/`REJECTED` → `SUBMITTED`; thiếu giờ mở cửa / giấy tờ → 422 `PROFILE_INCOMPLETE` kèm `errors` | BR-11, 15 | ✅ |
| PATCH | `/merchant/restaurant/accepting-orders` | `{ "isAcceptingOrders": true }` — chỉ quán `APPROVED` | BR-13 | ✅ |

**Danh mục — `/merchant/categories`** ✅ (quán `BLOCKED` chỉ xem được)

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET | `/merchant/categories` | Danh sách theo `sortOrder`, kèm `itemCount` | | ✅ |
| POST | `/merchant/categories` | `{ name, isActive? }` — thêm vào cuối | BR-25 | ✅ |
| PUT | `/merchant/categories/:id` | Sửa tên / ẩn hiện | BR-25 | ✅ |
| DELETE | `/merchant/categories/:id` | Còn món → 409 `CATEGORY_NOT_EMPTY` | BR-25 | ✅ |
| PATCH | `/merchant/categories/reorder` | `{ ids: [...] }` — phải đủ mọi danh mục của quán, không lặp | | ✅ |

**Món — `/merchant/menu-items`** ✅ (quán `BLOCKED` chỉ xem được; quán `DRAFT` vẫn soạn menu được)

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET | `/merchant/menu-items` | Mọi món chưa xóa (kể cả hết hàng), sắp theo danh mục rồi món. Query: `category`, `q` (không dấu) | | ✅ |
| GET | `/merchant/menu-items/:id` | Chi tiết | | ✅ |
| POST | `/merchant/menu-items` | Tạo món (variants, optionGroups). Danh mục quán khác → 422 `INVALID_CATEGORY` | BR-20..22, 26 | ✅ |
| PUT | `/merchant/menu-items/:id` | Sửa; `variants`/`optionGroups` gửi lên thì **ghi đè toàn bộ** — gửi kèm `id` cũ để giữ id. Đổi giá → audit log | BR-26, 27 | ✅ |
| PATCH | `/merchant/menu-items/:id/availability` | `{ isAvailable?, dailyLimit? }` (`dailyLimit: null` = không giới hạn) | BR-23 | ✅ |
| POST | `/merchant/menu-items/:id/image` | multipart field `image` | BR-72 | ✅ |
| DELETE | `/merchant/menu-items/:id` | Xóa mềm | BR-24 | ✅ |
| PATCH | `/merchant/menu-items/reorder` | Sắp xếp món trong danh mục | | ⏭️ |
| POST | `/merchant/menu-items/import` | Import CSV | | ⏭️ |

Ví dụ `POST /merchant/menu-items`
```json
{ "category": "…", "name": "Trà sữa", "type": "DRINK", "dailyLimit": 50,
  "variants": [ { "name": "M", "price": 25000, "isDefault": true }, { "name": "L", "price": 32000 } ],
  "optionGroups": [ { "name": "Mức đường", "minSelect": 1, "maxSelect": 1,
                      "options": [ { "name": "50%", "price": 0 }, { "name": "100%", "price": 0 } ] },
                    { "name": "Topping", "minSelect": 0, "maxSelect": 3,
                      "options": [ { "name": "Trân châu", "price": 5000 }, { "name": "Thạch", "price": 5000 },
                                   { "name": "Pudding", "price": 7000 } ] } ] }
```
Quy tắc giá: có `variants` → `basePrice` tự bằng giá biến thể mặc định (gửi `basePrice` sẽ bị ghi đè); không có `variants` → `basePrice` bắt buộc. Response có thêm `remainingToday`, `isOrderable`.

**Đơn hàng của quán — `/merchant/orders`** ✅ (quán bị khóa vẫn xử lý được đơn đang dở; đơn quán khác → 404)

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET | `/merchant/orders` | Lọc `status` (nhiều giá trị, ví dụ `PLACED,ACCEPTED,PREPARING`), `from`, `to`, phân trang. Kèm `customer { fullName, phone }`, `nextStatus`. Chỉ `status=PLACED` thì cũ nhất trước | | ✅ |
| GET | `/merchant/orders/:id` | Chi tiết + `statusHistory` | | ✅ |
| POST | `/merchant/orders/:id/accept` | PLACED → ACCEPTED, `estimatedReadyAt` = giờ nhận + `avgPrepMinutes` | BR-35 | ✅ |
| POST | `/merchant/orders/:id/reject` | `{ reasonCode: OUT_OF_STOCK\|OVERLOADED\|CLOSED\|OTHER, note? }` PLACED → REJECTED, hoàn tồn kho | BR-35, 37 | ✅ |
| POST | `/merchant/orders/:id/status` | `{ "to": "PREPARING" \| "READY" \| "DELIVERING" \| "COMPLETED" }` — đi đúng từng bước; READY → DELIVERING (giao) hoặc → COMPLETED (tự lấy); COMPLETED → `paymentStatus: PAID` | BR-35, 39 | ✅ |
| POST | `/merchant/orders/:id/cancel` | `{ reasonCode, note? }` ACCEPTED → CANCELLED, hoàn tồn kho | BR-35, 37 | ✅ |
| POST | `/merchant/orders/:id/extend-prep` | Xin thêm thời gian | | ⏭️ |

**Voucher, đánh giá, báo cáo** — voucher ✅ xem mục 2.12

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET / POST | `/merchant/vouchers` | Danh sách / tạo voucher quán (mục 2.12) | BR-40, 41 | ✅ |
| PATCH / DELETE | `/merchant/vouchers/:id` | Sửa / tắt; không xóa / không đổi mức giảm nếu đã dùng | BR-45 | ✅ |
| GET | `/merchant/reviews` | Đánh giá của quán (kể cả bị ẩn, có cờ), `?rating=`, `?replied=false` | | ✅ |
| PUT | `/merchant/reviews/:id/reply` | `{ content }` trả lời / sửa trả lời; đánh giá quán khác → 404 | BR-61 | ✅ |
| GET | `/merchant/reports/summary` | `?from&to` (YYYY-MM-DD giờ VN, mặc định 30 ngày, tối đa 366) → `totalOrders`, `completedOrders`, `cancelledOrders`, `activeOrders`, `itemsSold`, `grossRevenue`, `commission`, `netRevenue`, `avgOrderValue`, `cancelRate` (trên đơn đã kết thúc), rating. Doanh thu chỉ tính đơn `COMPLETED`, theo ngày đặt | BR-52 | ✅ |
| GET | `/merchant/reports/revenue` | `?from&to&groupBy=day\|week\|month` → `series` đủ mọi kỳ (kỳ trống = 0; tuần bắt đầu thứ Hai; `period` = ngày đầu kỳ) | BR-51 | ✅ |
| GET | `/merchant/reports/top-items` | `?from&to&limit=10` → món theo số phần (đơn hoàn thành), cùng số phần thì doanh thu cao trước | | ✅ |

> **Luồng xử lý đơn rút gọn (19/10/2026):** `POST /merchant/orders/:id/accept` chuyển thẳng `PLACED → ACCEPTED → PREPARING` (lịch sử ghi đủ 2 bước, phát 1 sự kiện `order:status_changed` với `to: PREPARING`).
> Giao tận nơi: `PREPARING → DELIVERING → COMPLETED` (bỏ `READY`). Tự lấy: `PREPARING → READY → COMPLETED`. Quán hủy được (kèm lý do) khi `ACCEPTED`, `PREPARING`, `READY`; đã `DELIVERING` → 409.
> Đơn cũ đang ở `ACCEPTED` / `READY` (giao tận nơi) vẫn đi tiếp được. Giao diện chủ quán hỏi lại trước "Món đã xong", "Đi giao", "Đã giao / Khách đã lấy".

### 2.6 Đơn hàng của khách — `/orders` 🟡 (đặt / xem / hủy ✅, đánh giá ⬜)

| Method | Path | Quyền | Mô tả | BR | |
|---|---|---|---|---|---|
| POST | `/orders/preview` | 👤 | Tính tiền trước khi đặt (không lưu, không trừ kho). Body như `POST /orders` (không cần địa chỉ) | BR-31, 32 | ✅ |
| POST | `/orders` | 👤 | Đặt đơn — **header `Idempotency-Key`**. 201 đơn mới, 200 khi gửi lại cùng key. Voucher ⬜ (7b) | BR-30..38 | ✅ |
| GET | `/orders` | 👤 | Đơn của tôi, mới nhất trước, lọc `status=PLACED,ACCEPTED`, phân trang | | ✅ |
| GET | `/orders/:id` | 👤 | Chi tiết + `statusHistory`; đơn người khác → 404 | | ✅ |
| POST | `/orders/:id/cancel` | 👤 | `{ note? }` chỉ khi `PLACED`, hoàn suất; trạng thái khác → 409 | BR-35, 37 | ✅ |
| GET | `/restaurants/:idOrSlug/reviews/me` | 👤 | `{ canReview, review }` — đánh giá của tôi cho quán | BR-60 | ✅ |
| PUT | `/restaurants/:idOrSlug/reviews/me` | 👤 | `{ rating: 1..5, comment? }` viết mới (201) / sửa (200); chưa có đơn hoàn thành → 403 `REVIEW_NOT_ALLOWED`; 20 lần / giờ / IP | BR-60 | ✅ |
| DELETE | `/restaurants/:idOrSlug/reviews/me` | 👤 | Xóa đánh giá của tôi | BR-60 | ✅ |

`POST /orders`
```json
// header: Idempotency-Key: 7b1d…  ;  request
{ "restaurantId": "…",
  "fulfillmentType": "DELIVERY",
  "items": [ { "menuItemId": "…", "variantId": "…", "optionIds": ["…", "…"], "qty": 2, "note": "ít đá" } ],
  "addressId": "…",
  "delivery": { "receiverName": "Nguyễn Văn A", "phone": "0912345678", "addressLine": "KTX ĐH Việt Nhật, Hòa Lạc", "note": "" },
  "voucherCodes": ["QUAN10K", "MAK10"],
  "paymentMethod": "COD" }

// 201
{ "success": true, "data": { "id": "…", "code": "MAK261006-0042", "status": "PLACED",
  "subtotal": 64000, "deliveryFee": 0, "discount": 15000, "restaurantDiscount": 10000, "platformDiscount": 5000,
  "total": 49000, "vouchers": [ { "code": "QUAN10K", "fundedBy": "RESTAURANT", "discount": 10000 }, … ], "items": [ … ] } }
```
`addressId` (từ sổ địa chỉ) hoặc `delivery` — gửi một trong hai (đơn `PICKUP` không cần). Có `addressId` thì `delivery.note` vẫn được dùng làm ghi chú.
`fulfillmentType`: `DELIVERY` (mặc định, quán tự giao) | `PICKUP`. **Miễn phí giao hàng**: `deliveryFee` luôn = 0. Mã đơn `MAK<yyMMdd theo giờ VN>-<số thứ tự trong ngày>`.
Response cho khách **không** có `commissionRate`, `commissionAmount`.

Thứ tự xử lý ở server (trong 1 transaction):
1. Kiểm tra `Idempotency-Key` đã có → trả đơn cũ (200).
2. Quán `canAcceptOrders` (BR-12, 13 — đã có hàm `canAcceptOrders()`) → nếu không: 422 `RESTAURANT_CLOSED`.
3. Mỗi dòng: món thuộc quán, `isOrderable`, variant/option hợp lệ và `isAvailable`, đủ `minSelect/maxSelect` (BR-22) → 422 `INVALID_OPTIONS`.
4. Tính `unitPrice`, `subtotal` từ DB (BR-31); kiểm tra `minOrderAmount` (BR-32) → 422 `BELOW_MIN_ORDER`.
5. Kiểm tra voucher (BR-40..45, mục 2.12) → 422 `VOUCHER_*`; lượt dùng được giữ ở bước 7 sau khi tạo đơn.
6. Trừ tồn kho nguyên tử (BR-34) → 409 `ITEM_OUT_OF_STOCK` kèm `menuItemId`.
7. Tạo đơn `PLACED` + snapshot + `commissionAmount`; lưu idempotency key.
8. Sau commit: phát Socket `order:new` tới quán ✅, tạo notification cho chủ quán ✅.

### 2.7 Admin — `/admin`

Tất cả: `authenticate` + `authorizeRoles('ADMIN')`; mọi thao tác đổi dữ liệu ghi `auditlogs`.

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET | `/admin/restaurants` | `?status=` (mặc định `SUBMITTED`, `ALL` = tất cả; hồ sơ chờ duyệt sắp theo `submittedAt` tăng dần), `q`, `page`, `limit`. Kèm `owner { fullName, email, phone, status }` | | ✅ |
| GET | `/admin/restaurants/:id` | Chi tiết + `documents[].url` để xem giấy tờ | | ✅ |
| GET | `/admin/restaurants/:id/documents/:type` | Trả file giấy tờ private (`Cache-Control: private, no-store`) | BR-18 | ✅ |
| POST | `/admin/restaurants/:id/approve` | SUBMITTED → APPROVED (`approvedAt`, `approvedBy`) | BR-11, 71 | ✅ |
| POST | `/admin/restaurants/:id/reject` | `{ reason }` (bắt buộc) SUBMITTED → REJECTED | BR-11 | ✅ |
| POST | `/admin/restaurants/:id/block` | `{ reason? }` APPROVED → BLOCKED, tắt nhận đơn | BR-16 | ✅ |
| POST | `/admin/restaurants/:id/unblock` | BLOCKED → APPROVED | BR-16 | ✅ |
| PATCH | `/admin/restaurants/:id/commission` | `{ commissionRate }` (0–1) | BR-51 | ✅ |
| GET | `/admin/audit-logs` | `?action=&targetId=&page=&limit=`, kèm `actor { fullName, email, role }` | BR-70 | ✅ |
| GET | `/admin/users` | Lọc `role`, `status`, `q` (tên / email / SĐT), phân trang; chủ quán kèm `restaurant` | | ✅ |
| POST | `/admin/users/:id/block` · `/unblock` | `{ reason? }` khóa / mở; ADMIN → 403; đã ở trạng thái đó → 409; khóa chủ quán → quán tắt nhận đơn; audit `USER_BLOCK` / `USER_UNBLOCK` | BR-04 | ✅ |
| GET | `/admin/orders` · `/admin/orders/:id` | Xem mọi đơn (chỉ đọc): lọc `status` (nhiều giá trị), `restaurant`, `q` (mã đơn), `from`/`to`; kèm khách | | ✅ |
| GET | `/admin/reviews` | `?hidden=true\|false`, `?q=<tên quán>`, phân trang; kèm khách + quán | | ✅ |
| PATCH | `/admin/reviews/:id/hide` | `{ hidden, reason? }` ẩn / hiện; tính lại điểm quán; ghi audit `REVIEW_HIDE` / `REVIEW_UNHIDE` | | ✅ |
| GET | `/admin/reports/summary` | `?from&to&groupBy` → `gmv`, `platformRevenue` (hoa hồng), `orders`, `restaurants.byStatus`, `users.byRole` + `blocked` + `newInRange`, `series`, `topRestaurants` (5) | | ✅ |

Thông báo cho chủ quán khi được duyệt / từ chối / khóa / mở khóa: đẩy realtime `restaurant:status_changed` + lưu vào `notifications` ✅. Chủ quán nộp hồ sơ → mọi admin nhận `RESTAURANT_SUBMITTED` ✅.

### 2.8 Thông báo — `/notifications` ✅

Mọi vai trò đã đăng nhập; chỉ thấy thông báo của chính mình (của người khác → 404). Tự xóa sau 90 ngày.

| Method | Path | Quyền | Mô tả | |
|---|---|---|---|---|
| GET | `/notifications` | 🔑 | Mới nhất trước, `?unread=true`, phân trang; kèm `unreadCount` cho huy hiệu chuông | ✅ |
| PATCH | `/notifications/:id/read` | 🔑 | Đánh dấu đã đọc | ✅ |
| PATCH | `/notifications/read-all` | 🔑 | Trả `{ modifiedCount }` | ✅ |
| GET | `/notifications/unread-counts` | 🔑 | `{ total, byType: { ORDER_NEW: 2, ... } }` — số đỏ trên từng mục menu / tab (FE ánh xạ loại → mục ở `frontend/src/utils/badges.ts`) | ✅ |
| PATCH | `/notifications/read-types` `{ types: [...] }` | 🔑 | Mở trang / tab nào thì đánh dấu đã đọc thông báo của mục đó; trả `{ modifiedCount }` | ✅ |

| Khi nào | Ai nhận | `type` |
|---|---|---|
| Khách đặt đơn | Chủ quán | `ORDER_NEW` |
| Quán nhận / chuẩn bị / xong / đi giao / hoàn thành / từ chối / hủy; hệ thống tự hủy | Khách | `ORDER_STATUS` |
| Khách hủy; hệ thống tự hủy | Chủ quán | `ORDER_STATUS` |
| Chủ quán nộp hồ sơ | Mọi admin | `RESTAURANT_SUBMITTED` |
| Admin duyệt / từ chối / khóa / mở khóa | Chủ quán | `RESTAURANT_APPROVED` · `_REJECTED` · `_BLOCKED` · `_UNBLOCKED` |

Người thực hiện thao tác không tự nhận thông báo của chính mình. `data.link` = trang FE mở khi bấm.

### 2.9 Sau MVP ⏭️

| Module | Endpoint dự kiến |
|---|---|
| Nhân viên | `GET/POST/DELETE /merchant/staff`, `PATCH /merchant/staff/:id/role` |
| Ví & rút tiền | ✅ đã làm ở API-11 — xem mục 2.10 |
| Thanh toán trả trước | ✅ đã làm (W2) — xem mục 2.11 |
| Thanh toán | `POST /payments/vnpay/create`, `GET /payments/vnpay/return`, `POST /payments/vnpay/ipn` |
| Khiếu nại | `POST /orders/:id/disputes`, `GET /admin/disputes` |

---

### 2.10 Ví đối soát — `/merchant/wallet`, `/admin/wallets|topups|payouts` ✅ (API-11, 11/10/2026)

Không phải ví điện tử giữ tiền thật (cần giấy phép NHNN). Đây là **sổ cái kép** ghi ai nợ ai:
tiền thật vẫn đi qua tài khoản ngân hàng của MAK (quán nạp bằng chuyển khoản VietQR, admin chuyển trả quán rút).

| Ví | Số dư nghĩa là |
|---|---|
| `RESTAURANT` (mỗi quán) | `> 0` MAK nợ quán (rút được) · `< 0` quán nợ MAK (hoa hồng đơn tiền mặt) |
| `PLATFORM` | Doanh thu nền tảng = hoa hồng − voucher MAK chịu |
| `PAYOUT_HOLD` | Tiền quán đã yêu cầu rút, chờ admin chuyển |
| `EXTERNAL` | Đối ứng tiền thật ra / vào TK MAK (nạp −, chuyển cho quán +) → tiền MAK đang giữ = `−balance` |

**Bút toán** (tổng mỗi bút toán = 0, chạy trong cùng transaction với thao tác gốc, `ref` chống ghi trùng):

| Sự kiện | Ví quán | Đối ứng |
|---|---|---|
| Đơn COD `COMPLETED` (subtotal S, hoa hồng C = round(S × rate), voucher V) | `V − C` | PLATFORM `C − V` |
| Admin xác nhận nạp X | `+X` | EXTERNAL `−X` |
| Quán yêu cầu rút X | `−X` | PAYOUT_HOLD `+X` |
| Admin đã chuyển | — | PAYOUT_HOLD `−X`, EXTERNAL `+X` |
| Admin từ chối rút | `+X` | PAYOUT_HOLD `−X` |
| Admin điều chỉnh ±X (bắt buộc lý do, audit `WALLET_ADJUST`) | `±X` | PLATFORM `∓X` |

**Khóa nhận đơn (quyết định 11/10/2026):** ví quán được âm tối đa `WALLET_CREDIT_LIMIT` (100.000đ) trong `WALLET_GRACE_DAYS` (3 ngày).
Âm vượt hạn mức → khóa ngay (`walletLockReason = OVER_LIMIT`); âm liên tục quá 3 ngày → job hằng giờ khóa (`OVERDUE`).
Khóa = `restaurants.walletLockedAt` ≠ null → `canAcceptOrders = false` (khách thấy quán không nhận đơn, đặt → 422 `RESTAURANT_CLOSED`;
chủ bật nhận đơn → 409 `WALLET_LOCKED`). Chủ quán vẫn đăng nhập, xử lý đơn cũ và nạp tiền được.
Số dư về `>= 0` (nạp đủ) → **tự mở**, không cần bật lại. Không đụng `status` (BLOCKED là admin khóa tay).

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| GET | `/merchant/wallet` | `balance`, `available`, `negativeSince`, `lockDeadline`, `locked`, `lockReason`, `creditLimit`, `graceDays`, `payoutMin`, `topupMin`, `bankAccount`, `pendingTopup` (kèm QR), `pendingPayout`, `platformBank` | ✅ |
| GET | `/merchant/wallet/entries` | Lịch sử ví quán (mới nhất trước, phân trang) | ✅ |
| PUT | `/merchant/wallet/bank-account` | `{ bankName, accountNumber (6–20 số), accountName }` — tên chủ TK tự viết hoa | ✅ |
| POST | `/merchant/wallet/topups` | `{ amount >= TOPUP_MIN_AMOUNT }` → lệnh `PENDING`, `code` = nội dung CK `NAP{yyMMdd}{seq}`, `qrUrl` (img.vietqr.io; `null` nếu chưa cấu hình `PAYMENT_*`). Lệnh đang chờ cũ → `CANCELLED` | ✅ |
| GET | `/merchant/wallet/topups` · POST `/topups/:id/cancel` | Lịch sử lệnh nạp · hủy lệnh đang chờ (409 nếu đã xử lý) | ✅ |
| POST | `/merchant/wallet/payouts` | `{ amount >= PAYOUT_MIN_AMOUNT }`; cần tài khoản (422 `BANK_ACCOUNT_REQUIRED`), đủ số dư (422 `INSUFFICIENT_BALANCE`), một yêu cầu chờ mỗi lúc (409 `PAYOUT_PENDING`); quán BLOCKED → 403 | ✅ |
| GET | `/merchant/wallet/payouts` | Lịch sử rút | ✅ |
| GET | `/admin/wallets/overview` | `platformRevenue`, `cashHeld`, `payoutHold`, `owedToRestaurants`, `owedByRestaurants`, `negativeRestaurants`, `lockedRestaurants`, `pendingTopups`, `pendingPayouts`, `balanced` (tổng số dư = 0 và tổng dòng sổ = 0) | ✅ |
| GET | `/admin/wallets` | `?status=negative\|positive\|locked&q=<tên quán>` — âm nhiều nhất trước, kèm quán + `lockDeadline` | ✅ |
| GET | `/admin/wallets/:restaurantId/entries` | Sổ ví một quán | ✅ |
| POST | `/admin/wallets/:restaurantId/adjustments` | `{ amount (±, ≠ 0), reason }` | ✅ |
| GET | `/admin/topups` · `/admin/payouts` | `?status=&q=` | ✅ |
| POST | `/admin/topups/:id/confirm` | `{ receivedAmount?, bankRef? }` — lệnh `PENDING` hoặc `CANCELLED` (quán lỡ chuyển); audit `TOPUP_CONFIRM`; có thể mở khóa quán | ✅ |
| POST | `/admin/topups/:id/reject` | `{ reason }`; audit `TOPUP_REJECT` | ✅ |
| POST | `/admin/payouts/:id/paid` · `/reject` | `{ bankRef? }` · `{ reason }` (tiền trả lại ví); audit `PAYOUT_PAID` / `PAYOUT_REJECT` | ✅ |

Thông báo: `WALLET_NEGATIVE` (kèm hạn nạp), `WALLET_LOCKED`, `WALLET_UNLOCKED`, `TOPUP_CONFIRMED|REJECTED`, `PAYOUT_PAID|REJECTED` → chủ quán;
`TOPUP_REQUESTED`, `PAYOUT_REQUESTED` → admin.

**W2 ✅:** khách trả trước bằng VietQR + webhook SePay tự xác nhận (ví `ESCROW`, `REFUND_HOLD`) — mục 2.11;
lệnh nạp của quán cũng tự xác nhận khi SePay báo tiền về với nội dung `NAP…`.

---

### 2.11 Thanh toán trả trước — VietQR + SePay tự xác nhận ✅ (W2, 11/10/2026)

**Luồng:** khách chọn `paymentMethod: BANK_TRANSFER` → đơn `PENDING_PAYMENT` (giữ suất, `placedAt = null` nên quán chưa thấy, báo cáo không tính),
`paymentCode` = mã đơn bỏ dấu gạch (`MAK2610110001`), `paymentDeadline` = +`PAYMENT_TIMEOUT_MINUTES` (15') →
khách quét VietQR (số tiền + nội dung điền sẵn) → SePay gọi webhook → backend xác nhận → đơn `PLACED`, `paymentStatus = PAID`,
`placedAt = paidAt` (hạn 5' quán nhận đơn đếm từ đây) → chuông + thông báo cho quán như đơn COD.
Không có nút "tôi đã chuyển": chỉ webhook ngân hàng mới xác nhận tiền.

Chuyển khoản chỉ bật khi backend có đủ `PAYMENT_BANK_ID`, `PAYMENT_ACCOUNT_NO` và `SEPAY_WEBHOOK_API_KEY`; thiếu → đặt đơn 422 `PAYMENT_METHOD_UNAVAILABLE`.

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| GET | `/payments/methods` | Công khai: `{ COD, BANK_TRANSFER, paymentTimeoutMinutes }` | ✅ |
| POST | `/payments/sepay/webhook` | SePay gọi. Header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>` (sai → 401). Body SePay: `id`, `gateway`, `transactionDate`, `accountNumber`, `code`, `content`, `transferType`, `transferAmount`, `referenceCode`. Trả 200 `{ success: true, status }`; lỗi hệ thống → 500 để SePay gửi lại | ✅ |
| GET | `/orders/:id/payment` | Khách: `amount`, `paymentCode`, `paymentDeadline`, `qrUrl` (chỉ khi còn chờ), `bank`, `paymentStatus` | ✅ |
| POST | `/orders/:id/cancel` | Nay hủy được cả khi `PENDING_PAYMENT`; đơn đã trả → tự tạo lệnh hoàn | ✅ |
| GET | `/admin/refunds?status=PENDING\|DONE` | Lệnh hoàn tiền kèm khách (tên, SĐT, email), mã đơn, giao dịch gốc | ✅ |
| POST | `/admin/refunds/:id/done` | `{ bankRef? }` — admin đã chuyển trả; đơn → `REFUNDED`; audit `REFUND_DONE` | ✅ |
| GET | `/admin/payments?status=` | Mọi giao dịch SePay báo về | ✅ |
| POST | `/admin/payments/:id/resolve` | `{ action: refund\|ignore, note }` cho giao dịch `UNMATCHED`; audit `PAYMENT_REFUND` / `PAYMENT_IGNORE` | ✅ |

**Xử lý webhook** (mỗi `id` SePay chỉ xử lý một lần — `payments.providerTxId` unique):

| Trường hợp | Kết quả `status` | Tiền |
|---|---|---|
| Nội dung có `MAK…`, đơn đang chờ, chuyển ≥ tổng | `MATCHED_ORDER` | EXTERNAL −X, ESCROW +tổng, phần thừa → REFUND_HOLD + lệnh hoàn `OVERPAID` |
| Chuyển thiếu | `UNDERPAID` (đơn vẫn chờ) | hoàn toàn bộ khoản thiếu, báo khách chuyển lại đủ |
| Đơn đã hết hạn / hủy | `LATE` | hoàn toàn bộ |
| Đơn đã thanh toán rồi | `DUPLICATE` | hoàn toàn bộ |
| Nội dung có `NAP…` (lệnh nạp ví quán đang chờ) | `MATCHED_TOPUP` | cộng ví quán số thực nhận (`wallet.confirmTopup`), có thể mở khóa quán |
| Không nhận ra mã | `UNMATCHED` | chưa ghi sổ, báo admin → hoàn hoặc bỏ qua |
| Tiền ra / tài khoản khác `PAYMENT_ACCOUNT_NO` | `IGNORED` | — |

Mã được tìm trong `code`, `content`, `description` sau khi bỏ dấu cách / ký tự đặc biệt, không phân biệt hoa thường (`MAK\d{10}`, `NAP\d{10}`).

**Đơn đã trả bị hủy** (khách hủy, quán từ chối / hủy, quá 5' quán không nhận): `paymentStatus = REFUND_PENDING`, ESCROW −tổng → REFUND_HOLD, lệnh hoàn `ORDER_CANCELLED`, báo admin.
**Đơn hoàn thành:** ESCROW −tổng → ví quán (tổng + voucher − hoa hồng) + PLATFORM (hoa hồng − voucher).
**Quá hạn thanh toán:** job `paymentTimeout` (mỗi phút) → `CANCELLED` (`PAYMENT_TIMEOUT`), hoàn suất, không báo quán.

**Cấu hình SePay (làm một lần):**
1. Đăng ký my.sepay.vn, liên kết tài khoản ngân hàng nhận tiền của MAK.
2. Cấu hình chung → Cấu trúc mã thanh toán: thêm tiền tố `MAK` và `NAP`, phần sau 10 chữ số (nếu không cấu hình, backend vẫn tự tìm mã trong `content`).
3. Webhooks → Thêm: sự kiện "Có tiền vào", URL `https://<domain>/api/payments/sepay/webhook`, kiểu chứng thực **API Key** = giá trị `SEPAY_WEBHOOK_API_KEY` trong `backend/.env`.
   Cần domain cố định (Cloudflare Named Tunnel / domain riêng) — Quick Tunnel đổi URL mỗi lần khởi động.
4. Thử trên máy không cần SePay: `npm run sepay:simulate -- <nội dung> <số tiền>` (gọi webhook cục bộ với API key trong `.env`).

---

### 2.12 Voucher ✅ (API-5b, 19/10/2026)

**Hai loại** (quyết định 19/10/2026):
| Loại | Ai tạo | Ai chịu tiền giảm | Phạm vi |
|---|---|---|---|
| `PLATFORM` (voucher MAK) | Admin | Nền tảng — khi đơn hoàn thành, ví quán được cộng lại phần giảm (mục 2.10) | Mọi quán, hoặc danh sách `restaurants` |
| `RESTAURANT` (voucher quán) | Chủ quán | Quán | Chỉ quán đó |

**Áp vào đơn:** `voucherCodes: ["QUAN10K", "MAK10"]` ở `POST /orders/preview` và `POST /orders`.
- Tối đa **1 voucher quán + 1 voucher MAK** mỗi đơn; nhiều hơn → 422 `VOUCHER_STACK_LIMIT`.
- Voucher quán trừ trước trên tạm tính; voucher MAK trừ tiếp trên phần còn lại. Tổng giảm ≤ tạm tính.
- `PERCENT`: `floor(base × value / 100)`, tối đa `maxDiscount`. `FIXED`: `value`.
- Đơn tối thiểu (`minOrderAmount`) so với **tạm tính trước giảm giá**.
- Áp cho cả giao tận nơi / tự lấy. **Phương thức thanh toán**: người tạo chọn `paymentMethods` = `["COD"]`, `["BANK_TRANSFER"]` hoặc cả hai (mặc định); khách chọn sai → `VOUCHER_INVALID` / `WRONG_PAYMENT_METHOD` (kèm `paymentMethods`). Xem trước gửi kèm `paymentMethod` để kiểm tra. Đơn trả trước: khách chuyển `total` (đã trừ giảm giá).
- **Hoa hồng** = `round((subtotal − restaurantDiscount) × commissionRate)` — quán không trả hoa hồng trên khoản tự giảm; voucher MAK không làm giảm hoa hồng.
- Đơn lưu `restaurantDiscount`, `platformDiscount`, `discount` (tổng) và snapshot `vouchers[]`.
- Lượt dùng giữ ngay khi đặt (trong transaction), **trả lại khi đơn bị hủy / từ chối / hết hạn thanh toán**.
- Doanh thu quán trong báo cáo = `total + platformDiscount` (phần MAK bù là doanh thu của quán).

Lỗi (`errors[0].code` = mã voucher; `errors[0].reason` cho `VOUCHER_INVALID`):
| `code` | Khi nào | `reason` |
|---|---|---|
| `VOUCHER_INVALID` (422) | Mã không dùng được | `NOT_FOUND`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `WRONG_RESTAURANT`, `WRONG_PAYMENT_METHOD` (+ `paymentMethods`), `BELOW_MIN_ORDER` (+ `minOrderAmount`) |
| `VOUCHER_EXHAUSTED` (422) | Hết tổng lượt (`usedCount ≥ usageLimit`) | |
| `VOUCHER_USER_LIMIT` (422) | Khách đã dùng hết `perUserLimit` lượt (mặc định 1) | |
| `VOUCHER_STACK_LIMIT` (422) | Quá 2 mã hoặc 2 mã cùng loại | |
| `VOUCHER_IN_USE` (409) | Sửa mức giảm / xóa voucher đã có người dùng | |

| Method | Endpoint | Ai | Mô tả | |
|---|---|---|---|---|
| GET | `/vouchers/available?restaurantId=` | 👤 Khách | Voucher còn dùng được ở quán: đang hiệu lực, còn lượt, khách chưa dùng hết lượt | ✅ |
| GET / POST | `/merchant/vouchers` | 🏪 Chủ quán | Danh sách (`?status=ACTIVE\|INACTIVE\|EXPIRED&q=`) / tạo voucher quán. Quán phải `APPROVED`, không bị khóa | ✅ |
| PATCH / DELETE | `/merchant/vouchers/:id` | 🏪 | Sửa / xóa. Đã có người dùng: chỉ sửa `description`, `endAt`, `usageLimit` (≥ `usedCount`), `perUserLimit`, `isActive`; không xóa được | ✅ |
| GET | `/merchant/vouchers/:id/usage` | 🏪 | Các đơn đã dùng + `summary { uses, totalDiscount }` | ✅ |
| GET / POST / PATCH / DELETE | `/admin/vouchers[/:id]` | 🛡️ Admin | Như trên; tạo voucher MAK (`restaurants: [id]` để giới hạn quán); xem / tắt cả voucher của quán (`?fundedBy=`). Audit `VOUCHER_CREATE/UPDATE/DELETE` | ✅ |
| GET | `/admin/vouchers/:id/usage` | 🛡️ | Lượt dùng | ✅ |

Body tạo: `{ code (4–20 chữ/số, tự viết hoa, duy nhất toàn hệ thống), description?, type: PERCENT|FIXED, value, maxDiscount (bắt buộc với PERCENT), minOrderAmount?, paymentMethods? (COD / BANK_TRANSFER, ít nhất 1, mặc định cả hai), usageLimit? (null = không giới hạn), perUserLimit? (mặc định 1), startAt, endAt, isActive? }`. Mã trùng → 409 `DUPLICATE`.

---

### 2.13 Bản đồ & quãng đường giao ✅ (bản tối giản, 20/10/2026)

Đặc tả đầy đủ: file *"MAK Food — Đặc tả Bản đồ & Khoảng cách (v2)"*. Quy tắc BR-80 → BR-85 (docs/project.md).

- **Quãng đường** quán → nơi nhận lấy từ **Goong Direction** (đường đi thật, xe máy) qua module `backend/src/modules/routing/`.
  Chưa có `GOONG_API_KEY`, Goong lỗi hoặc quá `ROUTING_TIMEOUT_MS` → **ước lượng** đường chim bay × 1,3 (`source: ESTIMATE`). Kết quả Goong được lưu đệm 7 ngày (`routecaches`).
- **Bắt buộc vị trí** cho đơn giao tận nơi (BR-81): địa chỉ trong sổ đã ghim, hoặc gửi `delivery.lat` / `delivery.lng`
  (địa chỉ cũ chưa ghim → server lưu luôn vào sổ). Thiếu → 422 `LOCATION_REQUIRED`.
- **Ngoài bán kính** `deliveryRadiusKm` của quán → 422 `OUT_OF_DELIVERY_RANGE` (`errors[0]`: `distanceKm`, `maxKm`). Quán chưa có vị trí (dữ liệu cũ) → bỏ qua kiểm tra.
- **Nộp hồ sơ quán** phải có vị trí (BR-80) → thiếu: 422 `PROFILE_INCOMPLETE` với `field: location`.

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| POST | `/orders/preview` | Nhận thêm `addressId` / `delivery.lat` / `delivery.lng`; trả `route { distanceKm, durationMinutes, source, provider }` + `estimatedDeliveryMinutes` (null khi chưa có vị trí) | ✅ |
| POST | `/orders` | Như trên; đơn lưu `delivery.location`, `route` (kèm `polyline` nếu có), `estimatedDeliveryMinutes` | ✅ |
| GET | `/restaurants?lat=&lng=` · `/restaurants/:idOrSlug?lat=&lng=` | Thêm `distanceKm` ước lượng tới người xem (không gọi API định tuyến cho cả danh sách) | ✅ |
| GET | `/geo/status` | Công khai: `{ search, routing: goong│estimate }` | ✅ |
| GET | `/geo/autocomplete?input=&lat=&lng=` | 🔐 Gợi ý địa chỉ (Goong AutoComplete); chưa có khóa → 503 `GEO_UNAVAILABLE`; tối đa `GEO_RATE_LIMIT` (60) lần / phút | ✅ |
| GET | `/geo/place/:placeId` · `/geo/reverse?lat=&lng=` | 🔐 Tọa độ của gợi ý · địa chỉ của điểm vừa ghim | ✅ |

Biến môi trường: `GOONG_API_KEY`, `ROUTING_PROVIDER` (goong / estimate), `GOONG_VEHICLE` (mặc định `bike`), `ROUTING_TIMEOUT_MS` (3000), `GEO_RATE_LIMIT`.

---

### 2.14 Tài xế MAK — `/shipper/*`, `/admin/shippers`, `/admin/dispatch` ✅ (21/10/2026)

Kế hoạch + quyết định: file *"MAK Food — Kế hoạch triển khai Tài xế (Shipper)"* (Desktop). Quy tắc BR-90 → BR-97 (docs/project.md).

- **Hình thức giao của quán** (`restaurants.deliveryMode`): `SELF` (quán tự giao, như cũ) | `PLATFORM` (tài xế MAK). Chủ quán đổi bằng nút trên trang Hồ sơ quán.
  Đơn chụp lại `deliveryMode` lúc đặt. Đơn `PLATFORM` giao tận nơi **bắt buộc chuyển khoản trước** → tiền mặt: 422 `PREPAID_REQUIRED`.
- **Tiền công** `orders.shipperFee` = 10.000 đ cho 2 km đầu + 3.000 đ / km tiếp theo (km lẻ tròn lên) theo `route.distanceKm`; MAK trả, khách vẫn miễn phí ship.
- **Luồng**: quán nhận đơn → `PREPARING` + bắt đầu tìm tài xế (`delivery.status = SEARCHING`) → tài xế nhận (`ASSIGNED`) → tới quán (`ARRIVED_AT_STORE`)
  → quán bấm "Món đã xong" (`READY`) → tài xế lấy hàng (`DELIVERING` / `PICKED_UP`) → tài xế **chụp ảnh** giao (`COMPLETED` / `DELIVERED`).
  Quán không tự chuyển sang đang giao / hoàn thành với đơn `PLATFORM`.
- **Điều phối**: tài xế đã duyệt, trực tuyến, rảnh, vị trí ≤ 2 phút, trong 5 km quanh quán; lấy 10 người gần nhất (`$near`), xếp theo đường thật (Goong Distance Matrix, 1 lần gọi);
  mời lần lượt, mỗi lời mời 30 giây; tối đa 5 lời mời / 3 phút → `NO_SHIPPER`, báo quán (tự giao / tìm lại / hủy). Job `dispatch` chạy mỗi 10 giây.
- **Ảnh xác nhận giao**: file private, xem qua `GET /delivery/orders/:id/proof` (khách của đơn, chủ quán, tài xế giao đơn, admin; người khác 404). Đơn trả ra `delivery.proof = { kind, takenAt, url }`, không lộ đường dẫn file.
- **Ghi sổ** khi giao xong (cùng transaction): bút toán đơn như cũ + `SHIPPER_FEE` (PLATFORM → ví `shipper:<id>`). Quán hủy khi tài xế đã nhận (chưa lấy hàng) → `SHIPPER_COMPENSATION` 5.000 đ.

**Tài xế** (role `SHIPPER`, tự đăng ký ở `/shipper/login`):

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| POST · GET · PUT | `/shipper/profile` | Tạo / xem / sửa hồ sơ `{ fullName, phone, idNumber?, vehicleType: MOTORBIKE│EBIKE│BICYCLE, licensePlate? }`. Sửa chỉ khi `DRAFT` / `REJECTED` (khác: 409 `SHIPPER_PROFILE_LOCKED`) | ✅ |
| POST | `/shipper/profile/documents` | multipart `type` (`ID_CARD`, `DRIVER_LICENSE`, `VEHICLE_REGISTRATION`) + `file` — lưu private | ✅ |
| POST | `/shipper/profile/portrait` | multipart `photo` (ảnh JPG/PNG/WEBP ≤ 5MB, private) — **ảnh chân dung bắt buộc** (BR-104). Hồ sơ chưa nộp / bị từ chối: đổi tự do; đã nộp / đã duyệt: chỉ tải khi chưa có ảnh (409 `SHIPPER_PROFILE_LOCKED`) | ✅ |
| POST | `/shipper/profile/submit` | `DRAFT│REJECTED → SUBMITTED`; thiếu giấy tờ (xe máy: cả 3 + biển số; xe đạp / xe điện: CCCD) → 422 `PROFILE_INCOMPLETE` | ✅ |
| PUT | `/shipper/bank-account` | Tài khoản nhận tiền khi rút | ✅ |
| GET | `/shipper/state` | `{ shipper, offer (lời mời đang chờ — chưa có tên / SĐT khách), activeOrder }` để mở app | ✅ |
| POST | `/shipper/online` `{ lat?, lng? }` · `/shipper/offline` | Trực tuyến (cần `APPROVED`, không bị tạm ngưng — 409 `SHIPPER_DISPATCH_BLOCKED`) · nghỉ (đang giao → 409 `SHIPPER_BUSY`) | ✅ |
| POST | `/shipper/location` `{ lat, lng }` | Ghi đè vị trí; < 3 giây hoặc > 80 km/h → `{ accepted: false, reason }`. Đang giao → đẩy `shipper:location` + giờ đến dự kiến (tính lại tối đa mỗi phút) | ✅ |
| POST | `/shipper/offers/:id/accept` · `/decline` | Nhận (nguyên tử: chỉ 1 người thắng — 409 `OFFER_EXPIRED` / `ORDER_TAKEN` / `SHIPPER_BUSY`) · từ chối → mời người kế tiếp | ✅ |
| GET | `/shipper/orders` · `/shipper/orders/:id` | Lịch sử chuyến / chi tiết đơn của mình | ✅ |
| POST | `/shipper/orders/:id/arrived` · `/picked-up` | Tới quán · lấy hàng (`READY`, hoặc `PREPARING` nếu quán quên bấm) | ✅ |
| POST | `/shipper/orders/:id/delivered` | multipart `photo` (bắt buộc, ≤ 5MB, ảnh) → hoàn thành + ghi sổ | ✅ |
| POST | `/shipper/orders/:id/failed` | multipart `photo` + `reason` → `delivery.status = FAILED`, chờ admin | ✅ |
| POST | `/shipper/orders/:id/withdraw` `{ reason? }` | Trả đơn đã nhận (chưa lấy hàng) → tìm tài xế khác; trả **3 đơn liên tiếp** → khóa nhận đơn 1 ngày (BR-102) | ✅ |
| GET · POST | `/shipper/wallet`, `/wallet/entries`, `/wallet/payouts` | Thu nhập, lịch sử, rút tiền (cùng luồng rút của quán, admin chuyển ở `/admin/payouts`) | ✅ |

**Khách / chủ quán / ảnh:**

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| GET | `/orders/:id/tracking` · `/merchant/orders/:id/tracking` | `{ deliveryStatus, shipper, location (chỉ khi tài xế đang giữ đơn), eta, store, dropoff, polyline }` | ✅ |
| POST | `/orders/:id/shipper-rating` `{ stars 1–5, comment? }` | Khách đánh giá tài xế sau khi nhận hàng, 1 lần (409 `ALREADY_RATED`) | ✅ |
| PATCH | `/merchant/restaurant/delivery-mode` `{ deliveryMode }` | Nút chọn hình thức giao; `PLATFORM` cần MAK đã bật chuyển khoản (422 `PAYMENT_METHOD_UNAVAILABLE`) | ✅ |
| POST | `/merchant/orders/:id/self-deliver` · `/redispatch` | Không tìm được tài xế: quán tự giao đơn này · tìm lại | ✅ |
| GET | `/delivery/orders/:id/proof` | 🔐 Ảnh xác nhận / ảnh giao thất bại (mọi vai trò có liên quan) | ✅ |
| GET | `/delivery/shippers/:id/portrait` | 🔐 Ảnh chân dung tài xế: admin, chính tài xế, khách / chủ quán có đơn do tài xế đó nhận; người khác 404. Đơn trả kèm `delivery.shipperPortraitUrl`, theo dõi đơn trả `shipper.portraitUrl` | ✅ |

**Admin:**

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| GET | `/admin/shippers?status=&q=` · `/admin/shippers/:id` · `/:id/documents/:type` | Danh sách (mặc định chờ duyệt), chi tiết, xem giấy tờ | ✅ |
| POST | `/admin/shippers/:id/approve│reject│block│unblock` | Có audit log + thông báo; khóa → tắt trực tuyến, thu hồi lời mời | ✅ |
| GET | `/admin/shippers/online` · `/admin/dispatch` | Bản đồ tài xế trực tuyến · đơn đang tìm / không có tài xế / đang giao / giao thất bại | ✅ |
| POST | `/admin/orders/:id/assign` `{ shipperId }` · `/redispatch` | Gán tay (tài xế đã duyệt, đang rảnh) · tìm lại | ✅ |
| POST | `/admin/orders/:id/delivery/resolve` `{ action: COMPLETE│CANCEL, note? }` | Giao thất bại: hoàn thành như thường, hoặc hủy + hoàn tiền khách (không hoàn suất); tài xế vẫn nhận tiền công | ✅ |

Biến môi trường: `SHIPPER_BASE_FEE`, `SHIPPER_BASE_KM`, `SHIPPER_PER_KM`, `SHIPPER_CANCEL_COMPENSATION`, `SHIPPER_MAX_CANCELS_PER_DAY`,
`DISPATCH_RADIUS_KM`, `DISPATCH_OFFER_SECONDS`, `DISPATCH_MAX_OFFERS`, `DISPATCH_SEARCH_MINUTES`, `SHIPPER_LOCATION_FRESH_SECONDS`, `SHIPPER_STALE_MINUTES` (xem `backend/.env.example`).
Demo không cần tài xế thật: `npm run shipper:simulate -- --count=3` (tài khoản `sim.shipper<N>@mak.local`, mật khẩu ngẫu nhiên mỗi lần chạy).

---

### 2.15 Đăng ký ca tài xế — `/merchant/schedule`, `/shipper/shifts`, `/admin/shifts` ✅ (giai đoạn A, 22/10/2026)

Đặc tả: file *"MAK Food — Đặc tả Đăng ký ca tài xế (bản chốt)"* (Desktop). Quy tắc BR-98 → BR-103.

- **Ca = cam kết trực tuyến** trong khung giờ; đơn vẫn điều phối tự động, **ưu tiên tài xế đang trong ca** (không ai rảnh mới mời tài xế tự do).
- Quán chọn hình thức giao **`SCHEDULED` ("Theo lịch")**: trong khung quán xin **và** ca có ≥ 1 tài xế (đã đăng ký / đã vào ca) → đơn `PLATFORM` (chuyển khoản trước); ngoài ra → `SELF`.
  `GET /restaurants/:slug` và `/restaurants/:slug/menu` trả thêm `deliveryModeNow` (SELF│PLATFORM) và `platformWindowsToday`.
- Khung cố định: Trưa 10:30–13:30 · Chiều 15:00–17:00 · Tối 17:00–21:00; khung tự chọn 1–4 giờ, bước 30 phút. Một khu vực "Hòa Lạc".
- **Mốc** (job mỗi phút, chạy lại an toàn, làm bù mốc bị lỡ): 14:00 hỏi quán (lịch ngày mai dựng từ lịch tuần) · 18:00 chốt, gộp thành ca, gửi danh sách cho tài xế · 21:00 báo cáo quán ·
  mỗi ca: 2 giờ trước chốt đăng ký (ca trống → báo quán + admin) · 1 giờ trước nhắc · phút 15 nhắc người chưa trực tuyến · phút 30 chưa từng trực tuyến → **vắng ca**. Thông báo trong app + **email**.
- **Thang phạt** (vắng ca, hủy ca sát giờ < 2 giờ): cảnh cáo → khóa 3 ngày → khóa 5 ngày → khóa vĩnh viễn (`BLOCKED`); 30 ngày không vi phạm (tính từ lúc hết khóa): 1→0, 2→0, 3→2, rồi 30 ngày nữa → 0; admin mở lại tài khoản bị khóa vĩnh viễn → bậc 3.
  **Trả 3 đơn đã nhận liên tiếp** → khóa nhận đơn 1 ngày (luật riêng, thay "3 lần / 24 giờ"). Bị khóa: không trực tuyến / nhận đơn / đăng ký ca, **vẫn rút tiền được**.
- **Tài xế bắt buộc email đã xác thực**: cổng tài xế chỉ đăng ký bằng email (`/auth/register` role SHIPPER không có email → 400 `EMAIL_REQUIRED`); nộp hồ sơ / đăng ký ca cần email (403 `EMAIL_VERIFICATION_REQUIRED`).

| Method | Endpoint | Mô tả | |
|---|---|---|---|
| GET | `/merchant/schedule` | `{ deliveryMode, weeklySchedule, fixedSlots, times, days: [hôm nay, ngày mai] { date, closed, answered, windows, lateCancels, shifts } }` | ✅ |
| PUT | `/merchant/schedule/weekly` `{ weeklySchedule: [{ dayOfWeek, start, end, expectedOrders? }] }` | Ghi đè lịch tuần | ✅ |
| PUT | `/merchant/schedule/days/:date` `{ windows }` | Ngày mai trước 18:00: sửa tự do. Sau chốt (và hôm nay): chỉ **bỏ** khung → ghi hủy muộn, gỡ khỏi ca (ca hết quán → hủy, tài xế không bị phạt); thêm → 409 `SCHEDULE_CLOSED` | ✅ |
| PATCH | `/merchant/restaurant/delivery-mode` | Nhận thêm `SCHEDULED` | ✅ |
| GET | `/shipper/shifts` | Ca hôm nay + ngày mai: quán, số tài xế cần / đã có, `registrationClosesAt`, `myStatus` | ✅ |
| POST | `/shipper/shifts/:id/register` | Đăng ký (đã duyệt, email đã xác thực, không bị khóa tới giờ ca); trùng giờ → 409 `SHIFT_OVERLAP`; quá mốc → 409 `SHIFT_REGISTRATION_CLOSED` | ✅ |
| POST | `/shipper/shifts/:id/cancel` | Trước ≥ 2 giờ: không phạt; sát giờ: `LATE_CANCELLED` + vi phạm; đã bắt đầu → 409 `SHIFT_STARTED` | ✅ |
| GET | `/shipper/penalties` | `{ level, decayAt, lockedUntil, lockReason, consecutiveWithdrawals, blocked, history }` | ✅ |
| POST | `/shipper/email` `{ email, verificationToken }` | Tài khoản tài xế cũ thêm email: lấy vé qua `/auth/otp/send` + `/auth/otp/verify` | ✅ |
| GET | `/admin/shifts?date=` | Ca theo ngày + danh sách tài xế đăng ký và trạng thái | ✅ |
| GET · POST | `/admin/shippers/:id/penalties` · `/admin/shippers/:id/unlock` `{ reason? }` | Xem vi phạm · mở khóa tạm thời sớm (audit log) | ✅ |

Giai đoạn B (sau 02/11): yêu cầu tài xế đột xuất gửi tất cả tài xế, nút khiếu nại, Web Push, thống kê tỉ lệ lấp ca / nhận đơn.

---

## 3. Realtime — Socket.IO ✅

File: `src/realtime/socket.js` (server) · `frontend/src/context/SocketContext.tsx` (`useSocketEvent`). Cùng cổng với REST.

- Kết nối: `io(API_ORIGIN, { auth: { token } })`; server xác thực JWT ở middleware `io.use` (dùng lại logic của `authenticate`).
- Server tự join room khi kết nối: `user:{userId}`; nếu là owner thêm `restaurant:{restaurantId}`; admin thêm `admin`.
- Client **không** emit thay đổi dữ liệu — mọi thay đổi đi qua REST, socket chỉ để đẩy thông báo.

| Event (server → client) | Room | Payload | Khi nào |
|---|---|---|---|
| `order:new` | `restaurant:{id}` | `{ orderId, code, total, itemsCount, fulfillmentType, placedAt }` | Sau khi đặt đơn thành công → FE quán phát âm báo ✅ |
| `order:status_changed` | `user:{customerId}`, `restaurant:{id}` | `{ orderId, code, from, to, actorType, reason?, at }` | Mọi lần đổi trạng thái (kể cả SYSTEM timeout) ✅ |
| `notification:new` | `user:{id}` | `{ id, type, title, body, data: { orderId?, restaurantId?, code?, link }, isRead, createdAt }` | Khi tạo notification ✅ |
| `restaurant:status_changed` | `user:{ownerId}` | `{ restaurantId, status, rejectReason? }` | Admin duyệt / từ chối / khóa / mở khóa ✅ |
| `dispatch:offer` | `user:{shipperUserId}` | Lời mời: `{ offerId, orderId, code, expiresAt, toStoreKm, tripKm, fee, restaurant, dropoff }` | Mời tài xế nhận đơn (30 giây) ✅ |
| `dispatch:cancelled` | `user:{shipperUserId}` | `{ orderId, offerId?, reason: EXPIRED│ORDER_CHANGED│ORDER_CANCELLED│ASSIGNED_TO_OTHER }` | Lời mời hết giờ / đơn bị hủy / admin gán người khác ✅ |
| `delivery:changed` | khách, `restaurant:{id}`, tài xế, `admin` | `{ orderId, code, status, deliveryStatus, shipper }` | Bước giao của tài xế đổi ✅ |
| `shipper:location` | khách + `restaurant:{id}` của đúng đơn | `{ orderId, lat, lng, at, eta }` | Tài xế đang giữ đơn gửi vị trí (BR-97) ✅ |
| `ready` | (chính socket đó) | `{ rooms }` | Ngay sau khi vào phòng — dùng trong test |

Mất kết nối: FE tải lại danh sách đơn khi kết nối lại (`useSocketEvent('reconnected')`) để không sót đơn ✅. Chủ quán vừa tạo quán → FE tự kết nối lại để vào phòng `restaurant:{id}`.

---

## 4. Bảng mã lỗi (`code`)

| code | HTTP | Ý nghĩa | |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Sai định dạng dữ liệu, JSON hỏng, thiếu file | ✅ |
| `INVALID_PASSWORD` | 400 | Sai mật khẩu hiện tại khi đổi mật khẩu | ✅ |
| `OTP_REQUIRED` · `OTP_INVALID` · `OTP_EXPIRED` | 400 | Đăng ký email thiếu vé / mã sai / mã hết hạn hoặc đã dùng | ✅ |
| `OTP_TOO_SOON` · `OTP_LIMIT` · `OTP_TOO_MANY_ATTEMPTS` | 429 | Gửi lại trong 60 giây (`retryAfter`) / quá 5 mã một giờ / sai quá 5 lần | ✅ |
| `MAIL_FAILED` | 502 | Không gửi được email (SMTP lỗi) — gửi lại được ngay | ✅ |
| `INVALID_FILE_TYPE` / `INVALID_FILE` | 400 | File sai loại / quá 2MB | ✅ |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | BR-38 | ✅ |
| `RATE_LIMITED` | 429 | Thử đăng nhập / đăng ký / đổi mật khẩu quá nhiều lần | ✅ |
| `UNAUTHORIZED` | 401 | Thiếu token | ✅ |
| `TOKEN_EXPIRED` | 401 | Token sai / hết hạn / cấp trước khi đổi mật khẩu / user đã bị xóa | ✅ |
| `FORBIDDEN` | 403 | Sai vai trò (`authorizeRoles`) | ✅ |
| `ACCOUNT_BLOCKED` | 403 | Tài khoản bị khóa (BR-04) | ✅ |
| `RESTAURANT_BLOCKED` | 403 | Quán bị khóa, không được sửa | ✅ |
| `NOT_FOUND` | 404 | Không tìm thấy / không thuộc quyền của mình | ✅ |
| `DUPLICATE` | 409 | Trùng email/SĐT/tên danh mục/mã voucher | ✅ |
| `RESTAURANT_ALREADY_EXISTS` | 409 | BR-10 | ✅ |
| `RESTAURANT_UNDER_REVIEW` | 409 | Sửa hồ sơ khi đang `SUBMITTED` | ✅ |
| `RESTAURANT_DOCUMENTS_LOCKED` | 409 | Sửa giấy tờ sau khi đã nộp | ✅ |
| `INVALID_STATUS_TRANSITION` | 409 | Chuyển trạng thái quán/đơn không hợp lệ hoặc bị người khác đổi trước (BR-35, 71) | ✅ |
| `CATEGORY_NOT_EMPTY` | 409 | Xóa danh mục còn món | ✅ |
| `ITEM_OUT_OF_STOCK` | 409 | BR-34 — món hết suất / tạm hết / đã xóa; `errors[0].menuItemId` | ✅ |
| `REVIEW_NOT_ALLOWED` | 403 | Chưa có đơn hoàn thành ở quán (BR-60). Không còn `ALREADY_REVIEWED`: viết lại = sửa | ✅ |
| `PROFILE_INCOMPLETE` | 422 | Nộp hồ sơ khi thiếu giờ mở cửa / giấy tờ (BR-15) | ✅ |
| `RESTAURANT_NOT_APPROVED` | 422 | Bật nhận đơn khi chưa duyệt (BR-12) | ✅ |
| `INVALID_CATEGORY` | 422 | Món gắn vào danh mục của quán khác (BR-20) | ✅ |
| `ADDRESS_LIMIT` | 422 | Quá 5 địa chỉ (BR-06) | ✅ |
| `RESTAURANT_CLOSED` | 422 | BR-13 | ✅ |
| `BELOW_MIN_ORDER` | 422 | BR-32 | ✅ |
| `MULTIPLE_RESTAURANTS` | 422 | BR-30 | ✅ |
| `INVALID_OPTIONS` | 422 | BR-22 — sai biến thể, topping hết, chọn thiếu/thừa so với `minSelect`/`maxSelect` | ✅ |
| `VOUCHER_INVALID` / `VOUCHER_EXHAUSTED` / `VOUCHER_USER_LIMIT` / `VOUCHER_STACK_LIMIT` | 422 | BR-40..45 (mục 2.12) | ✅ |
| `VOUCHER_IN_USE` | 409 | Sửa mức giảm / xóa voucher đã có người dùng | ✅ |
| `LOCATION_REQUIRED` | 422 | Đơn giao tận nơi chưa ghim vị trí nơi nhận (BR-81) | ✅ |
| `OUT_OF_DELIVERY_RANGE` | 422 | Quãng đường > bán kính giao của quán (BR-83) | ✅ |
| `GEO_UNAVAILABLE` / `GEO_FAILED` | 503 / 502 | Chưa cấu hình / lỗi dịch vụ tra địa chỉ | ✅ |
| `WALLET_LOCKED` | 409 | Bật nhận đơn khi ví đang khóa (BR-55) | ✅ |
| `PAYMENT_METHOD_UNAVAILABLE` | 422 | Đặt đơn chuyển khoản khi MAK chưa cấu hình tài khoản nhận / SePay | ✅ |
| `PAYOUT_PENDING` | 409 | Đã có yêu cầu rút đang chờ | ✅ |
| `BANK_ACCOUNT_REQUIRED` | 422 | Rút tiền khi chưa lưu tài khoản ngân hàng | ✅ |
| `INSUFFICIENT_BALANCE` | 422 | Rút quá số dư ví | ✅ |
| `PORTRAIT_REQUIRED` | 409 | Tài xế chưa có ảnh chân dung bật trực tuyến (BR-104) | ✅ |
| `PREPAID_REQUIRED` | 422 | Quán giao bằng tài xế MAK mà khách chọn tiền mặt cho đơn giao tận nơi (BR-91) | ✅ |
| `SHIPPER_PROFILE_REQUIRED` / `SHIPPER_PROFILE_EXISTS` / `SHIPPER_PROFILE_LOCKED` | 404 / 409 / 409 | Chưa có / đã có / không sửa được hồ sơ tài xế | ✅ |
| `SHIPPER_NOT_APPROVED` / `SHIPPER_BLOCKED` | 403 | Hồ sơ tài xế chưa duyệt / bị khóa | ✅ |
| `SHIPPER_BUSY` / `SHIPPER_DISPATCH_BLOCKED` | 409 | Tài xế đang giao đơn khác / bị tạm ngưng do hủy nhiều (BR-94) | ✅ |
| `OFFER_EXPIRED` / `ORDER_TAKEN` | 409 | Lời mời hết hạn / đơn đã có tài xế khác nhận | ✅ |
| `ALREADY_RATED` | 409 | Đã đánh giá tài xế của đơn | ✅ |
| `SCHEDULE_CLOSED` | 409 | Thêm khung sau giờ chốt lịch | ✅ |
| `SHIFT_REGISTRATION_CLOSED` / `SHIFT_OVERLAP` / `SHIFT_STARTED` | 409 | Quá mốc đăng ký ca / trùng giờ ca khác / ca đã bắt đầu | ✅ |
| `EMAIL_REQUIRED` / `EMAIL_VERIFICATION_REQUIRED` | 400 / 403 | Tài xế đăng ký không có email / chưa xác thực email (BR-103) | ✅ |
| `SYSTEM_BUSY` | 409 | Xung đột ghi khi nhiều thao tác cùng sửa một bản ghi (transaction đã tự chạy lại mà vẫn xung đột). Chưa ghi gì, client thử lại được; đặt đơn có Idempotency-Key nên không tạo trùng (RISKS R11) | ✅ |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước (đã log ở server) | ✅ |

---

## 5. Lộ trình thực hiện phần API

Quy ước cho **mỗi endpoint**: route + validate → controller (`asyncHandler` + `AppError`) → test Supertest (case đúng + sai quyền + lỗi nghiệp vụ + truy cập chéo quán) → thêm vào Swagger → nối FE. Chỉ merge vào `develop` khi CI xanh.

| Bước | Thời gian (Gantt) | Việc | Kiểm chứng | |
|---|---|---|---|---|
| **API-0** Nền tảng | 13/10 – 14/10 | `AppError` + `errorHandler` + `code`; `validate`; `toJSON` trả `id`; Supertest + mongodb-memory-server (replica set); job CI `backend-test` | `npm test` chạy trên CI | 🟡 ✅ 06/10 — còn Swagger `/api/docs`, `rateLimit`, `helmet` |
| **API-1** Auth & User | 14/10 – 15/10 | `authenticate` đọc lại user; `change-password`; sổ địa chỉ; validate SĐT ở `PUT /users/me` | User bị khóa giữa chừng → request kế tiếp 403 | ✅ 06/10 |
| **API-2** Merchant: quán | 15/10 – 17/10 | `/merchant/restaurant`; `loadMyRestaurant`; giờ mở cửa; upload ảnh/giấy tờ; `submit`; `accepting-orders` | Luồng onboarding có test end-to-end | ✅ 06/10 |
| **API-3** Admin duyệt quán | 17/10 | `/admin/restaurants*` approve/reject/block/unblock/commission + xem giấy tờ + audit log | Owner nộp → admin duyệt → owner bật nhận đơn (test) | ✅ 06/10 (thông báo realtime ⬜) |
| **API-4** Menu | 17/10 – 19/10 | `/merchant/categories`, `/merchant/menu-items`; public `/restaurants`, `/restaurants/:idOrSlug/menu`, `/menu-items`; `seed:demo` | FE `/menu` chạy bằng API, xóa `data/menu.ts` | ✅ 06/10 |
| **API-5** Đặt đơn | 19/10 – 21/10 | `/orders/preview`, `POST /orders` (8 bước mục 2.6), idempotency — **7a**; voucher — **7b** | 5 request mua 1 suất cuối → 1 thành công, 4 lỗi 409 | ✅ 7a 06/10 · voucher 7b 19/10 |
| **API-6** Xử lý đơn + realtime | 21/10 – 23/10 | `orderStateMachine.js`; `/merchant/orders*`; `/orders/:id/cancel`; Socket.IO; job timeout + reset suất | Bảng chuyển trạng thái BR-35 được test đủ từng ô | ✅ 06/10 |
| **API-7** Thông báo | 23/10 – 24/10 | `/notifications*` + `notification:new` + báo duyệt/từ chối quán | Chuông thông báo trên FE | ✅ 08/10 |
| **API-8** Đánh giá | 24/10 – 26/10 | Đánh giá chung cho quán (đổi 08/10): `/restaurants/:idOrSlug/reviews[/me]`, `/merchant/reviews*`, `/admin/reviews*`, `minRating`, `ratingScore` | Mỗi khách 1 đánh giá / quán; 6×4★ xếp trên 1×5★ | ✅ 08/10 |
| **API-9** Báo cáo & admin còn lại | 26/10 – 29/10 | `/merchant/reports/*`, `/admin/reports/summary`, `/admin/users*`, `/admin/orders*`; FE dashboard chủ quán + admin, quản lý người dùng / đơn, trang tài khoản cho chủ quán / admin | Số liệu khớp dữ liệu test (ranh giới ngày VN, chỉ đơn hoàn thành) | ✅ 09/10 |
| **API-10** Cứng hóa | 29/10 – 02/11 | Test phân quyền chéo quán cho mọi route; rate limit; CORS production; `helmet`; Cloudinary; xuất Postman/Swagger | Owner A gọi tài nguyên quán B → 404 ở mọi route | 🟡 (chéo quán cho hồ sơ + menu ✅) |
| **API-11** Ví đối soát | 11/10 | Sổ cái kép (`wallets`, `walletentries`), đơn COD hoàn thành trừ hoa hồng, nạp tiền (VietQR, admin xác nhận), rút tiền, khóa / mở nhận đơn theo số dư, job `walletLock`; FE `/owner/wallet`, `/admin/wallets` | Tổng số dư mọi ví luôn = 0; ví âm > 100k hoặc > 3 ngày → quán ngưng nhận đơn, nạp đủ → tự mở | ✅ 11/10 |
| **W2** Trả trước VietQR + SePay | 11/10 | `PENDING_PAYMENT`, `/payments/sepay/webhook`, `/orders/:id/payment`, hoàn tiền (`refunds`), giao dịch không khớp, job `paymentTimeout`, `sepay:simulate`; FE chọn chuyển khoản ở checkout, `/orders/:id/pay`, tab Hoàn tiền / Giao dịch ngân hàng cho admin | Webhook gửi lại không xử lý 2 lần; tổng số dư vẫn = 0 qua mọi tình huống thừa / thiếu / muộn / hủy | ✅ 11/10 |
| API-12 ⏭️ | sau MVP | Refresh token, nhân viên, hoàn tiền tự động qua API chi hộ | — | ⏭️ |

### Checklist tích hợp Frontend

- [x] `api/menu.ts` gọi `/restaurants`, `/restaurants/:slug/menu`, `/menu-items` thay `data/menu.ts`; cập nhật `types.ts` (`Dish` → `MenuItem` có `variants`/`optionGroups`, `stock` → `remainingToday`, `shop` → `restaurant.name`, `popularity` → `soldCount`)
- [x] `CartContext`: chặn giỏ có món từ 2 quán (BR-30), lưu `variantId`, `optionIds`
- [x] `api/orders.ts` thay `OrderContext` localStorage; `Idempotency-Key` = `crypto.randomUUID()`, giữ nguyên khi mạng lỗi để bấm lại không tạo đơn trùng
- [x] Cập nhật `OrderStatus` theo enum mới (database.md M5) — FE ✅ (đơn vẫn lưu localStorage tới khi có API-5)
- [x] Bỏ `normalizeUser` trong `api/auth.ts` (backend đã trả `id` ở mọi chỗ)
- [x] Xử lý 403 `ACCOUNT_BLOCKED` trong interceptor; lưu token mới sau đổi mật khẩu
- [x] `getErrorMessage` map theo `code` thay vì `message`
- [x] Màn sổ địa chỉ + đổi mật khẩu cho khách
- [x] Thêm `socket.io-client`, `SocketProvider` + `useSocketEvent` (join theo token)
- [x] Trang `/owner/*`: onboarding (hồ sơ, giờ mở cửa, upload giấy tờ, nộp), menu (danh mục, món, biến thể, topping, hết món) — còn nhận đơn (âm báo), dashboard
- [x] Trang `/admin/*`: danh sách hồ sơ chờ duyệt, xem giấy tờ, duyệt/từ chối/khóa, hoa hồng, audit log — còn user, thống kê (chờ API-9)
