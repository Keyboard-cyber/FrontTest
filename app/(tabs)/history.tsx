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
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts';
import { getAllPayments, getTaxCategorieById, getTaxTypeById } from '../../src/database';
import { LocalPaymentQueue } from '../../src/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../src/theme';

interface PaymentWithDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export default function HistoryScreen() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentWithDetails[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'SYNCED' | 'FAILED'>('ALL');

  const loadPayments = async () => {
    try {
      const allPayments = await getAllPayments();
      
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

    if (status !== 'ALL') {
      filtered = filtered.filter((p) => p.status === status);
    }

    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.payer_name.toLowerCase().includes(lowerQuery) ||
          p.payer_phone?.toLowerCase().includes(lowerQuery) ||
          p.local_uuid.toLowerCase().includes(lowerQuery)
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FC';
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
      case 'SYNCED': return Colors.success;
      case 'PENDING': return Colors.warning;
      case 'FAILED': return Colors.error;
      default: return Colors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SYNCED': return 'Synchronisé';
      case 'PENDING': return 'En attente';
      case 'FAILED': return 'Échoué';
      default: return status;
    }
  };

  const renderPaymentItem = ({ item }: { item: PaymentWithDetails }) => (
    <Link href={{ pathname: '/payment/receipt', params: { uuid: item.local_uuid } }} asChild>
      <TouchableOpacity style={styles.paymentCard} activeOpacity={0.7}>
        <View style={styles.paymentHeader}>
          <View style={styles.paymentInfo}>
            <Text style={styles.payerName}>{item.payer_name}</Text>
            <Text style={styles.paymentType}>{item.typeLabel}</Text>
          </View>
          <View style={styles.paymentAmount}>
            <Text style={styles.amountText}>{formatCurrency(item.total_amount)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.paymentFooter}>
          <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.dateText}>{formatDate(item.paid_at)}</Text>
          {item.server_receipt_no && (
            <>
              <View style={styles.footerDivider} />
              <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.receiptNo}>{item.server_receipt_no}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Link>
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
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un paiement..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <StatusFilterButton status="ALL" label="Tous" />
        <StatusFilterButton status="PENDING" label="En attente" />
        <StatusFilterButton status="SYNCED" label="Synchronisés" />
        <StatusFilterButton status="FAILED" label="Échoués" />
      </View>

      {/* List */}
      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.local_uuid}
        renderItem={renderPaymentItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Aucun paiement</Text>
            <Text style={styles.emptyText}>Les paiements apparaîtront ici</Text>
          </View>
        }
      />

      {/* FAB */}
      <Link href="/payment/new" asChild>
        <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
          <LinearGradient
            colors={[Colors.primary, Colors.primaryLight]}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  filterButtonTextActive: {
    color: Colors.textPrimary,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 150,
  },
  paymentCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  paymentInfo: {
    flex: 1,
  },
  payerName: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  paymentType: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  paymentAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  paymentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  footerDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  dateText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  receiptNo: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 90,
    borderRadius: 28,
    ...Shadows.glow,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
