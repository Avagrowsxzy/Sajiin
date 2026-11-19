// User & Auth Types
export interface User {
  id: string;
  role_id: number;
  role_name: 'user' | 'kasir' | 'admin';
  full_name: string;
  username: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  has_mfa: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_setup_required?: boolean;
  mfa_token: string;
}

export const SECURITY_QUESTIONS = [
  'Apa nama hewan peliharaan pertama Anda?',
  'Di kota mana ibu kandung Anda lahir?',
  'Apa nama sekolah dasar (SD) pertama Anda?',
] as const;

// API Response Types
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

// Menu Types
export interface Category {
  id: number;
  name: string;
}

export interface MenuItem {
  id: string;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_available: boolean;
  created_at: string;
}

// Cart Types
export interface CartItem {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  menu_item_price: number;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}

// Order Types — alur pesan-ambil dengan konfirmasi admin
export type OrderStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export interface OrderItem {
  id: string;
  order_id?: string;
  menu_item_id: string;
  menu_name?: string;
  quantity: number;
  unit_price: number;
  subtotal?: number;
}

export interface Order {
  id: string;
  order_code: string;
  user_id: string;
  user_name?: string;
  user_username?: string;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

// Payment Types
export type PaymentStatus = 'pending' | 'settled' | 'failed' | 'refunded' | 'cancelled';

export type ClaimPaymentMethod = 'transfer' | 'tunai';

export interface Payment {
  id: string;
  order_id: string;
  gateway_ref: string | null;
  method: string | null;
  amount: number;
  status: PaymentStatus;
  payment_url?: string;
  paid_at: string | null;
  proof_path?: string | null;
  proof_mime?: string | null;
  proof_uploaded_at?: string | null;
  created_at: string;
}

// Notification Types
export interface AppNotification {
  id: string;
  user_id: string;
  type: 'order' | 'payment';
  title: string;
  message: string;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
}

// Admin Types
export interface DashboardSummary {
  total_orders: number;
  total_revenue: string;
  pending_orders: number;
  out_of_stock_menu: number;
  orders_by_status: {
    pending: number;
    awaiting_confirmation: number;
    paid: number;
    preparing: number;
    ready: number;
    completed: number;
    cancelled: number;
  };
}

export interface AdminUser {
  id: string;
  role_id: number;
  role_name: string;
  full_name: string;
  username: string;
  is_active: boolean;
  has_mfa?: boolean;
  password_admin_compliant?: boolean;
  locked_until: string | null;
  created_at: string;
}
