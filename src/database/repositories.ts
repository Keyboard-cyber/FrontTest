import { getDatabase } from './database';
import { LocalProfile, LocalTerminal, LocalTaxCategorie, LocalTaxType, LocalPaymentQueue, SyncState } from '../types';

// ==================== LOCAL PROFILE ====================

export const saveLocalProfile = async (profile: LocalProfile): Promise<void> => {
  const db = await getDatabase();
  
  // Supprimer l'ancien profil
  await db.runAsync('DELETE FROM local_profile');
  
  // Insérer le nouveau avec service_ids
  await db.runAsync(
    `INSERT INTO local_profile (user_id, user_uid, fullname, service_id, service_ids, zone, token, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [profile.user_id, profile.user_uid, profile.fullname, profile.service_id, profile.service_ids || '[]', profile.zone, profile.token, profile.saved_at]
  );
};

export const getLocalProfile = async (): Promise<LocalProfile | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync('SELECT * FROM local_profile LIMIT 1') as any;
  if (result) {
    // S'assurer que service_ids est bien présent
    result.service_ids = result.service_ids || '[]';
    return result as LocalProfile;
  }
  return null;
};

export const getServiceIds = async (): Promise<number[]> => {
  const profile = await getLocalProfile();
  if (!profile) return [];
  try {
    return JSON.parse(profile.service_ids || '[]');
  } catch {
    return profile.service_id ? [profile.service_id] : [];
  }
};

export const clearLocalProfile = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM local_profile');
};

// ==================== LOCAL TERMINAL ====================

export const saveLocalTerminal = async (terminal: LocalTerminal): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_terminal (terminal_id, terminal_uid, user_id, user_uid, is_blocked, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [terminal.terminal_id, terminal.terminal_uid, terminal.user_id, terminal.user_uid, terminal.is_blocked, terminal.last_sync_at]
  );
};

export const getLocalTerminal = async (): Promise<LocalTerminal | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync('SELECT * FROM local_terminal LIMIT 1');
  return (result as LocalTerminal) || null;
};

export const clearLocalTerminal = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM local_terminal');
};

// ==================== TAX CATEGORIES ====================

// Compter le nombre de catégories par service
export const getCategoriesCountByService = async (): Promise<{ service_id: number; count: number }[]> => {
  const db = await getDatabase();
  return await db.getAllAsync(
    'SELECT service_id, COUNT(*) as count FROM local_tax_categorie WHERE is_active = 1 GROUP BY service_id'
  ) as { service_id: number; count: number }[];
};

// Obtenir le nombre total de catégories
export const getTotalCategoriesCount = async (): Promise<number> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM local_tax_categorie WHERE is_active = 1'
  ) as { count: number } | null;
  return result?.count || 0;
};

// Obtenir le nombre total de types de taxes
export const getTotalTaxTypesCount = async (): Promise<number> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM local_tax_types WHERE is_active = 1'
  ) as { count: number } | null;
  return result?.count || 0;
};

export const saveTaxCategories = async (categories: LocalTaxCategorie[]): Promise<void> => {
  const db = await getDatabase();
  
  // Supprimer les anciennes catégories
  await db.runAsync('DELETE FROM local_tax_categorie');
  
  // Insérer les nouvelles
  for (const cat of categories) {
    await db.runAsync(
      `INSERT INTO local_tax_categorie (tax_categorie_id, service_id, label, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cat.tax_categorie_id, cat.service_id, cat.label, cat.is_active, cat.created_at, cat.updated_at]
    );
  }
};

export const getTaxCategories = async (serviceIds?: number | number[]): Promise<LocalTaxCategorie[]> => {
  const db = await getDatabase();
  
  // Convertir en tableau si c'est un nombre unique
  if (serviceIds !== undefined) {
    const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      return await db.getAllAsync(
        `SELECT * FROM local_tax_categorie WHERE service_id IN (${placeholders}) AND is_active = 1 ORDER BY label`,
        ids
      ) as LocalTaxCategorie[];
    }
  }
  
  return await db.getAllAsync(
    'SELECT * FROM local_tax_categorie WHERE is_active = 1 ORDER BY label'
  ) as LocalTaxCategorie[];
};

export const getTaxCategorieById = async (id: number): Promise<LocalTaxCategorie | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT * FROM local_tax_categorie WHERE tax_categorie_id = ?',
    [id]
  );
  return (result as LocalTaxCategorie) || null;
};

// ==================== TAX TYPES ====================

export const saveTaxTypes = async (types: LocalTaxType[]): Promise<void> => {
  const db = await getDatabase();
  
  // Supprimer les anciens types
  await db.runAsync('DELETE FROM local_tax_types');
  
  // Insérer les nouveaux
  for (const type of types) {
    await db.runAsync(
      `INSERT INTO local_tax_types (tax_type_id, tax_categorie_id, service_id, label, amount, min_amount, max_amount, 
       require_chassis_number, require_color, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type.tax_type_id, type.tax_categorie_id, type.service_id, type.label, type.amount, type.min_amount, type.max_amount,
       type.require_chassis_number, type.require_color, type.sort_order, type.is_active, type.created_at, type.updated_at]
    );
  }
};

export const getTaxTypes = async (categorieId?: number): Promise<LocalTaxType[]> => {
  const db = await getDatabase();
  
  if (categorieId) {
    return await db.getAllAsync(
      'SELECT * FROM local_tax_types WHERE tax_categorie_id = ? AND is_active = 1 ORDER BY sort_order, label',
      [categorieId]
    ) as LocalTaxType[];
  }
  
  return await db.getAllAsync(
    'SELECT * FROM local_tax_types WHERE is_active = 1 ORDER BY sort_order, label'
  ) as LocalTaxType[];
};

// Récupérer les taxes directes par service (sans catégorie)
export const getDirectTaxTypesByService = async (serviceIds: number | number[]): Promise<LocalTaxType[]> => {
  const db = await getDatabase();
  const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
  
  if (ids.length === 0) return [];
  
  const placeholders = ids.map(() => '?').join(',');
  return await db.getAllAsync(
    `SELECT * FROM local_tax_types 
     WHERE service_id IN (${placeholders}) 
     AND (tax_categorie_id IS NULL OR tax_categorie_id = 0)
     AND is_active = 1 
     ORDER BY sort_order, label`,
    ids
  ) as LocalTaxType[];
};

export const getTaxTypeById = async (id: number): Promise<LocalTaxType | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT * FROM local_tax_types WHERE tax_type_id = ?',
    [id]
  );
  return (result as LocalTaxType) || null;
};

// ==================== PAYMENTS QUEUE ====================

export const addPaymentToQueue = async (payment: LocalPaymentQueue): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO local_payments_queue (local_uuid, payer_name, payer_phone, service_id, tax_categorie_id, 
     tax_type_id, quantity, unit_price, total_amount, chassis_number, vehicle_color, paid_at, user_id, 
     terminal_id, qr_signature, status, server_receipt_no, server_payment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payment.local_uuid, payment.payer_name, payment.payer_phone, payment.service_id, payment.tax_categorie_id,
     payment.tax_type_id, payment.quantity, payment.unit_price, payment.total_amount, payment.chassis_number,
     payment.vehicle_color, payment.paid_at, payment.user_id, payment.terminal_id, payment.qr_signature,
     payment.status, payment.server_receipt_no, payment.server_payment_id, payment.created_at]
  );
};

export const getPendingPayments = async (): Promise<LocalPaymentQueue[]> => {
  const db = await getDatabase();
  return await db.getAllAsync(
    "SELECT * FROM local_payments_queue WHERE status = 'PENDING' ORDER BY created_at ASC"
  ) as LocalPaymentQueue[];
};

export const getAllPayments = async (): Promise<LocalPaymentQueue[]> => {
  const db = await getDatabase();
  return await db.getAllAsync(
    'SELECT * FROM local_payments_queue ORDER BY created_at DESC'
  ) as LocalPaymentQueue[];
};

export const getPaymentByUuid = async (uuid: string): Promise<LocalPaymentQueue | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT * FROM local_payments_queue WHERE local_uuid = ?',
    [uuid]
  );
  return (result as LocalPaymentQueue) || null;
};

export const updatePaymentStatus = async (
  uuid: string, 
  status: 'PENDING' | 'SYNCED' | 'FAILED',
  serverReceiptNo?: string,
  serverPaymentId?: number,
  serverQrSignature?: string
): Promise<void> => {
  const db = await getDatabase();
  
  if (serverQrSignature) {
    // Met à jour avec la signature QR du serveur
    await db.runAsync(
      `UPDATE local_payments_queue 
       SET status = ?, server_receipt_no = ?, server_payment_id = ?, qr_signature = ?
       WHERE local_uuid = ?`,
      [status, serverReceiptNo || null, serverPaymentId || null, serverQrSignature, uuid]
    );
  } else {
    await db.runAsync(
      `UPDATE local_payments_queue 
       SET status = ?, server_receipt_no = ?, server_payment_id = ?
       WHERE local_uuid = ?`,
      [status, serverReceiptNo || null, serverPaymentId || null, uuid]
    );
  }
};

export const getTodayPaymentsStats = async (userId: number): Promise<{ count: number; total: number }> => {
  const db = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db.getFirstAsync(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total 
     FROM local_payments_queue 
     WHERE user_id = ? AND DATE(paid_at) = ?`,
    [userId, today]
  ) as { count: number; total: number } | null;
  
  return result || { count: 0, total: 0 };
};

export const getPaymentsByDate = async (userId: number, date: string): Promise<LocalPaymentQueue[]> => {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT * FROM local_payments_queue 
     WHERE user_id = ? AND DATE(paid_at) = ? 
     ORDER BY created_at DESC`,
    [userId, date]
  ) as LocalPaymentQueue[];
};

// ==================== SYNC STATE ====================

export const setSyncState = async (key: string, value: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)',
    [key, value]
  );
};

export const getSyncState = async (key: string): Promise<string | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    'SELECT value FROM sync_state WHERE key = ?',
    [key]
  ) as SyncState | null;
  return result?.value || null;
};

// ==================== OFFLINE CREDENTIALS ====================

export interface OfflineCredentials {
  user_id: number;
  email: string;
  password_hash: string;
  fullname: string;
  user_uid?: string;
  service_id?: number;
  service_ids?: string;
  zone?: string;
  role?: 'agent' | 'controleur';
  created_at: string;
}

// Simple hash pour stocker le mot de passe (pas pour la sécurité, juste pour ne pas stocker en clair)
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Ajouter le sel basé sur l'email pour plus de sécurité
  return `h${Math.abs(hash).toString(36)}`;
};

export const saveOfflineCredentials = async (
  email: string,
  password: string,
  profile: LocalProfile,
  role: 'agent' | 'controleur' = 'agent'
): Promise<void> => {
  const db = await getDatabase();
  
  // Supprimer les anciens credentials pour cet utilisateur
  await db.runAsync('DELETE FROM offline_credentials WHERE user_id = ?', [profile.user_id]);
  
  await db.runAsync(
    `INSERT INTO offline_credentials (user_id, email, password_hash, fullname, user_uid, service_id, service_ids, zone, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.user_id,
      email.toLowerCase().trim(),
      simpleHash(password + email.toLowerCase()),
      profile.fullname,
      profile.user_uid,
      profile.service_id,
      profile.service_ids || '[]',
      profile.zone,
      role,
      new Date().toISOString()
    ]
  );
};

export const verifyOfflineCredentials = async (
  email: string,
  password: string
): Promise<OfflineCredentials | null> => {
  const db = await getDatabase();
  
  const result = await db.getFirstAsync(
    'SELECT * FROM offline_credentials WHERE email = ?',
    [email.toLowerCase().trim()]
  ) as OfflineCredentials | null;
  
  if (!result) return null;
  
  // Vérifier le hash
  const inputHash = simpleHash(password + email.toLowerCase());
  if (result.password_hash !== inputHash) return null;
  
  return result;
};

export const getOfflineCredentials = async (email: string): Promise<OfflineCredentials | null> => {
  const db = await getDatabase();
  return await db.getFirstAsync(
    'SELECT * FROM offline_credentials WHERE email = ?',
    [email.toLowerCase().trim()]
  ) as OfflineCredentials | null;
};

export const hasOfflineCredentials = async (): Promise<boolean> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync('SELECT COUNT(*) as count FROM offline_credentials') as { count: number } | null;
  return (result?.count || 0) > 0;
};

// ==================== UTILITIES ====================

// Efface les données de session SAUF: historique, credentials offline, catégories et types de taxes
export const clearAllData = async (): Promise<void> => {
  const db = await getDatabase();
  // NE PAS supprimer: 
  // - local_payments_queue (historique)
  // - offline_credentials (reconnexion offline)
  // - local_tax_categorie (catégories de taxes)
  // - local_tax_types (types de taxes)
  await db.runAsync('DELETE FROM local_terminal');
  await db.runAsync('DELETE FROM local_profile');
  await db.runAsync('DELETE FROM sync_state');
};

// Efface uniquement les données d'authentification (conserve tout le reste)
export const clearAuthData = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM local_terminal');
  await db.runAsync('DELETE FROM local_profile');
  // On garde: paiements, taxes, et credentials offline
};

// Efface TOUT y compris credentials offline (utilisé pour reset complet)
export const clearAllDataComplete = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM local_payments_queue');
  await db.runAsync('DELETE FROM local_tax_types');
  await db.runAsync('DELETE FROM local_tax_categorie');
  await db.runAsync('DELETE FROM local_terminal');
  await db.runAsync('DELETE FROM local_profile');
  await db.runAsync('DELETE FROM sync_state');
  await db.runAsync('DELETE FROM offline_credentials');
};
