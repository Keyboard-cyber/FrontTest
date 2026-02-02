import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSync } from '../../contexts';

export const ProfileScreen: React.FC = () => {
  const { profile, user, logout } = useAuth();
  const { isOnline, isSyncing, pendingCount, lastSyncTime, syncAll } = useSync();

  const handleLogout = () => {
    if (pendingCount > 0) {
      Alert.alert(
        'Paiements en attente',
        `Vous avez ${pendingCount} paiement(s) non synchronisé(s). Ils seront perdus si vous vous déconnectez sans synchroniser.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Synchroniser d\'abord',
            onPress: syncAll,
          },
          {
            text: 'Déconnecter quand même',
            style: 'destructive',
            onPress: logout,
          },
        ]
      );
    } else {
      Alert.alert(
        'Déconnexion',
        'Êtes-vous sûr de vouloir vous déconnecter ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnecter', style: 'destructive', onPress: logout },
        ]
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.fullname?.charAt(0).toUpperCase() || 'A'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.fullname}</Text>
        <Text style={styles.uid}>ID: {profile?.user_uid}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>Agent</Text>
        </View>
      </View>

      {/* Info cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={20} color="#666" />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={20} color="#666" />
            <Text style={styles.infoLabel}>Téléphone</Text>
            <Text style={styles.infoValue}>{user?.phone || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#666" />
            <Text style={styles.infoLabel}>Zone</Text>
            <Text style={styles.infoValue}>{profile?.zone || 'Non définie'}</Text>
          </View>
        </View>
      </View>

      {/* Sync status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Synchronisation</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons 
              name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'} 
              size={20} 
              color={isOnline ? '#34a853' : '#ea4335'} 
            />
            <Text style={styles.infoLabel}>Statut</Text>
            <Text style={[styles.infoValue, { color: isOnline ? '#34a853' : '#ea4335' }]}>
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color="#666" />
            <Text style={styles.infoLabel}>Dernière sync</Text>
            <Text style={styles.infoValue}>{formatDate(lastSyncTime)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="hourglass-outline" size={20} color="#f9ab00" />
            <Text style={styles.infoLabel}>En attente</Text>
            <Text style={[styles.infoValue, pendingCount > 0 && { color: '#f9ab00' }]}>
              {pendingCount} paiement(s)
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
          onPress={syncAll}
          disabled={isSyncing}
        >
          <Ionicons name="sync" size={20} color="#fff" />
          <Text style={styles.syncButtonText}>
            {isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* App info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Application</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color="#666" />
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#ea4335" />
        <Text style={styles.logoutButtonText}>Se déconnecter</Text>
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    padding: 30,
    paddingTop: 50,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  uid: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginTop: 5,
  },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 15,
    marginTop: 10,
  },
  roleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
  },
  buttonDisabled: {
    backgroundColor: '#a0c4f1',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ea4335',
  },
  logoutButtonText: {
    color: '#ea4335',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  bottomSpacer: {
    height: 40,
  },
});
