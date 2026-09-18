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

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  governorate: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender_type: string;
  body: string;
  status: string;
  created_at: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  customer: Customer;
  messages: Message[];
}

export interface AIDraft {
  run_id: string;
  content: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
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
  latest_quote_version: number | null;
  quote_expires_at: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  updated_at: string;
}

export interface TeamMember {
  user_id: string;
  full_name: string;
  email: string;
  role: Membership['role'];
  active: boolean;
  joined_at: string;
}

export interface Analytics {
  customers: number;
  products: number;
  conversations: number;
  human_conversations: number;
  orders: number;
  confirmed_orders: number;
  delivered_orders: number;
  order_value_minor: number;
  low_stock_variants: number;
  conversion_rate: number;
}

export interface Integration {
  key: 'whatsapp' | 'llm' | 'carrier';
  name: string;
  configured: boolean;
  detail: string;
}

export interface AIStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  monthly_budget_minor: number;
  spent_minor: number;
  run_count: number;
  successful_runs: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface AIRun {
  id: string;
  conversation_id: string;
  model: string;
  prompt_version: string;
  status: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  error_code: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
}
