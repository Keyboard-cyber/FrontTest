import { useSync, usePayment } from '../contexts';

/**
 * Hook personnalisé qui intègre la synchronisation avec les mises à jour d'historique
 */
export const useSyncWithPaymentUpdates = () => {
  const sync = useSync();
  const { triggerPaymentUpdate } = usePayment();

  // Wrapper pour déclencher les mises à jour UI après la synchro
  const syncPaymentsWithUpdate = async () => {
    const result = await sync.syncPayments();
    // Déclencher une mise à jour de l'historique
    triggerPaymentUpdate();
    return result;
  };

  const syncAllWithUpdate = async () => {
    await sync.syncAll();
    // Déclencher une mise à jour de l'historique
    triggerPaymentUpdate();
  };

  return {
    ...sync,
    syncPayments: syncPaymentsWithUpdate,
    syncAll: syncAllWithUpdate,
  };
};
