import * as Network from 'expo-network';
import { v4 as uuidv4 } from 'uuid';
import {
  getLocalProfile,
  getPendingPayments,
  reassignPendingTerminal,
  getLocalTerminalForUser,
  updatePaymentStatus,
  saveTaxCategories,
  saveTaxTypes,
  setSyncState,
  getSyncState,
  getTaxTypeById,
} from '../database';
import apiService from './api.service';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue, TaxCategorie, TaxType } from '../types';

// Erreur de configuration : le terminal utilisé n'appartient pas à l'agent
const isTerminalError = (error: any): boolean => {
  const message = String(
    error?.response?.data?.message || error?.response?.data?.error || error?.message || ''
  ).toLowerCase();
  return message.includes('terminal');
};

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

      // Rattacher les paiements en attente au terminal réellement assigné
      if (profile?.user_id) {
        const terminal = await getLocalTerminalForUser(profile.user_id);
        if (!terminal) {
          result.errors.push(
            `Aucun terminal exploitable pour l'agent ${profile.user_id} (absent ou ambigu). Consultez les logs Metro.`
          );
        } else {
          console.log(
            `🖥️ Terminal local: ${terminal.terminal_id} | bloqué: ${Boolean(terminal.is_blocked)}`
          );
          if (!terminal.is_blocked) {
            const repaired = await reassignPendingTerminal(profile.user_id, terminal.terminal_id);
            if (repaired > 0) {
              console.log(
                `${repaired} paiement(s) en attente rattaché(s) au terminal ${terminal.terminal_id}`
              );
            }
          }
        }
      } else {
        result.errors.push('Profil local absent : agent_id inconnu, synchronisation ignorée');
        return result;
      }

      const pendingPayments = await getPendingPayments(profile?.user_id);
      if (pendingPayments.length > 0) {
        console.log(
          `📋 ${pendingPayments.length} paiement(s) en attente | terminal_id: ` +
            pendingPayments.map((p) => p.terminal_id).join(', ')
        );
      }

      // Séparer paiements normaux et tranches
      const normalPayments = pendingPayments.filter(p => !p.installment_group_id);
      const tranchePayments = pendingPayments.filter(p => !!p.installment_group_id);

      // === Sync paiements normaux ===
      for (const payment of normalPayments) {
        try {
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

          const serverPayment = await apiService.createPayment(paymentData);
          await updatePaymentStatus(payment.local_uuid, 'SYNCED', serverPayment.receipt_no, serverPayment.id, serverPayment.qr_signature);
          result.synced++;
        } catch (error: any) {
          if (error.response) {
            if (error.response.status === 403 && error.response.data?.force_logout) {
              console.error(`Erreur sync paiement ${payment.local_uuid}:`, error);
              result.userBlocked = true;
              result.errors.push(error.response.data?.message || 'Compte bloqué');
              break;
            }
          }
          const terminalError = isTerminalError(error);
          if (!terminalError) {
            console.error(`Erreur sync paiement ${payment.local_uuid}:`, error);
            if (error.response) {
              console.error('Détails:', JSON.stringify(error.response.data, null, 2));
            }
          }
          // Un terminal non assigné est un problème de configuration : le retry
          // et la recherche de doublon ne serviront à rien, et marquer le
          // paiement FAILED le retirerait définitivement de la file.
          // Erreur attendue et déjà signalée : pas de trace d'erreur bruyante
          if (isTerminalError(error)) {
            const detail =
              error.response?.data?.message || error.response?.data?.error || error.message;
            result.errors.push(`Terminal non assigné (id ${payment.terminal_id}). ${detail}`);
            // Laisser en PENDING pour retenter après résolution côté backend
            continue;
          }

          // Vérifier doublon
          const existing = await apiService.getPaymentByUuid(payment.local_uuid);
          if (existing) {
            await updatePaymentStatus(payment.local_uuid, 'SYNCED', existing.receipt_no, existing.id, existing.qr_signature);
            result.synced++;
          } else {
            await updatePaymentStatus(payment.local_uuid, 'FAILED');
            result.failed++;
            result.errors.push(`Paiement ${payment.local_uuid}: ${error.message}`);
          }
        }
      }

      // === Sync tranches ===
      if (tranchePayments.length > 0 && !result.userBlocked) {
        const groups = new Map<string, LocalPaymentQueue[]>();
        for (const p of tranchePayments) {
          const gid = p.installment_group_id!;
          if (!groups.has(gid)) groups.set(gid, []);
          groups.get(gid)!.push(p);
        }

        for (const [groupId, payments] of groups) {
          const first = payments[0];
          try {

            // Étape 1: Créer le dossier tranche sur le serveur (idempotent via installment_group_id)
            const taxType = await getTaxTypeById(first.tax_type_id);
            const tranche = await apiService.createTranche({
              installment_group_id: groupId,
              payer_name: first.payer_name,
              service_id: first.service_id,
              tax_category_id: first.tax_categorie_id,
              tax_type_id: first.tax_type_id,
              // Montant global du dossier : unitaire × quantité
              total_amount:
                (first.unit_price || 0) * (first.quantity || 1) ||
                taxType?.amount ||
                payments.reduce((sum, p) => sum + p.total_amount, 0),
              total_installments: first.installment_total,
              terminal_id: first.terminal_id,
            });

            console.log('Tranche créée, id:', tranche.id);

            // Étape 2: Payer chaque tranche via POST /tranches/{id}/pay
            for (const p of payments) {
              try {
                const sp = await apiService.payTranche(tranche.id, {
                  amount: p.total_amount,
                  terminal_id: p.terminal_id,
                  paid_at: p.paid_at,
                  local_uuid: p.local_uuid,
                  sync_status: 'OFFLINE_SYNCED',
                  installment_number: p.installment_number,
                  installment_total: p.installment_total,
                });
                await updatePaymentStatus(p.local_uuid, 'SYNCED', sp.receipt_no || tranche.reference, sp.id || tranche.id, sp.qr_signature);
                result.synced++;
              } catch (payError: any) {
                if (isTerminalError(payError)) {
                  const detail =
                    payError.response?.data?.message ||
                    payError.response?.data?.error ||
                    payError.message;
                  result.errors.push(`Terminal non assigné (id ${p.terminal_id}). ${detail}`);
                  // Rester en PENDING : l'idempotence du dossier est assurée
                  // par installment_group_id, on retentera après résolution
                  continue;
                }
                // Vérifier doublon
                const existing = await apiService.getPaymentByUuid(p.local_uuid);
                if (existing) {
                  await updatePaymentStatus(p.local_uuid, 'SYNCED', existing.receipt_no, existing.id, existing.qr_signature);
                  result.synced++;
                } else {
                  await updatePaymentStatus(p.local_uuid, 'FAILED');
                  result.failed++;
                  result.errors.push(`Paiement tranche ${p.local_uuid}: ${payError.message}`);
                }
              }
            }
          } catch (error: any) {
            console.error(`Erreur sync tranche ${groupId}:`, error);
            if (error.response) {
              console.error('Détails:', JSON.stringify(error.response.data, null, 2));
              if (error.response.status === 403 && error.response.data?.force_logout) {
                result.userBlocked = true;
                result.errors.push(error.response.data?.message || 'Compte bloqué');
                break;
              }
            }
            // Un terminal non assigné laisse le dossier et les tranches en PENDING
            if (isTerminalError(error)) {
              const detail =
                error.response?.data?.message || error.response?.data?.error || error.message;
              result.errors.push(`Terminal non assigné (id ${first.terminal_id}). ${detail}`);
            } else {
              const detail =
                error.response?.data?.message || error.response?.data?.error || error.message;
              for (const p of payments) {
                await updatePaymentStatus(p.local_uuid, 'FAILED');
                result.failed++;
              }
              result.errors.push(`Tranche ${groupId}: ${detail}`);
            }
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
