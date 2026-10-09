export type Role = 'CUSTOMER' | 'RESTAURANT_OWNER' | 'ADMIN';

export interface Address {
  id: string;
  label?: string;
  receiverName: string;
  phone: string;
  addressLine: string;
  isDefault: boolean;
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
  delivery?: { receiverName: string; phone: string; addressLine: string; note?: string };
  subtotal: number;
  /** Luôn 0 — miễn phí giao hàng */
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: 'COD';
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
  cancelReason?: { code: string; note?: string };
  estimatedReadyAt?: string;
  placedAt: string;
  createdAt: string;
}

/** POST /orders/preview — tiền do server tính */
export interface OrderPreview {
  items: (Omit<OrderLine, 'id' | 'menuItem'> & { menuItemId: string })[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
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
  | 'REVIEW_NEW';

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
