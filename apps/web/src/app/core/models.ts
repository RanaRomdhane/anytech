export interface Membership {
  company_id: string;
  role: 'platform_admin' | 'company_admin' | 'agent';
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  memberships: Membership[];
}

export interface Variant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price_minor: number;
  sale_price_minor: number | null;
  stock_on_hand: number;
  stock_reserved: number;
  available_stock: number;
  version: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  active: boolean;
  variants: Variant[];
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  channel: string;
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'AI_PAUSED';
  assigned_user_id: string | null;
  version: number;
  updated_at: string;
  customer_name: string;
}

export interface OrderItem {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price_minor: number;
}

export interface Order {
  id: string;
  status: string;
  currency: string;
  delivery_minor: number;
  total_minor: number;
  version: number;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}
