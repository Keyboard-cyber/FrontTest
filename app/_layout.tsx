import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, SyncProvider, PaymentProvider } from '../src/contexts';
import { Colors } from '../src/theme';
import { notificationService } from '../src/services/notification.service';

export default function RootLayout() {
  // Initialiser les notifications au démarrage
  useEffect(() => {
    const initNotifications = async () => {
      await notificationService.initialize();
      // Planifier le rappel quotidien à 18h
      await notificationService.scheduleDailyReminder(18, 0);
    };
    initNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <PaymentProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: Colors.backgroundSecondary,
                },
                headerTintColor: Colors.textPrimary,
                headerTitleStyle: {
                  fontWeight: '600',
                },
                contentStyle: {
                  backgroundColor: Colors.background,
                },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen 
                name="payment/new" 
                options={{ 
                  title: 'Nouveau paiement',
                  presentation: 'modal',
                  headerStyle: {
                    backgroundColor: Colors.backgroundSecondary,
                  },
                }} 
              />
              <Stack.Screen 
                name="payment/receipt/[uuid]" 
                options={{ 
                  title: 'Reçu',
                  headerStyle: {
                    backgroundColor: Colors.backgroundSecondary,
                  },
                }} 
              />
              <Stack.Screen 
                name="(controller)" 
                options={{ 
                  headerShown: false,
                }} 
              />
            </Stack>
          </PaymentProvider>
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
