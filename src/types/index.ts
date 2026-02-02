// Types pour l'application

export interface User {
  id: number;
  uid: string;
  fullname: string;
  email: string;
  phone: string;
  role: 'admin' | 'supervisor' | 'agent';
  service_id: number;
  zone: string | null;
  is_active: boolean;
}

export interface LocalProfile {
  user_id: number;
  user_uid: string;
  fullname: string;
  service_id: number;
  zone: string | null;
  token: string;
  saved_at: string;
}

export interface Terminal {
  id: number;
  terminal_uid: string;
  user_id: number;
  user_uid: string;
  is_blocked: boolean;
  last_sync_at: string | null;
}

export interface LocalTerminal {
  terminal_id: number;
  terminal_uid: string;
  user_id: number;
  user_uid: string;
  is_blocked: number;
  last_sync_at: string | null;
}

export interface TaxCategorie {
  id: number;
  service_id: number;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalTaxCategorie {
  tax_categorie_id: number;
  service_id: number;
  label: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface TaxType {
  id: number;
  tax_categorie_id: number;
  label: string;
  amount: number | null;
  min_amount: number | null;
  max_amount: number | null;
  require_chassis_number: boolean;
  require_color: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalTaxType {
  tax_type_id: number;
  tax_categorie_id: number;
  label: string;
  amount: number | null;
  min_amount: number | null;
  max_amount: number | null;
  require_chassis_number: number;
  require_color: number;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id?: number;
  uuid: string;
  payer_name: string;
  payer_phone: string | null;
  service_id: number;
  tax_categorie_id: number;
  tax_type_id: number;
  quantity: number;
  unit_price: number;
  total_amount: number;
  chassis_number: string | null;
  vehicle_color: string | null;
  paid_at: string;
  user_id: number;
  terminal_id: number;
  qr_signature: string;
  receipt_no?: string;
}

export interface LocalPaymentQueue {
  local_uuid: string;
  payer_name: string;
  payer_phone: string | null;
  service_id: number;
  tax_categorie_id: number;
  tax_type_id: number;
  quantity: number;
  unit_price: number;
  total_amount: number;
  chassis_number: string | null;
  vehicle_color: string | null;
  paid_at: string;
  user_id: number;
  terminal_id: number;
  qr_signature: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  server_receipt_no: string | null;
  server_payment_id: number | null;
  created_at: string;
}

export interface SyncState {
  key: string;
  value: string;
}

export interface LoginCredentials {
  user_uid: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type PaymentStatus = 'PENDING' | 'SYNCED' | 'FAILED';
