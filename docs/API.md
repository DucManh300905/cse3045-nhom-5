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
| 429 | Vượt rate limit ⬜ |

### 1.3 Xác thực & header

- `Authorization: Bearer <JWT>`; payload `{ userId, role }`, hết hạn 1 ngày. Mỗi request **đọc lại user trong DB**: bị khóa → 403, đã đổi mật khẩu sau khi cấp token → 401, role lấy từ DB. ✅
- FE: interceptor tự đăng xuất khi 401 hoặc 403 `ACCOUNT_BLOCKED` và báo lý do. ✅
- `Idempotency-Key: <uuid>` — **bắt buộc** với `POST /orders` (BR-38). Gửi lại cùng key trong 24h → 200 + đơn cũ. ✅
- Query danh sách: `page` (mặc định 1), `limit` (mặc định 20, tối đa 100). ✅
- Upload file: `multipart/form-data`; ảnh jpg/png/webp ≤ 2MB (field `image`), giấy tờ thêm pdf (field `file`). ✅

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
| `rateLimit` | — | `express-rate-limit` cho `/auth/*` (10 req/phút/IP) | ⬜ |
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
| POST | `/auth/register` | 🌐 | Đăng ký CUSTOMER / RESTAURANT_OWNER | BR-01..03 | ✅ |
| POST | `/auth/login` | 🌐 | Đăng nhập bằng `identifier` (email/SĐT); vẫn nhận field `email` cũ | BR-04 | ✅ |
| PUT | `/auth/change-password` | 🔑 | `{ currentPassword, newPassword }` → trả **token mới** | BR-05 | ✅ |
| POST | `/auth/refresh` | 🌐 | Cấp lại access token | | ⏭️ |
| POST | `/auth/otp/send`, `/auth/otp/verify` | 🌐 | OTP email/SĐT | | ⏭️ |
| POST | `/auth/forgot-password`, `/auth/reset-password` | 🌐 | | | ⏭️ |

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
| GET | `/restaurants/:id/reviews` | Đánh giá của quán (phân trang) | ⬜ |
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

**Voucher, đánh giá, báo cáo** ⬜

| Method | Path | Mô tả | BR | |
|---|---|---|---|---|
| GET / POST | `/merchant/vouchers` | Danh sách / tạo voucher | BR-40, 41 | ⬜ |
| PUT / DELETE | `/merchant/vouchers/:id` | Sửa / tắt (không xóa nếu đã dùng) | | ⬜ |
| GET | `/merchant/reviews` | Đánh giá của quán | | ⬜ |
| PUT | `/merchant/reviews/:id/reply` | `{ content }` trả lời / sửa trả lời | BR-61 | ⬜ |
| GET | `/merchant/reports/summary` | `?from&to` → số đơn, doanh thu, giá trị đơn TB, tỷ lệ hủy, rating | BR-52 | ⬜ |
| GET | `/merchant/reports/revenue` | `?from&to&groupBy=day\|week\|month` | BR-51 | ⬜ |
| GET | `/merchant/reports/top-items` | `?from&to&limit=10` | | ⬜ |

### 2.6 Đơn hàng của khách — `/orders` 🟡 (đặt / xem / hủy ✅, đánh giá ⬜)

| Method | Path | Quyền | Mô tả | BR | |
|---|---|---|---|---|---|
| POST | `/orders/preview` | 👤 | Tính tiền trước khi đặt (không lưu, không trừ kho). Body như `POST /orders` (không cần địa chỉ) | BR-31, 32 | ✅ |
| POST | `/orders` | 👤 | Đặt đơn — **header `Idempotency-Key`**. 201 đơn mới, 200 khi gửi lại cùng key. Voucher ⬜ (7b) | BR-30..38 | ✅ |
| GET | `/orders` | 👤 | Đơn của tôi, mới nhất trước, lọc `status=PLACED,ACCEPTED`, phân trang | | ✅ |
| GET | `/orders/:id` | 👤 | Chi tiết + `statusHistory`; đơn người khác → 404 | | ✅ |
| POST | `/orders/:id/cancel` | 👤 | `{ note? }` chỉ khi `PLACED`, hoàn suất; trạng thái khác → 409 | BR-35, 37 | ✅ |
| POST | `/orders/:id/review` | 👤 | `{ rating, comment }` — chỉ đơn `COMPLETED` | BR-60 | ⬜ |

`POST /orders`
```json
// header: Idempotency-Key: 7b1d…  ;  request
{ "restaurantId": "…",
  "fulfillmentType": "DELIVERY",
  "items": [ { "menuItemId": "…", "variantId": "…", "optionIds": ["…", "…"], "qty": 2, "note": "ít đá" } ],
  "addressId": "…",
  "delivery": { "receiverName": "Nguyễn Văn A", "phone": "0912345678", "addressLine": "KTX ĐH Việt Nhật, Hòa Lạc", "note": "" },
  "voucherCode": "GIAM10K",
  "paymentMethod": "COD" }

// 201
{ "success": true, "data": { "id": "…", "code": "MAK261006-0042", "status": "PLACED",
  "subtotal": 64000, "deliveryFee": 0, "discount": 10000, "total": 54000, "items": [ … ] } }
```
`addressId` (từ sổ địa chỉ) hoặc `delivery` — gửi một trong hai (đơn `PICKUP` không cần). Có `addressId` thì `delivery.note` vẫn được dùng làm ghi chú.
`fulfillmentType`: `DELIVERY` (mặc định, quán tự giao) | `PICKUP`. **Miễn phí giao hàng**: `deliveryFee` luôn = 0. Mã đơn `MAK<yyMMdd theo giờ VN>-<số thứ tự trong ngày>`.
Response cho khách **không** có `commissionRate`, `commissionAmount`.

Thứ tự xử lý ở server (trong 1 transaction):
1. Kiểm tra `Idempotency-Key` đã có → trả đơn cũ (200).
2. Quán `canAcceptOrders` (BR-12, 13 — đã có hàm `canAcceptOrders()`) → nếu không: 422 `RESTAURANT_CLOSED`.
3. Mỗi dòng: món thuộc quán, `isOrderable`, variant/option hợp lệ và `isAvailable`, đủ `minSelect/maxSelect` (BR-22) → 422 `INVALID_OPTIONS`.
4. Tính `unitPrice`, `subtotal` từ DB (BR-31); kiểm tra `minOrderAmount` (BR-32) → 422 `BELOW_MIN_ORDER`.
5. Kiểm tra & giữ voucher (BR-40..42) → 422 `VOUCHER_INVALID`.
6. Trừ tồn kho nguyên tử (BR-34) → 409 `ITEM_OUT_OF_STOCK` kèm `menuItemId`.
7. Tạo đơn `PLACED` + snapshot + `commissionAmount`; lưu idempotency key.
8. Sau commit: phát Socket `order:new` tới quán ✅, tạo notification ⬜ (API-7).

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
| GET | `/admin/users` | Lọc `role`, `status`, `q` | | ⬜ |
| POST | `/admin/users/:id/block` · `/unblock` | Khóa / mở user (không khóa được ADMIN) | BR-04 | ⬜ |
| GET | `/admin/orders` | Xem mọi đơn (chỉ đọc) | | ⬜ |
| PATCH | `/admin/reviews/:id/hide` | Ẩn đánh giá vi phạm | | ⬜ |
| GET | `/admin/reports/summary` | Tổng quán, user, đơn, GMV, hoa hồng theo khoảng ngày | | ⬜ |

Thông báo cho chủ quán khi được duyệt / bị từ chối: đẩy realtime `restaurant:status_changed` ✅; lưu vào `notifications` ⬜ (API-7).

### 2.8 Thông báo — `/notifications` ⬜

| Method | Path | Quyền | Mô tả | |
|---|---|---|---|---|
| GET | `/notifications` | 🔑 | `?unread=true` | ⬜ |
| PATCH | `/notifications/:id/read` | 🔑 | Đánh dấu đã đọc | ⬜ |
| PATCH | `/notifications/read-all` | 🔑 | | ⬜ |

### 2.9 Sau MVP ⏭️

| Module | Endpoint dự kiến |
|---|---|
| Nhân viên | `GET/POST/DELETE /merchant/staff`, `PATCH /merchant/staff/:id/role` |
| Ví & rút tiền | `GET /merchant/wallet`, `GET /merchant/wallet/transactions`, `POST /merchant/payouts` (Idempotency-Key) |
| Đối soát | `GET /merchant/settlements`, `GET /admin/settlements`, `POST /admin/payouts/:id/mark-paid` |
| Thanh toán | `POST /payments/vnpay/create`, `GET /payments/vnpay/return`, `POST /payments/vnpay/ipn` |
| Khiếu nại | `POST /orders/:id/disputes`, `GET /admin/disputes` |

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
| `notification:new` | `user:{id}` | `{ id, type, title, body }` | Khi tạo notification ⬜ (API-7) |
| `restaurant:status_changed` | `user:{ownerId}` | `{ restaurantId, status, rejectReason? }` | Admin duyệt / từ chối / khóa / mở khóa ✅ |
| `ready` | (chính socket đó) | `{ rooms }` | Ngay sau khi vào phòng — dùng trong test |

Mất kết nối: FE tải lại danh sách đơn khi kết nối lại (`useSocketEvent('reconnected')`) để không sót đơn ✅. Chủ quán vừa tạo quán → FE tự kết nối lại để vào phòng `restaurant:{id}`.

---

## 4. Bảng mã lỗi (`code`)

| code | HTTP | Ý nghĩa | |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Sai định dạng dữ liệu, JSON hỏng, thiếu file | ✅ |
| `INVALID_PASSWORD` | 400 | Sai mật khẩu hiện tại khi đổi mật khẩu | ✅ |
| `INVALID_FILE_TYPE` / `INVALID_FILE` | 400 | File sai loại / quá 2MB | ✅ |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | BR-38 | ✅ |
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
| `ALREADY_REVIEWED` | 409 | BR-60 | ⬜ |
| `PROFILE_INCOMPLETE` | 422 | Nộp hồ sơ khi thiếu giờ mở cửa / giấy tờ (BR-15) | ✅ |
| `RESTAURANT_NOT_APPROVED` | 422 | Bật nhận đơn khi chưa duyệt (BR-12) | ✅ |
| `INVALID_CATEGORY` | 422 | Món gắn vào danh mục của quán khác (BR-20) | ✅ |
| `ADDRESS_LIMIT` | 422 | Quá 5 địa chỉ (BR-06) | ✅ |
| `RESTAURANT_CLOSED` | 422 | BR-13 | ✅ |
| `BELOW_MIN_ORDER` | 422 | BR-32 | ✅ |
| `MULTIPLE_RESTAURANTS` | 422 | BR-30 | ✅ |
| `INVALID_OPTIONS` | 422 | BR-22 — sai biến thể, topping hết, chọn thiếu/thừa so với `minSelect`/`maxSelect` | ✅ |
| `VOUCHER_INVALID` / `VOUCHER_EXHAUSTED` | 422 | BR-40..42 | ⬜ |
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
| **API-5** Đặt đơn | 19/10 – 21/10 | `/orders/preview`, `POST /orders` (8 bước mục 2.6), idempotency — **7a**; voucher — **7b** | 5 request mua 1 suất cuối → 1 thành công, 4 lỗi 409 | 🟡 7a ✅ 06/10 (voucher 7b ⬜) |
| **API-6** Xử lý đơn + realtime | 21/10 – 23/10 | `orderStateMachine.js`; `/merchant/orders*`; `/orders/:id/cancel`; Socket.IO; job timeout + reset suất | Bảng chuyển trạng thái BR-35 được test đủ từng ô | ✅ 06/10 |
| **API-7** Thông báo | 23/10 – 24/10 | `/notifications*` + `notification:new` + báo duyệt/từ chối quán | Chuông thông báo trên FE || ⬜ **← tiếp theo** |
| **API-8** Đánh giá | 24/10 – 26/10 | `POST /orders/:id/review`, `/merchant/reviews*`, public reviews, admin ẩn | Đánh giá lần 2 → 409 | ⬜ |
| **API-9** Báo cáo & admin còn lại | 26/10 – 29/10 | `/merchant/reports/*`, `/admin/reports/summary`, `/admin/users*`, `/admin/orders` | Số liệu khớp seed | ⬜ |
| **API-10** Cứng hóa | 29/10 – 02/11 | Test phân quyền chéo quán cho mọi route; rate limit; CORS production; `helmet`; Cloudinary; xuất Postman/Swagger | Owner A gọi tài nguyên quán B → 404 ở mọi route | 🟡 (chéo quán cho hồ sơ + menu ✅) |
| API-11 ⏭️ | sau MVP | Refresh token, OTP, nhân viên, ví/payout, VNPay | — | ⏭️ |

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
