export type Role = 'CUSTOMER' | 'RESTAURANT_OWNER' | 'ADMIN';

export interface Address {
  id: string;
  label?: string;
  receiverName: string;
  phone: string;
  addressLine: string;
  isDefault: boolean;
  /** Vị trí đã ghim (bắt buộc để đặt giao tận nơi — BR-81) */
  location?: GeoPoint;
}

/** GeoJSON: coordinates = [lng, lat] */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

/** Tuyến quán -> nơi nhận: đường đi thật (ROUTING) hoặc ước lượng (ESTIMATE) */
export interface DeliveryRoute {
  distanceKm: number;
  durationMinutes: number;
  source: 'ROUTING' | 'ESTIMATE';
  provider?: string;
}

export interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  addresses?: Address[];
}

/** { items, page, limit, total } — docs/API.md mục 1.1 */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

// ================= Quán & menu (API public, docs/API.md mục 2.4) =================

export interface OpeningHour {
  /** 0 = Chủ nhật */
  dayOfWeek: number;
  open: string;
  close: string;
}

/** Thông tin quán rút gọn đi kèm từng món trong GET /menu-items */
export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  isOpenNow: boolean;
  canAcceptOrders: boolean;
}

export interface Restaurant extends RestaurantSummary {
  description?: string;
  address: string;
  phone: string;
  logoUrl?: string;
  coverUrl?: string;
  cuisineTypes: string[];
  openingHours: OpeningHour[];
  minOrderAmount: number;
  deliveryRadiusKm?: number;
  location?: GeoPoint;
  /** Khoảng cách ước lượng tới người xem (khi gửi lat/lng) */
  distanceKm?: number;
  avgPrepMinutes?: number;
  ratingAvg: number;
  ratingCount: number;
}

export type MenuItemType = 'FOOD' | 'DRINK';

export interface Variant {
  id: string;
  name: string;
  price: number;
  isDefault: boolean;
}

export interface MenuOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  type: MenuItemType;
  /** Có biến thể thì bằng giá biến thể mặc định */
  basePrice: number;
  tags: string[];
  variants: Variant[];
  optionGroups: OptionGroup[];
  isAvailable: boolean;
  prepMinutes?: number;
  soldCount: number;
  /** Số suất còn lại hôm nay; null = không giới hạn */
  remainingToday: number | null;
  /** Còn đặt được không (chưa tính giờ mở cửa của quán) */
  isOrderable: boolean;
  /** Có ở GET /menu-items; menu của một quán thì không có */
  restaurant?: RestaurantSummary;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

// ================= Giỏ hàng & đơn hàng =================

/** Một dòng trong giỏ: cùng món nhưng khác size/topping là 2 dòng */
export interface CartLine {
  /** menuItemId|variantId|optionIds — để gộp dòng trùng */
  key: string;
  menuItemId: string;
  name: string;
  imageUrl?: string;
  variantId?: string;
  variantName?: string;
  optionIds: string[];
  optionNames: string[];
  /** Giá 1 phần (biến thể + topping), chỉ để hiển thị — server tính lại khi đặt (BR-31) */
  unitPrice: number;
  /** null = không giới hạn */
  maxQty: number | null;
  qty: number;
}

/** Enum trạng thái đơn mới (docs/database.md — orders.status, BR-35) */
export type OrderStatus =
  /** Đơn chuyển khoản trả trước đang chờ tiền về (quán chưa thấy) */
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';

/** Dòng đơn — snapshot tại lúc đặt (BR-33) */
export interface OrderLine {
  id: string;
  menuItem: string;
  name: string;
  imageUrl?: string;
  variant?: { name: string; price: number };
  options: { groupName: string; name: string; price: number }[];
  unitPrice: number;
  qty: number;
  lineTotal: number;
  note?: string;
}

export interface OrderStatusEvent {
  from?: OrderStatus;
  to: OrderStatus;
  actorType: 'CUSTOMER' | 'OWNER' | 'ADMIN' | 'SYSTEM';
  reason?: string;
  at: string;
}

/** Đơn hàng từ API /orders (docs/database.md mục 3.5) */
export interface Order {
  id: string;
  /** vd MAK261006-0042 */
  code: string;
  restaurant: string;
  restaurantSnapshot: { name: string; slug?: string; phone?: string; address?: string };
  items: OrderLine[];
  fulfillmentType: FulfillmentType;
  delivery?: { receiverName: string; phone: string; addressLine: string; note?: string; location?: GeoPoint };
  route?: DeliveryRoute;
  estimatedDeliveryMinutes?: number;
  subtotal: number;
  /** Luôn 0 — miễn phí giao hàng */
  deliveryFee: number;
  discount: number;
  total: number;
  /** Tổng giảm = restaurantDiscount (quán chịu) + platformDiscount (MAK chịu) */
  restaurantDiscount?: number;
  platformDiscount?: number;
  vouchers?: OrderVoucher[];
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Trả trước: nội dung chuyển khoản + hạn thanh toán */
  paymentCode?: string;
  paymentDeadline?: string;
  paidAt?: string;
  paidAmount?: number;
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
  cancelReason?: { code: string; note?: string };
  estimatedReadyAt?: string;
  /** null khi đơn trả trước chưa thanh toán */
  placedAt: string | null;
  createdAt: string;
}

export type PaymentMethod = 'COD' | 'BANK_TRANSFER';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUND_PENDING' | 'REFUNDED';

/** GET /payments/methods */
export interface PaymentMethods {
  COD: boolean;
  BANK_TRANSFER: boolean;
  paymentTimeoutMinutes: number;
}

/** GET /orders/:id/payment — trang quét mã VietQR */
export interface OrderPaymentInfo {
  orderId: string;
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amount: number;
  paymentCode?: string;
  paymentDeadline?: string;
  paidAt?: string;
  paidAmount?: number;
  qrUrl: string | null;
  bank: { bankId: string; accountNo: string; accountName: string } | null;
}

/** POST /orders/preview — tiền do server tính */
export interface OrderPreview {
  items: (Omit<OrderLine, 'id' | 'menuItem'> & { menuItemId: string })[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  restaurantDiscount: number;
  platformDiscount: number;
  vouchers: (Omit<OrderVoucher, 'voucher'> & { id: string })[];
  /** null: chưa ghim nơi nhận / quán chưa có vị trí / tự đến lấy */
  route: DeliveryRoute | null;
  estimatedDeliveryMinutes: number | null;
  total: number;
}

// ================= Voucher (docs/API.md mục 2.12) =================

export type VoucherFundedBy = 'PLATFORM' | 'RESTAURANT';
export type VoucherType = 'PERCENT' | 'FIXED';

/** Voucher đã áp vào đơn (snapshot) */
export interface OrderVoucher {
  voucher: string;
  code: string;
  fundedBy: VoucherFundedBy;
  type: VoucherType;
  value: number;
  discount: number;
}

/** GET /vouchers/available — voucher khách còn dùng được ở quán */
export interface PublicVoucher {
  id: string;
  code: string;
  description?: string;
  fundedBy: VoucherFundedBy;
  type: VoucherType;
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  /** Chỉ áp dụng khi khách chọn các phương thức này */
  paymentMethods: PaymentMethod[];
  startAt: string;
  endAt: string;
  /** null = không giới hạn */
  remaining: number | null;
}

/** Voucher trong trang quản lý (chủ quán / admin) */
export interface ManagedVoucher extends Omit<PublicVoucher, 'remaining'> {
  restaurant?: { id: string; name: string; slug?: string } | null;
  restaurants: { id: string; name: string; slug?: string }[];
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED';
  createdAt: string;
}

export interface VoucherInput {
  code?: string;
  description?: string;
  type?: VoucherType;
  value?: number;
  maxDiscount?: number | null;
  minOrderAmount?: number;
  paymentMethods?: PaymentMethod[];
  usageLimit?: number | null;
  perUserLimit?: number;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
  /** Admin: rỗng = mọi quán */
  restaurants?: string[];
}

export interface VoucherUsage {
  id: string;
  order: { id: string; code: string; status: OrderStatus; total: number; placedAt?: string | null; createdAt: string } | null;
  customer: string;
  discount: number;
  active: boolean;
  createdAt: string;
}

// ================= Chủ quán (/merchant/*, docs/API.md mục 2.5) =================

export type RestaurantStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
export type DocumentType = 'BUSINESS_LICENSE' | 'FOOD_SAFETY' | 'ID_CARD';

export interface RestaurantDocument {
  type: DocumentType;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
}

/** Quán của tôi — có thêm trạng thái duyệt, giấy tờ, hoa hồng */
export interface MerchantRestaurant extends Restaurant {
  status: RestaurantStatus;
  rejectReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  isAcceptingOrders: boolean;
  commissionRate: number;
  documents: RestaurantDocument[];
  /** Ví đối soát âm quá hạn mức / quá hạn -> tạm ngưng nhận đơn (API-11) */
  walletLockedAt?: string | null;
  walletLockReason?: WalletLockReason | null;
  bankAccount?: BankAccount;
}

export interface MerchantCategory {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  itemCount: number;
}

export interface MerchantMenuItem extends Omit<MenuItem, 'restaurant'> {
  category: string;
  /** null = không giới hạn */
  dailyLimit: number | null;
  soldToday: number;
  sortOrder: number;
}

// ================= Quản trị viên (/admin/*, docs/API.md mục 2.7) =================

export interface AdminRestaurant extends Omit<MerchantRestaurant, 'documents'> {
  owner: { id: string; fullName: string; email?: string; phone?: string; status: 'ACTIVE' | 'BLOCKED' } | null;
  /** url: đường dẫn API xem file (cần token admin) */
  documents: (RestaurantDocument & { url?: string })[];
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor?: { id: string; fullName: string; email?: string; role: Role } | null;
  actorRole: Role | 'SYSTEM';
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
  createdAt: string;
}

/** Đơn phía chủ quán: thêm thông tin khách, hoa hồng, bước tiếp theo gợi ý */
export interface MerchantOrder extends Order {
  customer: { id: string; fullName: string; phone?: string; email?: string } | null;
  commissionRate: number;
  commissionAmount: number;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  nextStatus: OrderStatus | null;
}

export type OwnerReasonCode = 'OUT_OF_STOCK' | 'OVERLOADED' | 'CLOSED' | 'OTHER';

// ================= Thông báo (/notifications, docs/API.md mục 2.8) =================

export type NotificationType =
  | 'ORDER_NEW'
  | 'ORDER_STATUS'
  | 'RESTAURANT_SUBMITTED'
  | 'RESTAURANT_APPROVED'
  | 'RESTAURANT_REJECTED'
  | 'RESTAURANT_BLOCKED'
  | 'RESTAURANT_UNBLOCKED'
  | 'REVIEW_NEW'
  | 'WALLET_NEGATIVE'
  | 'WALLET_LOCKED'
  | 'WALLET_UNLOCKED'
  | 'TOPUP_REQUESTED'
  | 'TOPUP_CONFIRMED'
  | 'TOPUP_REJECTED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_PAID'
  | 'PAYOUT_REJECTED'
  | 'PAYMENT_ISSUE'
  | 'PAYMENT_UNMATCHED'
  | 'REFUND_REQUESTED'
  | 'REFUND_DONE';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** link: trang mở khi bấm vào thông báo */
  data: { orderId?: string; restaurantId?: string; code?: string; link?: string };
  isRead: boolean;
  createdAt: string;
}

// ================= Đánh giá quán (API-8): 1–5 sao, mỗi khách 1 đánh giá / quán =================

export interface Review {
  id: string;
  rating: number;
  comment?: string;
  /** Tên rút gọn, vd "An N." */
  author: string;
  reply?: { content: string; repliedAt: string };
  createdAt: string;
  updatedAt: string;
  /** Chỉ có ở phía chủ quán / admin / đánh giá của chính mình */
  isHidden?: boolean;
  hiddenReason?: string;
}

export interface ReviewSummary {
  ratingAvg: number;
  ratingCount: number;
  /** Số lượt theo mức sao 1..5 */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface AdminReview extends Review {
  customer: { id: string; fullName: string; email?: string } | null;
  restaurant: { id: string; name: string; slug: string } | null;
}

// ================= Báo cáo (API-9) =================

export interface ReportRange {
  from: string;
  to: string;
  days: number;
}

export interface ReportTotals {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  itemsSold: number;
  /** Tổng tiền đơn hoàn thành */
  grossRevenue: number;
  commission: number;
  netRevenue: number;
  avgOrderValue: number;
  /** 0–1, trên các đơn đã kết thúc */
  cancelRate: number;
}

export interface MerchantSummary extends ReportTotals {
  range: ReportRange;
  commissionRate: number;
  ratingAvg: number;
  ratingCount: number;
}

export type GroupBy = 'day' | 'week' | 'month';

export interface RevenuePoint {
  /** Ngày đầu kỳ YYYY-MM-DD */
  period: string;
  orders: number;
  completedOrders: number;
  grossRevenue: number;
  commission: number;
  netRevenue: number;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  qty: number;
  revenue: number;
  orders: number;
}

export interface AdminSummary {
  range: ReportRange;
  orders: ReportTotals;
  gmv: number;
  platformRevenue: number;
  restaurants: { byStatus: Partial<Record<RestaurantStatus, number>>; total: number };
  users: { byRole: Partial<Record<Role, number>>; blocked: number; newInRange: number };
  series: RevenuePoint[];
  topRestaurants: { restaurantId: string; name: string; slug?: string; completedOrders: number; grossRevenue: number; commission: number }[];
}

export interface AdminUser {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  emailVerified: boolean;
  createdAt: string;
  restaurant: { id: string; name: string; slug: string; status: RestaurantStatus } | null;
}

export interface AdminOrder extends Omit<Order, 'customer'> {
  customer: { id: string; fullName: string; email?: string; phone?: string } | null;
  commissionAmount: number;
}

// ================= Ví đối soát (API-11): sổ cái, nạp tiền trả nợ, rút tiền =================

export type WalletLockReason = 'OVER_LIMIT' | 'OVERDUE';

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export type RestaurantRef = string | { id: string; name: string; slug?: string };

export type TopupStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
export interface Topup {
  id: string;
  code: string;
  restaurant: RestaurantRef;
  amount: number;
  receivedAmount?: number;
  status: TopupStatus;
  bankRef?: string;
  rejectReason?: string;
  createdAt: string;
  processedAt?: string;
  /** Nội dung chuyển khoản (= code) */
  transferContent: string;
  /** Ảnh VietQR; null khi MAK chưa cấu hình tài khoản nhận */
  qrUrl: string | null;
}

export type PayoutStatus = 'REQUESTED' | 'PAID' | 'REJECTED';
export interface Payout {
  id: string;
  restaurant: RestaurantRef;
  amount: number;
  bankAccount: BankAccount;
  status: PayoutStatus;
  bankRef?: string;
  rejectReason?: string;
  createdAt: string;
  processedAt?: string;
}

export type WalletEntryKind =
  | 'ORDER_SETTLE' | 'TOPUP' | 'PAYOUT_REQUEST' | 'PAYOUT_PAID' | 'PAYOUT_REJECT' | 'ADJUSTMENT'
  | 'ORDER_PAYMENT' | 'REFUND_PENDING' | 'REFUND_PAID';
export interface WalletEntry {
  id: string;
  kind: WalletEntryKind;
  /** Có dấu: + cộng vào ví quán, − trừ */
  amount: number;
  balanceAfter: number;
  note?: string;
  order?: string;
  createdAt: string;
}

export interface MerchantWallet {
  balance: number;
  available: number;
  negativeSince: string | null;
  /** Hạn nạp: quá thời điểm này mà vẫn âm thì quán bị tạm ngưng */
  lockDeadline: string | null;
  locked: boolean;
  lockedAt: string | null;
  lockReason: WalletLockReason | null;
  creditLimit: number;
  graceDays: number;
  payoutMin: number;
  topupMin: number;
  bankAccount: BankAccount | null;
  pendingPayout: Payout | null;
  pendingTopup: Topup | null;
  platformBank: { bankId: string; accountNo: string; accountName: string } | null;
}

export interface WalletOverview {
  platformRevenue: number;
  cashHeld: number;
  payoutHold: number;
  owedToRestaurants: number;
  owedByRestaurants: number;
  negativeRestaurants: number;
  lockedRestaurants: number;
  pendingTopups: number;
  pendingPayouts: { count: number; amount: number };
  /** Tiền khách trả trước đang giữ, chờ đơn hoàn thành */
  escrow: number;
  /** Tiền phải hoàn cho khách */
  refundHold: number;
  pendingRefunds: { count: number; amount: number };
  unmatchedPayments: number;
  /** Sổ cái kép: tổng số dư = 0 */
  balanced: boolean;
}

export type RefundReason = 'ORDER_CANCELLED' | 'LATE_PAYMENT' | 'UNDERPAID' | 'OVERPAID' | 'DUPLICATE' | 'UNMATCHED';
export interface Refund {
  id: string;
  order?: { id: string; code: string; total: number } | null;
  payment?: { id: string; referenceCode?: string; gateway?: string; content?: string; transactionDate?: string } | null;
  customer?: { id: string; fullName: string; phone?: string; email?: string } | null;
  amount: number;
  reason: RefundReason;
  status: 'PENDING' | 'DONE';
  note?: string;
  bankRef?: string;
  createdAt: string;
  processedAt?: string;
}

export type BankPaymentStatus = 'PROCESSING' | 'MATCHED_ORDER' | 'MATCHED_TOPUP' | 'LATE' | 'UNDERPAID' | 'DUPLICATE' | 'UNMATCHED' | 'REFUNDING' | 'IGNORED';
/** Giao dịch SePay báo về */
export interface BankPayment {
  id: string;
  providerTxId: string;
  gateway?: string;
  accountNumber?: string;
  transferType: string;
  amount: number;
  content?: string;
  code?: string;
  referenceCode?: string;
  transactionDate?: string;
  status: BankPaymentStatus;
  order?: { id: string; code: string } | null;
  note?: string;
  createdAt: string;
}

export interface AdminWallet {
  id: string;
  balance: number;
  negativeSince: string | null;
  lockDeadline: string | null;
  restaurant: {
    id: string;
    name: string;
    slug?: string;
    status: RestaurantStatus;
    walletLockedAt?: string | null;
    walletLockReason?: WalletLockReason | null;
    bankAccount?: BankAccount;
  } | null;
}
