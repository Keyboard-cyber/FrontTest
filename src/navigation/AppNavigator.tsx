import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSync } from '../contexts';
import {
  LoginScreen,
  HomeScreen,
  NewPaymentScreen,
  HistoryScreen,
  ReceiptScreen,
  ProfileScreen,
} from '../screens';
import { View, Text, StyleSheet } from 'react-native';

// Types de navigation
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  NewPayment: undefined;
  Receipt: { paymentUuid: string };
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab Navigator (écrans principaux)
const MainTabNavigator: React.FC = () => {
  const { pendingCount } = useSync();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#1a73e8',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ 
          tabBarLabel: 'Accueil',
        }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ 
          tabBarLabel: 'Historique',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          headerShown: true,
          headerTitle: 'Historique des paiements',
          headerStyle: {
            backgroundColor: '#1a73e8',
          },
          headerTintColor: '#fff',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ 
          tabBarLabel: 'Profil',
        }}
      />
    </Tab.Navigator>
  );
};

// Stack Navigator principal
export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Écran de chargement
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Taxe Mobile Agent</Text>
        <Text style={styles.loadingSubtext}>Chargement...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen 
            name="NewPayment" 
            component={NewPaymentScreen}
            options={{
              headerShown: true,
              headerTitle: 'Nouveau paiement',
              headerStyle: {
                backgroundColor: '#1a73e8',
              },
              headerTintColor: '#fff',
              presentation: 'modal',
            }}
          />
          <Stack.Screen 
            name="Receipt" 
            component={ReceiptScreen}
            options={{
              headerShown: true,
              headerTitle: 'Reçu',
              headerStyle: {
                backgroundColor: '#1a73e8',
              },
              headerTintColor: '#fff',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a73e8',
  },
  loadingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginTop: 10,
  },
});
