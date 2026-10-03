import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Alert } from 'react-native';
import { syncService } from '../services';
import { notificationService } from '../services/notification.service';
import { 
  getPendingPayments, 
  getTaxCategories, 
  getTaxTypes,
  getPaymentByUuid,
} from '../database';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue } from '../types';
import { useAuth } from './AuthContext';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  categories: LocalTaxCategorie[];
  taxTypes: LocalTaxType[];
  syncAll: () => Promise<void>;
  syncPayments: () => Promise<{ synced: number; failed: number; errors: string[] }>;
  refreshData: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const useSync = (): SyncContextType => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};

interface SyncProviderProps {
  children: ReactNode;
}

export const SyncProvider: React.FC<SyncProviderProps> = ({ children }) => {
  const { isAuthenticated, profile, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [categories, setCategories] = useState<LocalTaxCategorie[]>([]);
  const [taxTypes, setTaxTypes] = useState<LocalTaxType[]>([]);
  const userBlockedRef = useRef(false);

  // Fonction pour gérer le blocage utilisateur
  const handleUserBlocked = useCallback(async (reason?: string) => {
    if (userBlockedRef.current) return; // Éviter les appels multiples
    userBlockedRef.current = true;
    
    console.log('🚫 Utilisateur bloqué détecté pendant la synchronisation');
    Alert.alert(
      'Compte désactivé',
      reason || 'Votre compte a été désactivé. Vous allez être déconnecté.',
      [{ text: 'OK', onPress: () => logout() }]
    );
  }, [logout]);

  // Réinitialiser le flag de blocage quand l'utilisateur se reconnecte
  useEffect(() => {
    if (isAuthenticated) {
      userBlockedRef.current = false;
    }
  }, [isAuthenticated]);

  // Vérifier la connectivité périodiquement
  useEffect(() => {
    const checkConnectivity = async () => {
      const online = await syncService.isOnline();
      setIsOnline(online);
    };

    checkConnectivity();
    const interval = setInterval(checkConnectivity, 30000); // Toutes les 30 secondes

    return () => clearInterval(interval);
  }, []);

  // Charger les données initiales
  useEffect(() => {
    if (isAuthenticated && profile) {
      refreshData();
    }
  }, [isAuthenticated, profile]);

  // Synchronisation automatique des paiements en attente quand en ligne
  useEffect(() => {
    if (isAuthenticated && isOnline && pendingCount > 0 && !isSyncing && !userBlockedRef.current) {
      console.log('Synchronisation automatique - paiements en attente:', pendingCount);
      syncPayments();
    }
  }, [isOnline, isAuthenticated, pendingCount]);

  // Synchronisation périodique toutes les 60 secondes si des paiements sont en attente
  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;

    const syncInterval = setInterval(async () => {
      if (userBlockedRef.current) {
        console.log('Sync périodique annulée - utilisateur bloqué');
        return;
      }
      const pending = await getPendingPayments(profile?.user_id);
      if (pending.length > 0 && !isSyncing) {
        console.log('Sync périodique - paiements en attente:', pending.length);
        syncPayments();
      }
    }, 60000); // Toutes les 60 secondes

    return () => clearInterval(syncInterval);
  }, [isAuthenticated, isOnline, isSyncing]);

  const refreshData = useCallback(async () => {
    try {
      // Charger les catégories et types depuis la base locale
      const cats = await getTaxCategories(profile?.service_id);
      setCategories(cats);

      const types = await getTaxTypes();
      setTaxTypes(types);

      // Compter les paiements en attente (agent courant uniquement : sinon
      // pendingCount reste > 0 à cause des paiements d'un autre compte et
      // la sync automatique se redéclenche en boucle)
      const pending = await getPendingPayments(profile?.user_id);
      setPendingCount(pending.length);

      // Récupérer le dernier timestamp de sync
      const lastSync = await syncService.getLastSyncTime('payments');
      setLastSyncTime(lastSync);
    } catch (error) {
      console.error('Erreur refresh data:', error);
    }
  }, [profile]);

  const syncAll = useCallback(async () => {
    if (isSyncing || userBlockedRef.current) return;

    setIsSyncing(true);
    try {
      // Synchroniser les données de référence
      const refResult = await syncService.syncReferenceData();
      if (refResult.userBlocked) {
        handleUserBlocked(refResult.error);
        return;
      }
      
      // Synchroniser les paiements
      const payResult = await syncService.syncPendingPayments();
      if (payResult.userBlocked) {
        handleUserBlocked(payResult.errors[0]);
        return;
      }
      
      // Rafraîchir les données locales
      await refreshData();
    } catch (error) {
      console.error('Erreur sync all:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshData, handleUserBlocked]);

  const syncPayments = useCallback(async (): Promise<{ synced: number; failed: number; errors: string[] }> => {
    if (isSyncing || userBlockedRef.current) return { synced: 0, failed: 0, errors: [] };

    setIsSyncing(true);
    try {
      const result = await syncService.syncPendingPayments();

      // Vérifier si l'utilisateur est bloqué
      if (result.userBlocked) {
        handleUserBlocked(result.errors[0]);
        return { synced: 0, failed: 0, errors: result.errors };
      }

      await refreshData();

      // Notifications
      if (result.synced > 0) {
        await notificationService.notifySyncComplete(result.synced);
      }
      if (result.failed > 0) {
        await notificationService.notifySyncError(result.failed);
      }

      // Les erreurs restaient dans result.errors sans jamais être lues :
      // l'utilisateur voyait sa file vide sans aucune explication.
      if (result.errors.length > 0) {
        Alert.alert(
          'Synchronisation incomplète',
          result.errors.slice(0, 3).join('\n\n') +
            (result.errors.length > 3 ? `\n\n+${result.errors.length - 3} autre(s)` : '')
        );
      }

      return { synced: result.synced, failed: result.failed, errors: result.errors };
    } catch (error) {
      console.error('Erreur sync payments:', error);
      return { synced: 0, failed: 0, errors: [String(error)] };
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshData, handleUserBlocked]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncTime,
        categories,
        taxTypes,
        syncAll,
        syncPayments,
        refreshData,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};
