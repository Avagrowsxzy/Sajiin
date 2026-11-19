// Konteks request, dikirim ke service/repository untuk scoped queries
export interface RequestContext {
  userId: string;
  role: 'admin' | 'kasir' | 'user';
}

// Format error standar
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Format list standar
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

// Pagination params
export interface PaginationParams {
  page: number;
  limit: number;
}

// Role constants
export const ROLES = {
  ADMIN: 1,
  USER: 2,
  KASIR: 4,
} as const;

export type RoleId = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_NAMES: Record<RoleId, string> = {
  [ROLES.ADMIN]: 'admin',
  [ROLES.USER]: 'user',
  [ROLES.KASIR]: 'kasir',
};

// Order status — alur pesan-ambil dengan konfirmasi admin
// pending -> awaiting_confirmation -> paid -> preparing -> ready -> completed
export type OrderStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

// Payment status
export type PaymentStatus = 'pending' | 'settled' | 'failed' | 'refunded' | 'cancelled';

// Audit log actions
export const AUDIT_ACTIONS = {
  AUTH_REGISTER: 'AUTH_REGISTER',
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOCKED: 'AUTH_LOCKED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_MFA_ENABLED: 'AUTH_MFA_ENABLED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  MENU_CREATE: 'MENU_CREATE',
  MENU_UPDATE: 'MENU_UPDATE',
  MENU_DELETE: 'MENU_DELETE',
  CATEGORY_CHANGE: 'CATEGORY_CHANGE',
  ORDER_CREATE: 'ORDER_CREATE',
  ORDER_CANCEL: 'ORDER_CANCEL',
  ORDER_STATUS_CHANGE: 'ORDER_STATUS_CHANGE',
  PAYMENT_CREATE: 'PAYMENT_CREATE',
  PAYMENT_CLAIMED: 'PAYMENT_CLAIMED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  PAYMENT_WEBHOOK: 'PAYMENT_WEBHOOK',
  PAYMENT_REFUND: 'PAYMENT_REFUND',
  USER_STATUS_CHANGE: 'USER_STATUS_CHANGE',
  USER_ROLE_CHANGE: 'USER_ROLE_CHANGE',
  SYSTEM_CONFIG_CHANGE: 'SYSTEM_CONFIG_CHANGE',
  ACCESS_DENIED: 'ACCESS_DENIED',
} as const;
