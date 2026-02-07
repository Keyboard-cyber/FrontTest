import * as Network from 'expo-network';
import { v4 as uuidv4 } from 'uuid';
import {
  getLocalProfile,
  getPendingPayments,
  updatePaymentStatus,
  saveTaxCategories,
  saveTaxTypes,
  setSyncState,
  getSyncState,
} from '../database';
import apiService from './api.service';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue, TaxCategorie, TaxType } from '../types';

class SyncService {
  private isSyncing = false;

  // Vérifier la connectivité réseau
  async isOnline(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return networkState.isConnected === true && networkState.isInternetReachable === true;
    } catch {
      return false;
    }
  }

  // Vérifier si l'utilisateur est bloqué (is_active === false)
  async checkUserBlocked(): Promise<{ isBlocked: boolean; reason?: string }> {
    try {
      const { isActive, user } = await apiService.checkUserStatus();
      console.log('🔍 checkUserBlocked - isActive:', isActive, '| user:', user?.fullname);
      
      if (!isActive) {
        console.log('🚫 Utilisateur bloqué détecté:', user?.fullname);
        return { isBlocked: true, reason: 'Votre compte a été désactivé' };
      }
      return { isBlocked: false };
    } catch (error) {
      console.log('Erreur vérification statut - considéré comme non-bloqué:', error);
      return { isBlocked: false };
    }
  }

  // Synchroniser les données de référence (catégories et types de taxes)
  async syncReferenceData(): Promise<{ success: boolean; error?: string; userBlocked?: boolean }> {
    try {
      const online = await this.isOnline();
      if (!online) {
        return { success: false, error: 'Pas de connexion Internet' };
      }

      const profile = await getLocalProfile();
      if (!profile) {
        return { success: false, error: 'Non authentifié' };
      }

      // S'assurer que le token est chargé dans le service API
      if (profile.token) {
        apiService.setToken(profile.token);
      }

      // Vérification rapide du statut utilisateur
      const blockStatus = await this.checkUserBlocked();
      if (blockStatus.isBlocked) {
        apiService.notifyUserBlocked(blockStatus.reason);
        return { success: false, error: blockStatus.reason, userBlocked: true };
      }

      // Récupérer les catégories
      const categories = await apiService.getTaxCategories();
      const localCategories: LocalTaxCategorie[] = categories.map((cat: TaxCategorie) => ({
        tax_categorie_id: cat.id,
        service_id: cat.service_id,
        label: cat.label,
        is_active: cat.is_active ? 1 : 0,
        created_at: cat.created_at,
        updated_at: cat.updated_at,
      }));
      await saveTaxCategories(localCategories);

      // Récupérer les types de taxes
      const types = await apiService.getTaxTypes();
      const localTypes: LocalTaxType[] = types.map((type: TaxType) => ({
        tax_type_id: type.id,
        tax_categorie_id: type.tax_categorie_id,
        service_id: type.service_id,
        label: type.label,
        amount: type.amount,
        min_amount: type.min_amount,
        max_amount: type.max_amount,
        require_chassis_number: type.require_chassis_number ? 1 : 0,
        require_color: type.require_color ? 1 : 0,
        sort_order: type.sort_order,
        is_active: type.is_active ? 1 : 0,
        created_at: type.created_at,
        updated_at: type.updated_at,
      }));
      await saveTaxTypes(localTypes);

      await setSyncState('last_reference_sync', new Date().toISOString());

      return { success: true };
    } catch (error: any) {
      console.error('Erreur sync reference data:', error);
      return { success: false, error: error.message || 'Erreur de synchronisation' };
    }
  }

  // Synchroniser les paiements en attente vers le serveur
  async syncPendingPayments(): Promise<{ synced: number; failed: number; errors: string[]; userBlocked?: boolean }> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0, errors: ['Synchronisation déjà en cours'] };
    }

    this.isSyncing = true;
    const result = { synced: 0, failed: 0, errors: [] as string[], userBlocked: false };

    try {
      const online = await this.isOnline();
      if (!online) {
        result.errors.push('Pas de connexion Internet');
        return result;
      }

      // S'assurer que le token est chargé
      const profile = await getLocalProfile();
      if (profile?.token) {
        apiService.setToken(profile.token);
      } else {
        result.errors.push('Non authentifié');
        return result;
      }

      // Vérification rapide du statut utilisateur
      const blockStatus = await this.checkUserBlocked();
      if (blockStatus.isBlocked) {
        apiService.notifyUserBlocked(blockStatus.reason);
        result.errors.push(blockStatus.reason || 'Compte bloqué');
        result.userBlocked = true;
        return result;
      }

      const pendingPayments = await getPendingPayments();

      for (const payment of pendingPayments) {
        try {
          // Debug: vérifier que qr_signature est bien présent
          console.log('Payment from DB - qr_signature:', payment.qr_signature);
          
          // Préparer les données selon le format attendu par l'API
          const paymentData = {
            uuid: payment.local_uuid,
            payer_name: payment.payer_name,
            payer_phone: payment.payer_phone || null,
            service_id: payment.service_id,
            tax_categorie_id: payment.tax_categorie_id,
            tax_type_id: payment.tax_type_id,
            quantity: payment.quantity,
            unit_price: payment.unit_price,
            total_amount: payment.total_amount,
            chassis_number: payment.chassis_number || null,
            vehicle_color: payment.vehicle_color || null,
            paid_at: payment.paid_at,
            user_id: payment.user_id,
            terminal_id: payment.terminal_id,
            qr_signature: payment.qr_signature,
          };
          
          console.log('Envoi paiement au serveur:', JSON.stringify(paymentData, null, 2));
          
          const serverPayment = await apiService.createPayment(paymentData);

          await updatePaymentStatus(
            payment.local_uuid,
            'SYNCED',
            serverPayment.receipt_no,
            serverPayment.id
          );
          result.synced++;
        } catch (error: any) {
          console.error(`Erreur sync paiement ${payment.local_uuid}:`, error);
          
          // Log détaillé de l'erreur
          if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Détails erreur serveur:', JSON.stringify(error.response.data, null, 2));
            
            // Vérifier si c'est une 403 avec force_logout (utilisateur bloqué)
            if (error.response.status === 403 && error.response.data?.force_logout === true) {
              console.log('🚫 Utilisateur bloqué détecté pendant syncPendingPayments - arrêt immédiat');
              result.userBlocked = true;
              result.errors.push(error.response.data?.message || 'Compte bloqué');
              // Arrêter la boucle immédiatement
              break;
            }
          }
          
          // Vérifier si le paiement existe déjà sur le serveur (UUID déjà utilisé)
          const existingPayment = await apiService.getPaymentByUuid(payment.local_uuid);
          if (existingPayment) {
            await updatePaymentStatus(
              payment.local_uuid,
              'SYNCED',
              existingPayment.receipt_no,
              existingPayment.id
            );
            result.synced++;
          } else {
            await updatePaymentStatus(payment.local_uuid, 'FAILED');
            result.failed++;
            result.errors.push(`Paiement ${payment.local_uuid}: ${error.message}`);
          }
        }
      }

      if (result.synced > 0) {
        await setSyncState('last_payments_sync', new Date().toISOString());
      }

      return result;
    } finally {
      this.isSyncing = false;
    }
  }

  // Effectuer une synchronisation complète
  async fullSync(): Promise<{ reference: boolean; payments: { synced: number; failed: number } }> {
    const referenceResult = await this.syncReferenceData();
    const paymentsResult = await this.syncPendingPayments();

    return {
      reference: referenceResult.success,
      payments: {
        synced: paymentsResult.synced,
        failed: paymentsResult.failed,
      },
    };
  }

  // Générer un UUID pour les paiements locaux
  generatePaymentUuid(): string {
    return uuidv4();
  }

  // Générer une signature QR pour un paiement
  generateQrSignature(payment: Partial<LocalPaymentQueue>): string {
    const data = `${payment.local_uuid}|${payment.total_amount}|${payment.paid_at}|${payment.user_id}`;
    // En production, utiliser une vraie signature cryptographique
    return Buffer.from(data).toString('base64');
  }

  // Obtenir le dernier timestamp de synchronisation
  async getLastSyncTime(type: 'reference' | 'payments'): Promise<string | null> {
    const key = type === 'reference' ? 'last_reference_sync' : 'last_payments_sync';
    return await getSyncState(key);
  }
}

export const syncService = new SyncService();
export default syncService;
