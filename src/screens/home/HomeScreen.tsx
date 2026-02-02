import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSync } from '../../contexts';
import { getTodayPaymentsStats } from '../../database';

interface Props {
  navigation: any;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { profile, user } = useAuth();
  const { isOnline, isSyncing, pendingCount, syncAll, refreshData } = useSync();
  const [stats, setStats] = useState({ count: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    if (profile) {
      const todayStats = await getTodayPaymentsStats(profile.user_id);
      setStats(todayStats);
    }
  };

  useEffect(() => {
    loadStats();
  }, [profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    await loadStats();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header avec status */}
      <View style={styles.header}>
        <View style={styles.statusBar}>
          <View style={[styles.statusIndicator, isOnline ? styles.online : styles.offline]} />
          <Text style={styles.statusText}>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{pendingCount} en attente</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.greeting}>Bonjour,</Text>
        <Text style={styles.userName}>{profile?.fullname || 'Agent'}</Text>
        <Text style={styles.userId}>ID: {profile?.user_uid}</Text>
      </View>

      {/* Statistiques du jour */}
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>Aujourd'hui</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="receipt-outline" size={28} color="#1a73e8" />
            <Text style={styles.statValue}>{stats.count}</Text>
            <Text style={styles.statLabel}>Paiements</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={28} color="#34a853" />
            <Text style={styles.statValue}>{formatCurrency(stats.total)}</Text>
            <Text style={styles.statLabel}>Collectés</Text>
          </View>
        </View>
      </View>

      {/* Actions rapides */}
      <View style={styles.actionsContainer}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('NewPayment')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#e8f0fe' }]}>
            <Ionicons name="add-circle" size={28} color="#1a73e8" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Nouveau paiement</Text>
            <Text style={styles.actionSubtitle}>Enregistrer un paiement de taxe</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('History')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#e6f4ea' }]}>
            <Ionicons name="list" size={28} color="#34a853" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Historique</Text>
            <Text style={styles.actionSubtitle}>Voir tous les paiements</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={syncAll}
          disabled={isSyncing}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fef7e0' }]}>
            <Ionicons 
              name={isSyncing ? 'sync' : 'cloud-upload'} 
              size={28} 
              color="#f9ab00" 
            />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Synchroniser</Text>
            <Text style={styles.actionSubtitle}>
              {isSyncing ? 'Synchronisation...' : `${pendingCount} paiement(s) en attente`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#ccc" />
        </TouchableOpacity>
      </View>
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
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  online: {
    backgroundColor: '#34a853',
  },
  offline: {
    backgroundColor: '#ea4335',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
  },
  pendingBadge: {
    backgroundColor: '#f9ab00',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  pendingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  greeting: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.9,
  },
  userName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  userId: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
    marginTop: 4,
  },
  statsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  actionsContainer: {
    padding: 20,
    paddingTop: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
    marginLeft: 15,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});
