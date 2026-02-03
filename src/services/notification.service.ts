import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

    try {
      // Vérifier si c'est un appareil physique
      if (!Device.isDevice) {
        console.log('Notifications non disponibles sur émulateur');
        return false;
      }

      // Demander les permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Permission de notification refusée');
        return false;
      }

      // Configuration Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#7B61FF',
        });

        await Notifications.setNotificationChannelAsync('payments', {
          name: 'Paiements',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00C896',
        });

        await Notifications.setNotificationChannelAsync('sync', {
          name: 'Synchronisation',
          importance: Notifications.AndroidImportance.DEFAULT,
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
    if (this.expoPushToken) return this.expoPushToken;

    try {
      const token = await Notifications.getExpoPushTokenAsync({
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
    await this.initialize();

    const config = this.getNotificationConfig(type, customConfig);
    
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { type, ...config.data },
          sound: true,
        },
        trigger: null, // Immédiat
      });
      return id;
    } catch (error) {
      console.error('Erreur envoi notification:', error);
      return null;
    }
  }

  // Notification paiement réussi
  async notifyPaymentSuccess(amount: number, payerName: string): Promise<void> {
    const formattedAmount = amount.toLocaleString('fr-FR') + ' FC';
    await this.sendLocalNotification('payment_success', {
      body: `Paiement de ${formattedAmount} reçu de ${payerName}`,
      data: { amount, payerName },
    });
  }

  // Notification sync terminée
  async notifySyncComplete(count: number): Promise<void> {
    if (count === 0) return;
    await this.sendLocalNotification('sync_complete', {
      body: `${count} paiement(s) synchronisé(s) avec succès`,
      data: { count },
    });
  }

  // Notification erreur sync
  async notifySyncError(failedCount: number): Promise<void> {
    await this.sendLocalNotification('sync_error', {
      body: `Échec de synchronisation de ${failedCount} paiement(s)`,
      data: { failedCount },
    });
  }

  // Notification hors ligne
  async notifyOfflineWarning(): Promise<void> {
    await this.sendLocalNotification('offline_warning');
  }

  // Notification paiements en attente
  async notifyPendingPayments(count: number): Promise<void> {
    if (count === 0) return;
    await this.sendLocalNotification('pending_payments', {
      body: `${count} paiement(s) en attente de synchronisation`,
      data: { count },
    });
  }

  // Notification résumé journalier
  async notifyDailySummary(totalAmount: number, count: number): Promise<void> {
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
    await this.initialize();

    const config = this.getNotificationConfig(type, customConfig);
    
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { type, ...config.data },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
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
    await this.initialize();
    
    try {
      // Annuler les anciens rappels
      await this.cancelAllScheduledNotifications();
      
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📊 Rappel quotidien',
          body: 'N\'oubliez pas de synchroniser vos paiements',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
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
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  // Annuler toutes les notifications planifiées
  async cancelAllScheduledNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // Effacer le badge
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  // Définir le badge
  async setBadge(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
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
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  // Écouter les clics sur notification
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export const notificationService = new NotificationService();
export default notificationService;
