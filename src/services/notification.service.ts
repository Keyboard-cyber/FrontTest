import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Vérifier si on est dans Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Import dynamique de expo-notifications (seulement si pas dans Expo Go)
let Notifications: typeof import('expo-notifications') | null = null;

// Initialiser les notifications seulement si pas dans Expo Go
const initNotificationsModule = async () => {
  if (!isExpoGo && !Notifications) {
    Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return Notifications;
};

export type NotificationType = 
  | 'payment_success'
  | 'sync_complete'
  | 'sync_error'
  | 'offline_warning'
  | 'pending_payments'
  | 'daily_summary';

interface NotificationConfig {
  title: string;
  body: string;
  data?: Record<string, any>;
}

class NotificationService {
  private initialized = false;
  private expoPushToken: string | null = null;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    // Désactiver les notifications dans Expo Go (SDK 53+)
    if (isExpoGo) {
      console.log('📵 Notifications push désactivées dans Expo Go (SDK 53+)');
      this.initialized = true;
      return true;
    }

    try {
      const NotificationsModule = await initNotificationsModule();
      if (!NotificationsModule) return false;

      // Vérifier si c'est un appareil physique
      if (!Device.isDevice) {
        console.log('Notifications non disponibles sur émulateur');
        return false;
      }

      // Demander les permissions
      const { status: existingStatus } = await NotificationsModule.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await NotificationsModule.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Permission de notification refusée');
        return false;
      }

      // Configuration Android
      if (Platform.OS === 'android') {
        await NotificationsModule.setNotificationChannelAsync('default', {
          name: 'Notifications',
          importance: NotificationsModule.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#7B61FF',
        });

        await NotificationsModule.setNotificationChannelAsync('payments', {
          name: 'Paiements',
          importance: NotificationsModule.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00C896',
        });

        await NotificationsModule.setNotificationChannelAsync('sync', {
          name: 'Synchronisation',
          importance: NotificationsModule.AndroidImportance.DEFAULT,
          lightColor: '#00B4D8',
        });
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Erreur initialisation notifications:', error);
      return false;
    }
  }

  // Obtenir le token push (pour notifications serveur)
  async getPushToken(): Promise<string | null> {
    if (isExpoGo) return null;
    if (this.expoPushToken) return this.expoPushToken;

    try {
      const NotificationsModule = await initNotificationsModule();
      if (!NotificationsModule) return null;
      
      const token = await NotificationsModule.getExpoPushTokenAsync({
        projectId: '0eb00763-82e5-402a-9d92-eb8f36a77cdd',
      });
      this.expoPushToken = token.data;
      return this.expoPushToken;
    } catch (error) {
      console.error('Erreur obtention push token:', error);
      return null;
    }
  }

  // Envoyer une notification locale
  async sendLocalNotification(
    type: NotificationType,
    customConfig?: Partial<NotificationConfig>
  ): Promise<string | null> {
    if (isExpoGo) return null;
    
    await this.initialize();
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return null;

    const config = this.getNotificationConfig(type, customConfig);
    
    try {
      const id = await NotificationsModule.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { type, ...config.data },
          sound: true,
        },
        trigger: null,
      });
      return id;
    } catch (error) {
      console.error('Erreur envoi notification:', error);
      return null;
    }
  }

  // Notification paiement réussi
  async notifyPaymentSuccess(amount: number, payerName: string): Promise<void> {
    if (isExpoGo) return;
    const formattedAmount = amount.toLocaleString('fr-FR') + ' FC';
    await this.sendLocalNotification('payment_success', {
      body: `Paiement de ${formattedAmount} reçu de ${payerName}`,
      data: { amount, payerName },
    });
  }

  // Notification sync terminée
  async notifySyncComplete(count: number): Promise<void> {
    if (isExpoGo || count === 0) return;
    await this.sendLocalNotification('sync_complete', {
      body: `${count} paiement(s) synchronisé(s) avec succès`,
      data: { count },
    });
  }

  // Notification erreur sync
  async notifySyncError(failedCount: number): Promise<void> {
    if (isExpoGo) return;
    await this.sendLocalNotification('sync_error', {
      body: `Échec de synchronisation de ${failedCount} paiement(s)`,
      data: { failedCount },
    });
  }

  // Notification hors ligne
  async notifyOfflineWarning(): Promise<void> {
    if (isExpoGo) return;
    await this.sendLocalNotification('offline_warning');
  }

  // Notification paiements en attente
  async notifyPendingPayments(count: number): Promise<void> {
    if (isExpoGo || count === 0) return;
    await this.sendLocalNotification('pending_payments', {
      body: `${count} paiement(s) en attente de synchronisation`,
      data: { count },
    });
  }

  // Notification résumé journalier
  async notifyDailySummary(totalAmount: number, count: number): Promise<void> {
    if (isExpoGo) return;
    const formattedAmount = totalAmount.toLocaleString('fr-FR') + ' FC';
    await this.sendLocalNotification('daily_summary', {
      body: `${count} paiement(s) - Total: ${formattedAmount}`,
      data: { totalAmount, count },
    });
  }

  // Planifier une notification
  async scheduleNotification(
    type: NotificationType,
    triggerDate: Date,
    customConfig?: Partial<NotificationConfig>
  ): Promise<string | null> {
    if (isExpoGo) return null;
    
    await this.initialize();
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return null;

    const config = this.getNotificationConfig(type, customConfig);
    
    try {
      const id = await NotificationsModule.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { type, ...config.data },
          sound: true,
        },
        trigger: {
          type: NotificationsModule.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      return id;
    } catch (error) {
      console.error('Erreur planification notification:', error);
      return null;
    }
  }

  // Planifier rappel quotidien
  async scheduleDailyReminder(hour: number = 18, minute: number = 0): Promise<string | null> {
    if (isExpoGo) return null;
    
    await this.initialize();
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return null;
    
    try {
      await this.cancelAllScheduledNotifications();
      
      const id = await NotificationsModule.scheduleNotificationAsync({
        content: {
          title: '📊 Rappel quotidien',
          body: 'N\'oubliez pas de synchroniser vos paiements',
          sound: true,
        },
        trigger: {
          type: NotificationsModule.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });
      return id;
    } catch (error) {
      console.error('Erreur planification rappel:', error);
      return null;
    }
  }

  // Annuler une notification
  async cancelNotification(id: string): Promise<void> {
    if (isExpoGo) return;
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return;
    await NotificationsModule.cancelScheduledNotificationAsync(id);
  }

  // Annuler toutes les notifications planifiées
  async cancelAllScheduledNotifications(): Promise<void> {
    if (isExpoGo) return;
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return;
    await NotificationsModule.cancelAllScheduledNotificationsAsync();
  }

  // Effacer le badge
  async clearBadge(): Promise<void> {
    if (isExpoGo) return;
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return;
    await NotificationsModule.setBadgeCountAsync(0);
  }

  // Définir le badge
  async setBadge(count: number): Promise<void> {
    if (isExpoGo) return;
    const NotificationsModule = await initNotificationsModule();
    if (!NotificationsModule) return;
    await NotificationsModule.setBadgeCountAsync(count);
  }

  // Configurations par défaut
  private getNotificationConfig(
    type: NotificationType,
    custom?: Partial<NotificationConfig>
  ): NotificationConfig {
    const configs: Record<NotificationType, NotificationConfig> = {
      payment_success: {
        title: '✅ Paiement enregistré',
        body: 'Un nouveau paiement a été enregistré',
      },
      sync_complete: {
        title: '🔄 Synchronisation terminée',
        body: 'Vos paiements ont été synchronisés',
      },
      sync_error: {
        title: '❌ Erreur de synchronisation',
        body: 'Certains paiements n\'ont pas pu être synchronisés',
      },
      offline_warning: {
        title: '📴 Mode hors ligne',
        body: 'Vous êtes actuellement hors ligne. Les paiements seront synchronisés ultérieurement.',
      },
      pending_payments: {
        title: '⏳ Paiements en attente',
        body: 'Des paiements sont en attente de synchronisation',
      },
      daily_summary: {
        title: '📈 Résumé du jour',
        body: 'Consultez votre résumé de collecte',
      },
    };

    return {
      ...configs[type],
      ...custom,
    };
  }

  // Écouter les notifications reçues
  addNotificationReceivedListener(callback: (notification: any) => void): { remove: () => void } {
    if (isExpoGo) return { remove: () => {} };
    
    initNotificationsModule().then(NotificationsModule => {
      if (NotificationsModule) {
        NotificationsModule.addNotificationReceivedListener(callback);
      }
    });
    return { remove: () => {} };
  }

  // Écouter les clics sur notification
  addNotificationResponseListener(callback: (response: any) => void): { remove: () => void } {
    if (isExpoGo) return { remove: () => {} };
    
    initNotificationsModule().then(NotificationsModule => {
      if (NotificationsModule) {
        NotificationsModule.addNotificationResponseReceivedListener(callback);
      }
    });
    return { remove: () => {} };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
