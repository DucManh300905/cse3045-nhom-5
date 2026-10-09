# Thiết kế Database — MAK Food and Drink

> MongoDB + Mongoose 9. Tài liệu liên quan: [project.md](project.md) (nghiệp vụ, mã `BR-xx`) · [API.md](API.md)
> **Cập nhật lần cuối: 06/10/2026** — sau Bước 6b.

Ký hiệu: ✅ đã có trong code · 🟡 có nhưng còn thiếu · ⬜ chưa làm · ⏭️ sau MVP

Model nằm ở `backend/src/modules/<module>/*.model.js`. Tên collection thực tế do Mongoose tự đặt (chữ thường, số nhiều): `users`, `restaurants`, `menucategories`, `menuitems`, `auditlogs`…

---

## 1. Nguyên tắc thiết kế

1. **Tiền là số nguyên VND** (`Number` nguyên, validate `Number.isInteger`) — không dùng float (BR-21, BR-50). ✅ áp dụng cho quán và menu.
2. **Nhúng (embed) khi dữ liệu luôn đọc cùng cha và không tăng vô hạn**: địa chỉ trong user, giờ mở cửa + giấy tờ trong quán, biến thể/topping trong món, dòng đơn và lịch sử trạng thái trong đơn.
   **Tách collection** khi cần truy vấn độc lập hoặc tăng không giới hạn: món, đơn, đánh giá, thông báo, audit log.
3. **Snapshot** tên/giá món, tỷ lệ hoa hồng vào đơn tại lúc đặt (BR-33, BR-51).
4. **Xóa mềm** cho dữ liệu đã được đơn tham chiếu (`isDeleted`, BR-24). ✅
5. Mọi collection có `timestamps: true` (`createdAt`, `updatedAt`) — trừ `auditlogs` chỉ có `createdAt`.
6. Giá trị enum viết HOA, khớp với `frontend/src/types.ts`.
7. Thao tác nhiều document liên quan tiền/tồn kho dùng **transaction** (`session.withTransaction`) → MongoDB phải chạy **replica set** (Atlas có sẵn; local: `mongod --replSet rs0` rồi `rs.initiate()`). Test đã chạy replica set trong RAM (mongodb-memory-server). ✅
8. **Plugin `toJSON` dùng chung** (`config/mongoose.js`): mọi document trả JSON có `id` thay cho `_id`, bỏ `__v`, không bao giờ có `password`. ✅
9. **Tìm không dấu**: lưu thêm `nameNoAccent` (tự sinh trong `pre('validate')`) cho quán và món, tìm bằng regex. ✅

---

## 2. Sơ đồ quan hệ (ERD rút gọn)

```
users 1 ──── 0..1 restaurants            (owner, BR-10)            ✅
users 1 ──── n    orders                 (customer)                ⬜
restaurants 1 ── n menucategories 1 ── n menuitems                 ✅
restaurants 1 ── n orders ── (snapshot) menuitems                  ⬜
restaurants 1 ── n vouchers ◀── 0..1 orders                        ⬜
orders 1 ──── 0..1 reviews                                         ⬜
users 1 ──── n notifications                                       ⬜
users 1 ──── n auditlogs                 (actor)                   ✅
```

---

## 3. Các collection MVP

### 3.1 `users` ✅

File: `modules/user/user.model.js`

| Field | Kiểu | Ràng buộc | Ghi chú | |
|---|---|---|---|---|
| `email` | String | unique, sparse, lowercase | | ✅ |
| `phone` | String | unique, sparse, dạng `0xxxxxxxxx` | BR-02 | ✅ |
| `password` | String | required, hash bcrypt | không bao giờ trả ra JSON | ✅ |
| `fullName` | String | required | | ✅ |
| `role` | enum `CUSTOMER` `RESTAURANT_OWNER` `ADMIN` | default `CUSTOMER` | | ✅ |
| `status` | enum `ACTIVE` `BLOCKED` | default `ACTIVE` | BR-04 | ✅ |
| `avatarUrl` | String | | | ✅ |
| `addresses` | `[Address]` (nhúng) | tối đa 5 (`MAX_ADDRESSES`) | BR-06 | ✅ |
| `passwordChangedAt` | Date | | token có `iat` trước mốc này bị từ chối (BR-05) | ✅ |

`Address` (subdocument, có `_id`): `{ label, receiverName (required), phone (required), addressLine (required), location?: GeoPoint, isDefault }`

Ràng buộc: phải có email hoặc phone (`pre('validate')`) ✅ — nên không xóa được SĐT của tài khoản không có email (BR-07).

### 3.2 `restaurants` ✅

File: `modules/restaurant/restaurant.model.js`

| Field | Kiểu | Ràng buộc | Ghi chú | |
|---|---|---|---|---|
| `owner` | ObjectId → users | required, **unique** | BR-10 | ✅ |
| `name` | String | required | | ✅ |
| `nameNoAccent` | String | tự sinh | tìm không dấu | ✅ |
| `slug` | String | unique, sparse | sinh 1 lần lúc tạo, không đổi theo tên (BR-17) | ✅ |
| `description` | String | | | ✅ |
| `address` | String | required | | ✅ |
| `phone` | String | required | đã chuẩn hóa | ✅ |
| `location` | GeoPoint `{ type:'Point', coordinates:[lng,lat] }` | 2dsphere (sparse) | | ✅ |
| `logoUrl`, `coverUrl` | String | | URL `/uploads/restaurants/...` | ✅ |
| `cuisineTypes` | [String] | ≤ 10 | ví dụ `["COM","BUN_PHO","DO_UONG"]` | ✅ |
| `status` | enum `DRAFT` `SUBMITTED` `APPROVED` `REJECTED` `BLOCKED` | default `DRAFT` | BR-11 | ✅ |
| `rejectReason` | String | | xóa khi nộp lại / được duyệt | ✅ |
| `submittedAt`, `approvedAt` | Date | | | ✅ |
| `approvedBy` | ObjectId → users | | admin duyệt | ✅ |
| `documents` | `[{ type: 'BUSINESS_LICENSE'│'FOOD_SAFETY'│'ID_CARD', fileKey, originalName, mimeType, uploadedAt }]` | mỗi loại 1 file | `fileKey` = đường dẫn trong thư mục private, **không bao giờ trả ra API** (BR-18) | ✅ |
| `isAcceptingOrders` | Boolean | default `false` | BR-13, admin khóa → `false` (BR-16) | ✅ |
| `openingHours` | `[{ dayOfWeek: 0-6, open: 'HH:mm', close: 'HH:mm' }]` | ≤ 21 khung, không chồng nhau, `open < close` | giờ VN, 0 = Chủ nhật | ✅ |
| ~~`deliveryFee`~~ | — | **Đã bỏ** (06/10/2026): quán tự giao, miễn phí giao cho khách | | ✅ |
| `minOrderAmount` | Int | ≥ 0, default 0 | | ✅ |
| `deliveryRadiusKm` | Number | 0.5 – 30, default 5 | | ✅ |
| `avgPrepMinutes` | Int | 1 – 180, default 15 | | ✅ |
| `commissionRate` | Number (0–1) | default 0.1 | chỉ admin sửa (BR-51) | ✅ |
| `ratingAvg`, `ratingCount` | Number, Int | default 0 | cập nhật khi có đánh giá | ✅ field · ⬜ logic |
| `stats` | `{ acceptedCount, rejectedCount, cancelledByStoreCount }` | | G3 — làm cùng module đơn | ⬜ |

Index: `{ owner: 1 } unique` ✅, `{ slug: 1 } unique sparse` ✅, `{ status: 1 }` ✅, `{ location: '2dsphere' } sparse` ✅, text index `{ name, description }` ✅.

### 3.3 `menucategories` ✅

File: `modules/menu/menuCategory.model.js`

| Field | Kiểu | Ràng buộc | |
|---|---|---|---|
| `restaurant` | ObjectId → restaurants | required | ✅ |
| `name` | String | required | ✅ |
| `sortOrder` | Int | default 0; tạo mới → cuối danh sách | ✅ |
| `isActive` | Boolean | default true; `false` → ẩn cả nhóm món với khách | ✅ |

Index: `{ restaurant: 1, name: 1 } unique` với **collation `{ locale: 'vi', strength: 2 }`** (không phân biệt hoa thường, BR-25) ✅, `{ restaurant: 1, sortOrder: 1 }` ✅.

### 3.4 `menuitems` ✅

File: `modules/menu/menuItem.model.js`

| Field | Kiểu | Ràng buộc | Ghi chú | |
|---|---|---|---|---|
| `restaurant` | ObjectId → restaurants | required | lưu trùng để query nhanh + check ownership | ✅ |
| `category` | ObjectId → menucategories | required | phải cùng quán (BR-20, kiểm tra ở controller) | ✅ |
| `name` | String | required | | ✅ |
| `nameNoAccent` | String | tự sinh | tìm không dấu | ✅ |
| `description` | String | ≤ 1000 | | ✅ |
| `imageUrl` | String | | `/uploads/menu-items/...` hoặc URL ngoài (seed dùng Unsplash) | ✅ |
| `type` | enum `FOOD` `DRINK` | default `FOOD` | khớp `DishCategory` ở FE | ✅ |
| `basePrice` | Int | ≥ 0, required | có biến thể → tự = giá biến thể mặc định (BR-21) | ✅ |
| `tags` | [String] | ≤ 10 | `SPICY`, `VEGETARIAN`… | ✅ |
| `variants` | `[{ _id, name, price, isDefault }]` | ≤ 10; luôn đúng 1 `isDefault` | BR-26 | ✅ |
| `optionGroups` | `[OptionGroup]` | ≤ 10 | BR-22 | ✅ |
| `isAvailable` | Boolean | default true | bật/tắt tay | ✅ |
| `dailyLimit` | Int \| null | null = không giới hạn | BR-23 | ✅ |
| `soldToday` | Int | default 0 | tăng khi đặt đơn ⬜, reset 00:00 ⬜ | 🟡 |
| `prepMinutes` | Int | 1 – 180 | FE `Dish.prepMinutes` | ✅ |
| `sortOrder` | Int | | tạo mới / đổi danh mục → cuối danh mục | ✅ |
| `soldCount` | Int | default 0 | tổng đã bán — sắp xếp "bán chạy" (thay `popularity` của FE) | ✅ |
| `isDeleted` | Boolean | default false | BR-24 | ✅ |

`OptionGroup` (có `_id`): `{ name, minSelect (≥0, default 0), maxSelect (≥1, default 1), options: [{ _id, name, price, isAvailable }] (≥ 1) }` — `pre('validate')` kiểm tra `minSelect ≤ maxSelect ≤ options.length` ✅.

Index: `{ restaurant: 1, category: 1, sortOrder: 1 }` ✅, `{ restaurant: 1, isDeleted: 1, isAvailable: 1 }` ✅, text index `{ name, nameNoAccent, description }` ✅.

Giá trị tính (không lưu, do `menu.serializer.js` trả ra):
- `remainingToday` = `dailyLimit - soldToday` (≥ 0), `null` nếu không giới hạn.
- `isOrderable` = `isAvailable && !isDeleted && remainingToday !== 0`.

> Ánh xạ sang FE: `stock` = `remainingToday` (null = ∞), `shop` = `restaurant.name`, `popularity` = `soldCount`, `closesAt` = giờ đóng cửa hôm nay trong `openingHours` của quán.

### 3.5 `orders` ✅

File: `modules/order/order.model.js` · tính tiền `order.pricing.js` · đặt / hủy / chuyển trạng thái `order.service.js`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `code` | String unique | mã hiển thị, ví dụ `MAK261006-0042` (FE đang dùng `'MAK' + ...`) |
| `customer` | ObjectId → users | |
| `restaurant` | ObjectId → restaurants | BR-30 |
| `restaurantSnapshot` | `{ name, phone, address }` | |
| `items` | `[OrderItem]` | BR-33 |
| `fulfillmentType` | enum `DELIVERY` `PICKUP` | D9 |
| `delivery` | `{ receiverName, phone, addressLine, location?, note }` | bắt buộc khi DELIVERY |
| `subtotal` | Int | Σ `lineTotal` |
| `deliveryFee` | Int | luôn 0 — miễn phí giao (giữ field để báo cáo không đổi cấu trúc) |
| `discount` | Int | từ voucher |
| `total` | Int | `subtotal + deliveryFee - discount` |
| `voucher` | `{ voucherId, code, discount }` \| null | |
| `commissionRate` | Number | snapshot |
| `commissionAmount` | Int | BR-51 |
| `paymentMethod` | enum `COD` (`VNPAY` ⏭️) | |
| `paymentStatus` | enum `UNPAID` `PAID` `REFUNDED` | BR-39 |
| `status` | enum `PLACED` `ACCEPTED` `REJECTED` `PREPARING` `READY` `DELIVERING` `COMPLETED` `CANCELLED` | BR-35 |
| `statusHistory` | `[{ from, to, actorType: 'CUSTOMER'│'OWNER'│'ADMIN'│'SYSTEM', actor?, reason?, at }]` | thay cho collection `OrderStatusHistory` của docx |
| `cancelReason` | `{ code, note }` | `OUT_OF_STOCK`, `OVERLOADED`, `CLOSED`, `CUSTOMER_CHANGED_MIND`, `TIMEOUT`, `OTHER` |
| `estimatedReadyAt` | Date | = acceptedAt + avgPrepMinutes |
| `placedAt`, `acceptedAt`, `completedAt`, `cancelledAt` | Date | phục vụ báo cáo |
| `isReviewed` | Boolean | Không dùng (đánh giá theo quán từ 08/10) |

`OrderItem`: `{ menuItem (ObjectId), name, imageUrl, variant?: { _id, name, price }, options: [{ _id, groupName, name, price }], unitPrice, qty, lineTotal, note }`
với `unitPrice = (variant.price ?? basePrice) + Σ options.price`, `lineTotal = unitPrice × qty`.

Index:
- `{ code: 1 } unique`
- `{ customer: 1, createdAt: -1 }` — lịch sử đơn của khách
- `{ restaurant: 1, status: 1, createdAt: -1 }` — màn nhận đơn của quán
- `{ status: 1, placedAt: 1 }` — job timeout (BR-36)
- `{ restaurant: 1, completedAt: -1 }` — báo cáo doanh thu

### 3.6 `idempotencykeys` ✅

Mã đơn dùng thêm collection `counters` (`{ _id: 'order:261006', seq }`, tăng trong cùng transaction).

| Field | Kiểu | Ghi chú |
|---|---|---|
| `key` | String | header `Idempotency-Key` |
| `user` | ObjectId | |
| `order` | ObjectId → orders | |
| `createdAt` | Date | **TTL index 24h** (`expireAfterSeconds: 86400`) |

Index: `{ user: 1, key: 1 } unique` (BR-38).

### 3.7 `vouchers` ⬜

| Field | Kiểu | Ghi chú |
|---|---|---|
| `restaurant` | ObjectId | |
| `code` | String uppercase | |
| `type` | enum `PERCENT` `FIXED` | |
| `value` | Int | % (1–100) hoặc số tiền |
| `maxDiscount` | Int \| null | bắt buộc với PERCENT (BR-41) |
| `minOrderAmount` | Int | |
| `usageLimit` | Int \| null | |
| `usedCount` | Int | tăng nguyên tử (BR-42) |
| `perUserLimit` | Int | default 1 |
| `startAt`, `endAt` | Date | |
| `isActive` | Boolean | |

Index: `{ restaurant: 1, code: 1 } unique`. Đếm lượt dùng của 1 user: `orders.countDocuments({ customer, 'voucher.voucherId', status: { $nin: ['REJECTED','CANCELLED'] } })`.

### 3.8 `reviews` ✅ (đổi 08/10/2026: đánh giá theo quán, không theo đơn)

File: `modules/review/review.model.js` · tính điểm: `review.service.js`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `restaurant`, `customer` | ObjectId | **unique cặp** — 1 đánh giá / khách / quán (BR-60) |
| `rating` | Int 1–5 | |
| `comment` | String | ≤ 1000 ký tự, hiện công khai |
| `images` | [String] | ⏭️ |
| `reply` | `{ content, repliedAt }` | BR-61 |
| `isHidden`, `hiddenReason` | Boolean, String | admin ẩn vi phạm: không hiện, không tính điểm |
| `createdAt`, `updatedAt` | Date | |

Index: `{ restaurant: 1, customer: 1 } unique`, `{ restaurant: 1, isHidden: 1, updatedAt: -1 }`.

Trên `restaurants`: `ratingAvg` (TB cộng, 1 chữ số), `ratingCount`, `ratingScore` = `(n×avg + 5×3.5)/(n+5)` (mặc định 3.5) + index `{ status: 1, ratingScore: -1 }`. Quán có sẵn: `npm run migrate:002`.

### 3.9 `notifications` ✅

File: `modules/notification/notification.model.js` · tạo + đẩy realtime: `notification.service.js`.

`{ user, type: 'ORDER_NEW'│'ORDER_STATUS'│'RESTAURANT_SUBMITTED'│'RESTAURANT_APPROVED'│'RESTAURANT_REJECTED'│'RESTAURANT_BLOCKED'│'RESTAURANT_UNBLOCKED'│'REVIEW_NEW', title, body, data: { orderId?, restaurantId?, code?, link? }, isRead, createdAt }`
Index: `{ user: 1, isRead: 1, createdAt: -1 }`; TTL 90 ngày trên `createdAt` ✅.

### 3.10 `auditlogs` ✅

File: `modules/audit/auditLog.model.js` · ghi bằng `recordAudit(req, {...})` trong `modules/audit/audit.service.js`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `actor` | ObjectId → users | lấy từ `req.user` |
| `actorRole` | enum `CUSTOMER` `RESTAURANT_OWNER` `ADMIN` `SYSTEM` | |
| `action` | String | xem bảng dưới |
| `targetType`, `targetId` | String, ObjectId | ví dụ `Restaurant`, `MenuItem` |
| `before`, `after` | Mixed | giá trị trước/sau |
| `note` | String | lý do (từ chối, khóa…) |
| `ip` | String | |
| `createdAt` | Date | không có `updatedAt` |

**Chỉ ghi thêm (BR-70):** `pre` hook chặn `updateOne/updateMany/findOneAndUpdate/deleteOne/deleteMany/findOneAndDelete`.

Index: `{ targetType: 1, targetId: 1, createdAt: -1 }`, `{ action: 1, createdAt: -1 }`.

| `action` | Khi nào | |
|---|---|---|
| `RESTAURANT_APPROVE` / `RESTAURANT_REJECT` | Admin duyệt / từ chối hồ sơ | ✅ |
| `RESTAURANT_BLOCK` / `RESTAURANT_UNBLOCK` | Admin khóa / mở quán | ✅ |
| `RESTAURANT_COMMISSION_CHANGE` | Admin đổi hoa hồng | ✅ |
| `MENU_PRICE_CHANGE` | Chủ quán đổi giá món / biến thể (BR-27) | ✅ |
| `RESTAURANT_PROFILE_CHANGE` | Quán đã duyệt đổi tên/địa chỉ (BR-14) | ⬜ |
| `USER_BLOCK` / `USER_UNBLOCK` | Admin khóa user | ⬜ |
| `ORDER_CANCEL` | Hủy đơn | ⬜ |

---

## 4. Lưu file (không phải collection)

Cấu hình: `config/storage.js` — thư mục gốc `UPLOAD_DIR` (mặc định `backend/uploads`, đã gitignore; test dùng thư mục tạm).

| Thư mục | Nội dung | Truy cập | |
|---|---|---|---|
| `uploads/public/restaurants/` | Logo, ảnh bìa quán | public qua `/uploads/restaurants/<file>` | ✅ |
| `uploads/public/menu-items/` | Ảnh món | public qua `/uploads/menu-items/<file>` | ✅ |
| `uploads/private/documents/` | Giấy tờ pháp lý | **không public** — chỉ `GET /api/admin/restaurants/:id/documents/:type` | ✅ |

Tên file là UUID ngẫu nhiên; thay ảnh/giấy tờ thì xóa file cũ. Khi deploy lên Render/Railway (ổ đĩa không bền) cần đổi sang Cloudinary/S3 ⏭️.

---

## 5. Collection sau MVP ⏭️

| Collection | Mục đích | Ghi chú thiết kế |
|---|---|---|
| `storeStaff` | `{ restaurant, user, role: OWNER│MANAGER│CASHIER│ACCOUNTANT, status }` | Bỏ BR-10, middleware kiểm tra quyền theo quán |
| `merchantDocuments` | Giấy tờ pháp lý, số tài khoản ngân hàng | Mã hóa field nhạy cảm (AES-256), URL ảnh có hạn |
| `priceHistory` | `{ menuItem, oldPrice, newPrice, changedBy, at }` | MVP đang dùng audit log `MENU_PRICE_CHANGE` thay thế |
| `wallets` | `{ restaurant, balance, pendingBalance }` | `balance` chỉ là cache, nguồn sự thật là ledger |
| `walletTransactions` | `{ wallet, type: ORDER_INCOME│COMMISSION│PAYOUT│ADJUSTMENT, amount (±Int), order?, balanceAfter, createdAt }` | Ledger chỉ ghi thêm (BR-53) |
| `payouts` | Yêu cầu rút tiền `{ restaurant, amount, bankSnapshot, status: REQUESTED│PAID│REJECTED }` | idempotency key |
| `settlements` | Đối soát theo kỳ `{ restaurant, periodFrom, periodTo, gross, commission, net, status }` | job hằng ngày |
| `promotions` | Combo, flash sale, chương trình nền tảng | |
| `payments` | Giao dịch VNPay, callback raw | |

---

## 6. Thao tác nguyên tử quan trọng

### 6.1 Đổi trạng thái quán (admin) ✅

Đã dùng trong `admin.restaurant.controller.js` (BR-71):

```js
const updated = await Restaurant.findOneAndUpdate(
  { _id: current._id, status: current.status },   // chỉ cập nhật nếu chưa ai đổi
  { $set: { status: to, ...set } },
  { returnDocument: 'after', runValidators: true }
);
if (!updated) throw new AppError(409, 'INVALID_STATUS_TRANSITION', '...');
```

### 6.2 Trừ tồn kho khi đặt đơn (BR-34) ✅ (`reserveStock`; hoàn lại bằng `releaseStock`)

```js
// trong session.withTransaction(...)
const r = await MenuItem.updateOne(
  {
    _id: itemId, restaurant: restaurantId, isDeleted: false, isAvailable: true,
    $or: [
      { dailyLimit: null },
      { $expr: { $lte: [{ $add: ['$soldToday', qty] }, '$dailyLimit'] } }
    ]
  },
  { $inc: { soldToday: qty, soldCount: qty } },
  { session }
);
if (r.modifiedCount === 0) throw new AppError(409, 'ITEM_OUT_OF_STOCK', '...');
```

### 6.3 Dùng voucher (BR-42) ⬜

```js
await Voucher.updateOne(
  { _id, isActive: true, startAt: { $lte: now }, endAt: { $gte: now },
    $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
  { $inc: { usedCount: 1 } },
  { session }
);
```

### 6.4 Chuyển trạng thái đơn không bị ghi đè (BR-35) ✅ (`transitionOrder` — dùng lại cho API-6)

```js
await Order.findOneAndUpdate(
  { _id, restaurant: myRestaurantId, status: from },
  { $set: { status: to, [`${to.toLowerCase()}At`]: now },
    $push: { statusHistory: { from, to, actorType, actor, reason, at: now } } },
  { returnDocument: 'after' }
);
```

> Lưu ý Mongoose 9: dùng `returnDocument: 'after'` thay cho `new: true`.

### 6.5 Job (node-cron) ✅ (`src/jobs/index.js`, thời gian chờ chỉnh bằng `ORDER_TIMEOUT_MINUTES`)

| Job | Lịch | Việc |
|---|---|---|
| `orderTimeout` | mỗi phút | `PLACED` và `placedAt < now - 5'` → `CANCELLED` (actor SYSTEM, `cancelReason.code = TIMEOUT`), hoàn `soldToday` (BR-36, BR-37); hoàn `usedCount` voucher ⬜ |
| `dailyStockReset` | 00:00 `Asia/Ho_Chi_Minh` | `MenuItem.updateMany({ soldToday: { $gt: 0 } }, { soldToday: 0 })` (BR-23) |

---

## 7. Migration & dữ liệu mẫu

| # | Thay đổi | Cách làm | |
|---|---|---|---|
| M1 | `restaurants.status`: `PENDING` → `SUBMITTED`, thêm `DRAFT`, `REJECTED`; bổ sung `nameNoAccent` | `npm run migrate:001` — chạy lại nhiều lần an toàn, có `--dry-run` | ✅ đã chạy trên DB `MAKfood` 06/10 |
| M2 | Unique index `restaurants.owner` | Cùng script M1: kiểm tra chủ có nhiều quán (in danh sách và dừng nếu có), rồi `syncIndexes()` | ✅ script · ⬜ chưa chạy |
| M3 | Thêm field mới cho `users`, `restaurants` | Đều có default → không cần migrate | ✅ |
| M4 | Bật replica set cho MongoDB local | Cập nhật `backend/.env.example` + README: `MONGODB_URI=mongodb://localhost:27017/mak_food?replicaSet=rs0` | ⬜ (cần trước khi làm đặt đơn) |
| M5 | FE `OrderStatus` (`PENDING/CONFIRMED/DONE`) → enum mới | Đã sửa `frontend/src/types.ts`; đơn tạm trong localStorage bị bỏ | ✅ |
| M6 | Backfill `restaurants.nameNoAccent` cho quán tạo trước Bước 6b | Thêm vào script migration: đọc từng quán và `save()` (hoặc `updateOne` với giá trị bỏ dấu) | ⬜ |

**Dữ liệu demo:** `npm run seed:demo` (`utils/seedDemo.js`) ✅ — 3 quán `quan-a/b/c` đã duyệt, 6 danh mục, 16 món chép từ `frontend/src/data/menu.ts` (`stock` → `dailyLimit`, `popularity` → `soldCount`; "Trà sữa trân châu" có size + topping), 4 tài khoản demo. Chạy lại nhiều lần được (menu demo tạo lại từ đầu); từ chối chạy khi `NODE_ENV=production`.

---

## 8. Lộ trình thực hiện phần Database

Mỗi bước: viết model → viết seed/test → chạy `syncIndexes` → kiểm tra trên MongoDB Compass.

| Bước | Thời gian (Gantt) | Việc | Kiểm chứng | |
|---|---|---|---|---|
| **DB-0** | 06/10 – 08/10 | Chốt ERD mục 2, replica set (test ✅, local ⬜), validate tiền nguyên | Test transaction chạy được | 🟡 |
| **DB-1** | 13/10 – 14/10 | `users`: `addresses`, `avatarUrl`, `passwordChangedAt` | Test thêm/sửa địa chỉ | ✅ 06/10 |
| **DB-2** | 14/10 – 15/10 | `restaurants`: migration M1, M2; field mục 3.2; index 2dsphere + text; `nameNoAccent` | Script migration chạy 2 lần không lỗi | ✅ 06/10 (script chưa chạy trên DB thật) |
| **DB-3** | 15/10 – 17/10 | `menucategories`, `menuitems` (variants, optionGroups, validate min/max); seed demo | Seed 3 quán × 16 món từ `menu.ts` | ✅ 06/10 |
| **DB-4** | 17/10 – 20/10 | `orders`, `idempotencykeys`, `vouchers` + hàm 6.2, 6.3, 6.4 | Test: 5 request đặt món cuối cùng → chỉ 1 thành công | ⬜ **← tiếp theo** |
| **DB-5** | 20/10 – 23/10 | Job `orderTimeout`, `dailyStockReset` | Đơn PLACED 5' tự hủy, tồn kho hoàn lại | ✅ 06/10 |
| **DB-6** | 23/10 – 27/10 | `reviews`, `notifications`, `auditlogs`; cập nhật `ratingAvg`, `ratingScore` | 1 đánh giá / khách / quán (unique) | ✅ 08/10 |
| **DB-7** | 27/10 – 29/10 | Aggregation báo cáo: doanh thu theo ngày, top món, tỷ lệ hủy | So khớp số liệu với seed thủ công | ⬜ |
| **DB-8** | 29/10 – 02/11 | Kiểm tra index bằng `explain()` cho 5 truy vấn chính, backup Atlas, migration M6 | Mọi truy vấn chính dùng IXSCAN | ⬜ |
| DB-9 ⏭️ | sau MVP | `storeStaff`, `merchantDocuments`, ví/ledger, settlements | — | ⏭️ |
