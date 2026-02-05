import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts';

export default function Index() {
  const { isAuthenticated, isLoading, userRole } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Smart Taxe</Text>
        <ActivityIndicator size="large" color="#fff" style={styles.loader} />
        <Text style={styles.subtitle}>Chargement...</Text>
      </View>
    );
  }

  if (isAuthenticated) {
    // Rediriger selon le rôle de l'utilisateur
    if (userRole === 'controleur') {
      return <Redirect href={'/(controller)/scan' as any} />;
    }
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a73e8',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
    marginTop: 10,
  },
  loader: {
    marginTop: 20,
  },
});
