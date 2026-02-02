// Schéma de la base de données SQLite locale

export const CREATE_TABLES_SQL = `
PRAGMA foreign_keys = OFF;

-- Profil local (agent connecté)
CREATE TABLE IF NOT EXISTS local_profile (
  user_id INTEGER NOT NULL,
  user_uid TEXT NOT NULL,
  fullname TEXT NOT NULL,
  service_id INTEGER NOT NULL,
  zone TEXT,
  token TEXT,
  saved_at TEXT NOT NULL
);

-- Terminal local
CREATE TABLE IF NOT EXISTS local_terminal (
  terminal_id INTEGER PRIMARY KEY,
  terminal_uid TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  user_uid TEXT,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT
);

-- tax_categorie
CREATE TABLE IF NOT EXISTS local_tax_categorie (
  tax_categorie_id INTEGER PRIMARY KEY,
  service_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- tax_types
CREATE TABLE IF NOT EXISTS local_tax_types (
  tax_type_id INTEGER PRIMARY KEY,
  tax_categorie_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  amount REAL,
  min_amount REAL,
  max_amount REAL,
  require_chassis_number INTEGER NOT NULL DEFAULT 0,
  require_color INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- File d'attente des paiements offline
CREATE TABLE IF NOT EXISTS local_payments_queue (
  local_uuid TEXT PRIMARY KEY,
  payer_name TEXT NOT NULL,
  payer_phone TEXT,
  service_id INTEGER NOT NULL,
  tax_categorie_id INTEGER NOT NULL,
  tax_type_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  chassis_number TEXT,
  vehicle_color TEXT,
  paid_at TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  terminal_id INTEGER NOT NULL,
  qr_signature TEXT NOT NULL,
  status TEXT NOT NULL,
  server_receipt_no TEXT,
  server_payment_id INTEGER,
  created_at TEXT NOT NULL
);

-- État sync
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_local_tax_categorie_label ON local_tax_categorie(label);
CREATE INDEX IF NOT EXISTS idx_local_tax_categorie_service ON local_tax_categorie(service_id);
CREATE INDEX IF NOT EXISTS idx_local_tax_types_cat ON local_tax_types(tax_categorie_id);
CREATE INDEX IF NOT EXISTS idx_local_payments_status ON local_payments_queue(status);
CREATE INDEX IF NOT EXISTS idx_local_payments_paid_at ON local_payments_queue(paid_at);
`;

export const DROP_TABLES_SQL = `
DROP TABLE IF EXISTS local_payments_queue;
DROP TABLE IF EXISTS local_tax_types;
DROP TABLE IF EXISTS local_tax_categorie;
DROP TABLE IF EXISTS local_terminal;
DROP TABLE IF EXISTS local_profile;
DROP TABLE IF EXISTS sync_state;
`;
