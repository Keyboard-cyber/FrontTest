import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getAllPayments, getTaxCategorieById, getTaxTypeById, getLocalTerminal } from '../../src/database';
import { syncService } from '../../src/services/sync.service';
import { printerService } from '../../src/services/printer.service';
import { useAuth } from '../../src/contexts/AuthContext';
import { LocalPaymentQueue } from '../../src/types';

// Type étendu avec labels pour l'affichage
interface Payment extends LocalPaymentQueue {
  uuid: string;
  sync_status: string;
  tax_type_label?: string;
  tax_categorie_label?: string;
}

// Types pour les filtres
type StatusFilter = 'ALL' | 'PENDING' | 'SYNCED' | 'FAILED';
type PeriodFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

// Interface pour les sections groupées par jour
interface PaymentSection {
  title: string;
  date: string;
  data: Payment[];
  totalAmount: number;
  count: number;
}

// Mapper les données de la DB vers le format Payment
const mapToPayment = (item: LocalPaymentQueue): Payment => ({
  ...item,
  uuid: item.local_uuid,
  sync_status: item.status.toLowerCase(),
  tax_type_label: undefined,
  tax_categorie_label: undefined,
});

export default function HistoryScreen() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');

  // Charger les paiements
  const loadPayments = useCallback(async () => {
    try {
      const data = await getAllPayments();
      const mapped = data.map(mapToPayment);
      setPayments(mapped);
    } catch (error) {
      console.error('Erreur chargement paiements:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Rafraîchir les paiements
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  }, [loadPayments]);

  // Recharger quand l'écran est focalisé
  useFocusEffect(
    useCallback(() => {
      loadPayments();
    }, [loadPayments])
  );

  // Formater la date pour le titre de section
  const formatSectionDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Comparer les dates sans l'heure
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (dateOnly.getTime() === todayOnly.getTime()) {
      return "Aujourd'hui";
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Hier';
    } else {
      return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  };

  // Filtrer par période
  const filterByPeriod = (payment: Payment): boolean => {
    if (periodFilter === 'ALL') return true;

    const paymentDate = new Date(payment.paid_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (periodFilter) {
      case 'TODAY':
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        return paymentDate >= today && paymentDate <= todayEnd;
      case 'WEEK':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return paymentDate >= weekAgo;
      case 'MONTH':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return paymentDate >= monthAgo;
      default:
        return true;
    }
  };

  // Filtrer par statut
  const filterByStatus = (payment: Payment): boolean => {
    if (statusFilter === 'ALL') return true;

    switch (statusFilter) {
      case 'PENDING':
        return payment.sync_status === 'pending';
      case 'SYNCED':
        return payment.sync_status === 'synced';
      case 'FAILED':
        return payment.sync_status === 'failed';
      default:
        return true;
    }
  };

  // Filtrer par recherche
  const filterBySearch = (payment: Payment): boolean => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();
    return (
      payment.payer_name.toLowerCase().includes(query) ||
      (payment.payer_phone?.includes(query) ?? false) ||
      payment.uuid.toLowerCase().includes(query) ||
      (payment.tax_type_label?.toLowerCase().includes(query) ?? false) ||
      (payment.tax_categorie_label?.toLowerCase().includes(query) ?? false)
    );
  };

  // Appliquer tous les filtres et grouper par jour
  const filteredSections = useMemo((): PaymentSection[] => {
    // Filtrer les paiements
    const filtered = payments
      .filter(filterByPeriod)
      .filter(filterByStatus)
      .filter(filterBySearch);

    // Grouper par jour
    const grouped = filtered.reduce<Record<string, Payment[]>>((acc, payment) => {
      const dateKey = new Date(payment.paid_at).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(payment);
      return acc;
    }, {});

    // Convertir en sections triées par date décroissante
    const sections = Object.entries(grouped)
      .map(([date, items]: [string, Payment[]]) => ({
        title: formatSectionDate(date),
        date,
        data: items.sort((a: Payment, b: Payment) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()),
        totalAmount: items.reduce((sum: number, p: Payment) => sum + p.total_amount, 0),
        count: items.length,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return sections;
  }, [payments, searchQuery, statusFilter, periodFilter]);

  // Statistiques globales
  const stats = useMemo(() => {
    const filtered = payments
      .filter(filterByPeriod)
      .filter(filterByStatus)
      .filter(filterBySearch);

    return {
      count: filtered.length,
      total: filtered.reduce((sum, p) => sum + p.total_amount, 0),
      synced: filtered.filter((p) => p.sync_status === 'synced').length,
      pending: filtered.filter((p) => p.sync_status === 'pending').length,
    };
  }, [payments, searchQuery, statusFilter, periodFilter]);

  // Synchroniser tous les paiements en attente
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await syncService.syncPendingPayments();
      await loadPayments();
      Alert.alert(
        'Synchronisation',
        `${result.synced} paiement(s) synchronisé(s)\n${result.failed} échec(s)`
      );
    } catch (error) {
      Alert.alert('Erreur', 'La synchronisation a échoué');
    } finally {
      setSyncing(false);
    }
  };

  // Imprimer un reçu
  const handlePrint = async (payment: Payment) => {
    try {
      // Récupérer les noms de catégorie et type depuis la base
      const [categorie, taxType] = await Promise.all([
        getTaxCategorieById(payment.tax_categorie_id),
        getTaxTypeById(payment.tax_type_id),
      ]);

      await printerService.print({
        payment: {
          ...payment,
          local_uuid: payment.uuid,
        } as LocalPaymentQueue,
        agentName: user?.fullname || 'Agent',
        categoryLabel: categorie?.label || 'Catégorie',
        typeLabel: taxType?.label || 'Type',
      });
    } catch (error) {
      console.error('Erreur impression:', error);
    }
  };

  // Obtenir la couleur du statut
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'synced':
        return '#4CAF50';
      case 'pending':
        return '#FFA000';
      case 'failed':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  // Obtenir l'icône du statut
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced':
        return 'cloud-done';
      case 'pending':
        return 'cloud-upload';
      case 'failed':
        return 'cloud-offline';
      default:
        return 'help-circle';
    }
  };

  // Formater le montant
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FC';
  };

  // Formater l'heure
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Rendu d'un paiement
  const renderPayment = ({ item }: { item: Payment }) => (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <View style={styles.paymentInfo}>
          <Text style={styles.payerName}>{item.payer_name}</Text>
          <Text style={styles.payerPhone}>{item.payer_phone}</Text>
        </View>
        <View style={styles.paymentStatus}>
          <Ionicons
            name={getStatusIcon(item.sync_status) as any}
            size={20}
            color={getStatusColor(item.sync_status)}
          />
        </View>
      </View>

      <View style={styles.paymentDetails}>
        <View style={styles.taxInfo}>
          <Text style={styles.taxType} numberOfLines={1}>
            {item.tax_type_label || 'Type inconnu'}
          </Text>
          <Text style={styles.taxCategory} numberOfLines={1}>
            {item.tax_categorie_label || 'Catégorie inconnue'}
          </Text>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amount}>{formatAmount(item.total_amount)}</Text>
          <Text style={styles.time}>{formatTime(item.paid_at)}</Text>
        </View>
      </View>

      <View style={styles.paymentFooter}>
        <Text style={styles.receiptNumber}>N° {item.uuid.slice(0, 8).toUpperCase()}</Text>
        <TouchableOpacity style={styles.printButton} onPress={() => handlePrint(item)}>
          <Ionicons name="print" size={16} color="#fff" />
          <Text style={styles.printButtonText}>Imprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Rendu de l'en-tête de section
  const renderSectionHeader = ({ section }: { section: PaymentSection }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleContainer}>
        <Ionicons name="calendar" size={18} color="#1976D2" />
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <View style={styles.sectionStats}>
        <Text style={styles.sectionCount}>{section.count} paiement(s)</Text>
        <Text style={styles.sectionTotal}>{formatAmount(section.totalAmount)}</Text>
      </View>
    </View>
  );

  // Rendu de l'en-tête de liste avec statistiques
  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {/* Statistiques */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.count}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.synced}</Text>
          <Text style={styles.statLabel}>Synchronisés</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FFA000' }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>En attente</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#1976D2' }]}>{formatAmount(stats.total)}</Text>
          <Text style={styles.statLabel}>Montant</Text>
        </View>
      </View>

      {/* Filtres de période */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Période :</Text>
        <View style={styles.filterButtons}>
          {(['ALL', 'TODAY', 'WEEK', 'MONTH'] as PeriodFilter[]).map((period) => (
            <TouchableOpacity
              key={period}
              style={[styles.filterButton, periodFilter === period && styles.filterButtonActive]}
              onPress={() => setPeriodFilter(period)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  periodFilter === period && styles.filterButtonTextActive,
                ]}
              >
                {period === 'ALL'
                  ? 'Tout'
                  : period === 'TODAY'
                    ? "Aujourd'hui"
                    : period === 'WEEK'
                      ? 'Semaine'
                      : 'Mois'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Filtres de statut */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Statut :</Text>
        <View style={styles.filterButtons}>
          {(['ALL', 'PENDING', 'SYNCED', 'FAILED'] as StatusFilter[]).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterButton,
                statusFilter === status && styles.filterButtonActive,
                status === 'SYNCED' && statusFilter === status && { backgroundColor: '#4CAF50' },
                status === 'PENDING' && statusFilter === status && { backgroundColor: '#FFA000' },
                status === 'FAILED' && statusFilter === status && { backgroundColor: '#F44336' },
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  statusFilter === status && styles.filterButtonTextActive,
                ]}
              >
                {status === 'ALL'
                  ? 'Tout'
                  : status === 'PENDING'
                    ? 'En attente'
                    : status === 'SYNCED'
                      ? 'Synchronisés'
                      : 'Échoués'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  // Rendu de la liste vide
  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={80} color="#ccc" />
      <Text style={styles.emptyText}>Aucun paiement trouvé</Text>
      <Text style={styles.emptySubtext}>
        {searchQuery || statusFilter !== 'ALL' || periodFilter !== 'ALL'
          ? 'Essayez de modifier vos filtres'
          : 'Les paiements effectués apparaîtront ici'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Barre de recherche */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom, téléphone, type..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
          onPress={handleSyncAll}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sync" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Liste des paiements groupés par jour */}
      <SectionList
        sections={filteredSections}
        keyExtractor={(item) => item.uuid}
        renderItem={renderPayment}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1976D2']} />}
        contentContainerStyle={filteredSections.length === 0 ? styles.emptyListContent : undefined}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },

  // Barre de recherche
  searchContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#333',
  },
  syncButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#90CAF9',
  },

  // En-tête de liste
  listHeader: {
    backgroundColor: '#fff',
    paddingBottom: 12,
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },

  // Filtres
  filterSection: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  filterButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
  },

  // En-tête de section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 10,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976D2',
  },
  sectionStats: {
    alignItems: 'flex-end',
  },
  sectionCount: {
    fontSize: 12,
    color: '#666',
  },
  sectionTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
  },

  // Carte de paiement
  paymentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  paymentInfo: {
    flex: 1,
  },
  payerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  payerPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  paymentStatus: {
    padding: 4,
  },
  paymentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  taxInfo: {
    flex: 1,
    marginRight: 10,
  },
  taxType: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  taxCategory: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  time: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  receiptNumber: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  printButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Liste vide
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
