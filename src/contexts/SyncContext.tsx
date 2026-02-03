import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  syncPayments: () => Promise<{ synced: number; failed: number }>;
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
  const { isAuthenticated, profile } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [categories, setCategories] = useState<LocalTaxCategorie[]>([]);
  const [taxTypes, setTaxTypes] = useState<LocalTaxType[]>([]);

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
    if (isAuthenticated && isOnline && pendingCount > 0 && !isSyncing) {
      console.log('Synchronisation automatique - paiements en attente:', pendingCount);
      syncPayments();
    }
  }, [isOnline, isAuthenticated, pendingCount]);

  // Synchronisation périodique toutes les 60 secondes si des paiements sont en attente
  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;

    const syncInterval = setInterval(async () => {
      const pending = await getPendingPayments();
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

      // Compter les paiements en attente
      const pending = await getPendingPayments();
      setPendingCount(pending.length);

      // Récupérer le dernier timestamp de sync
      const lastSync = await syncService.getLastSyncTime('payments');
      setLastSyncTime(lastSync);
    } catch (error) {
      console.error('Erreur refresh data:', error);
    }
  }, [profile]);

  const syncAll = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      // Synchroniser les données de référence
      await syncService.syncReferenceData();
      
      // Synchroniser les paiements
      await syncService.syncPendingPayments();
      
      // Rafraîchir les données locales
      await refreshData();
    } catch (error) {
      console.error('Erreur sync all:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshData]);

  const syncPayments = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (isSyncing) return { synced: 0, failed: 0 };

    setIsSyncing(true);
    try {
      const result = await syncService.syncPendingPayments();
      await refreshData();
      
      // Notifications
      if (result.synced > 0) {
        await notificationService.notifySyncComplete(result.synced);
      }
      if (result.failed > 0) {
        await notificationService.notifySyncError(result.failed);
      }
      
      return { synced: result.synced, failed: result.failed };
    } catch (error) {
      console.error('Erreur sync payments:', error);
      return { synced: 0, failed: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshData]);

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
