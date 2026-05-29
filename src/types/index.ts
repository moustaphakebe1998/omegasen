// src/types/index.ts — Types centraux Omegasen

import type { Role, OrderStatus, PaymentStatus, PaymentMethod } from "@prisma/client";
export type { Role, OrderStatus, PaymentStatus, PaymentMethod };

// ── Auth ──────────────────────────────────────

export interface JWTPayload {
  sub: string; // userId
  email: string;
  role: Role;
  restaurants: string[]; // restaurantIds autorisés
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  restaurants: string[];
}

// ── API Response ──────────────────────────────

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
  code?: string;
  field?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Pagination ────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ── Orders ────────────────────────────────────

export interface OrderWithItems {
  id: string;
  orderNumber: string;
  restaurantId: string;
  status: OrderStatus;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  notes?: string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  isTakeaway: boolean;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date | null;
  preparingAt?: Date | null;
  readyAt?: Date | null;
  servedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  items: OrderItemWithOptions[];
  payments?: PaymentInfo[];
}

export interface OrderItemWithOptions {
  id: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  notes?: string | null;
  options: OrderItemOptionInfo[];
}

export interface OrderItemOptionInfo {
  id: string;
  optionName: string;
  priceModifier: string;
}

export interface PaymentInfo {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  paidAt?: Date | null;
}

// ── Menu ──────────────────────────────────────

export interface CategoryWithProducts {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isVisible: boolean;
  products: ProductSummary[];
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  price: string;
  promoPrice?: string | null;
  isAvailable: boolean;
  isVisible: boolean;
  isFeatured: boolean;
  stockQuantity?: number | null;
  preparationTime?: number | null;
  optionGroups: OptionGroupWithOptions[];
}

export interface OptionGroupWithOptions {
  id: string;
  name: string;
  isRequired: boolean;
  minChoices: number;
  maxChoices: number;
  options: OptionInfo[];
}

export interface OptionInfo {
  id: string;
  name: string;
  priceModifier: string;
  isDefault: boolean;
  isAvailable: boolean;
}

// ── Cart (côté client uniquement, recalculé serveur) ──

export interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  selectedOptions: {
    groupId: string;
    optionId: string;
    optionName: string;
    priceModifier: number;
  }[];
}

// ── Analytics ────────────────────────────────

export interface DashboardKPIs {
  revenue: number;
  revenueChange: number; // % vs période précédente
  orderCount: number;
  orderCountChange: number;
  averageBasket: number;
  averageBasketChange: number;
  cancellationRate: number;
  avgPrepTime: number; // minutes
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalSold: number;
  revenue: number;
}

// ── SSE ──────────────────────────────────────

export type SSEEventType =
  | "order:new"
  | "order:update"
  | "order:cancelled"
  | "menu:update"
  | "kitchen:alert"
  | "payment:update"
  | "stock:update"
  | "system:notice"
  | "heartbeat";

export interface SSEEvent<T = unknown> {
  id: string;
  type: SSEEventType;
  data: T;
  restaurantId: string;
  timestamp: string;
}

// ── Kitchen ──────────────────────────────────

export type KitchenOrderStatus = Extract<
  OrderStatus,
  "CONFIRMED" | "PREPARING" | "READY"
>;

export interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: KitchenOrderStatus;
  tableNumber?: string | null;
  customerName?: string | null;
  isTakeaway: boolean;
  items: KitchenOrderItem[];
  createdAt: Date;
  confirmedAt?: Date | null;
  preparingAt?: Date | null;
  readyAt?: Date | null;
  elapsedMinutes: number;
  isUrgent: boolean; // > 15 min
}

export interface KitchenOrderItem {
  id: string;
  productName: string;
  quantity: number;
  notes?: string | null;
  options: string[]; // ["Sans oignons", "Extra sauce"]
}

// ── Restaurant ───────────────────────────────

export interface RestaurantInfo {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  currency: string;
  taxRate: string;
  timezone: string;
  isActive: boolean;
  maintenanceMode: boolean;
}
