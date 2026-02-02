import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts';
import { getAllPayments, getTaxCategorieById, getTaxTypeById } from '../../database';
import { LocalPaymentQueue } from '../../types';

interface Props {
  navigation: any;
}

interface PaymentWithDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithDetails[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'SYNCED' | 'FAILED'>('ALL');

  const loadPayments = async () => {
    try {
      const allPayments = await getAllPayments();
      
      // Enrichir avec les labels
      const enrichedPayments = await Promise.all(
        allPayments.map(async (p) => {
          const category = await getTaxCategorieById(p.tax_categorie_id);
          const type = await getTaxTypeById(p.tax_type_id);
          return {
            ...p,
            categoryLabel: category?.label || 'N/A',
            typeLabel: type?.label || 'N/A',
          };
        })
      );
      
      setPayments(enrichedPayments);
      applyFilters(enrichedPayments, searchQuery, filterStatus);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const applyFilters = (
    data: PaymentWithDetails[],
    query: string,
    status: 'ALL' | 'PENDING' | 'SYNCED' | 'FAILED'
  ) => {
    let filtered = [...data];

    // Filtre par status
    if (status !== 'ALL') {
      filtered = filtered.filter((p) => p.status === status);
    }

    // Filtre par recherche
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.payer_name.toLowerCase().includes(lowerQuery) ||
          p.payer_phone?.toLowerCase().includes(lowerQuery) ||
          p.local_uuid.toLowerCase().includes(lowerQuery) ||
          p.categoryLabel?.toLowerCase().includes(lowerQuery) ||
          p.typeLabel?.toLowerCase().includes(lowerQuery)
      );
    }

    setFilteredPayments(filtered);
  };

  useEffect(() => {
    applyFilters(payments, searchQuery, filterStatus);
  }, [searchQuery, filterStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SYNCED':
        return '#34a853';
      case 'PENDING':
        return '#f9ab00';
      case 'FAILED':
        return '#ea4335';
      default:
        return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SYNCED':
        return 'Synchronisé';
      case 'PENDING':
        return 'En attente';
      case 'FAILED':
        return 'Échoué';
      default:
        return status;
    }
  };

  const renderPaymentItem = ({ item }: { item: PaymentWithDetails }) => (
    <TouchableOpacity
      style={styles.paymentCard}
      onPress={() => navigation.navigate('Receipt', { paymentUuid: item.local_uuid })}
    >
      <View style={styles.paymentHeader}>
        <View style={styles.paymentInfo}>
          <Text style={styles.payerName}>{item.payer_name}</Text>
          <Text style={styles.paymentType}>{item.typeLabel}</Text>
        </View>
        <View style={styles.paymentAmount}>
          <Text style={styles.amountText}>{formatCurrency(item.total_amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.paymentFooter}>
        <Ionicons name="time-outline" size={14} color="#666" />
        <Text style={styles.dateText}>{formatDate(item.paid_at)}</Text>
        {item.server_receipt_no && (
          <>
            <Ionicons name="document-text-outline" size={14} color="#666" style={{ marginLeft: 15 }} />
            <Text style={styles.receiptNo}>{item.server_receipt_no}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  const StatusFilterButton = ({ 
    status, 
    label 
  }: { 
    status: 'ALL' | 'PENDING' | 'SYNCED' | 'FAILED'; 
    label: string 
  }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        filterStatus === status && styles.filterButtonActive,
      ]}
      onPress={() => setFilterStatus(status)}
    >
      <Text
        style={[
          styles.filterButtonText,
          filterStatus === status && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <StatusFilterButton status="ALL" label="Tous" />
        <StatusFilterButton status="PENDING" label="En attente" />
        <StatusFilterButton status="SYNCED" label="Synchronisés" />
        <StatusFilterButton status="FAILED" label="Échoués" />
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {filteredPayments.length} paiement(s)
        </Text>
        <Text style={styles.statsTotal}>
          Total: {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.total_amount, 0))}
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={filteredPayments}
        renderItem={renderPaymentItem}
        keyExtractor={(item) => item.local_uuid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Aucun paiement trouvé</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 15,
    marginBottom: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtonActive: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#e8f0fe',
  },
  statsText: {
    fontSize: 14,
    color: '#333',
  },
  statsTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
  },
  listContent: {
    padding: 15,
    paddingTop: 5,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentInfo: {
    flex: 1,
  },
  payerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  paymentType: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  paymentAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  paymentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  dateText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 5,
  },
  receiptNo: {
    fontSize: 12,
    color: '#666',
    marginLeft: 5,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 15,
  },
});
