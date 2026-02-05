import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius } from '../../src/theme';
import { getAllPayments, getTaxCategorieById, getTaxTypeById, getLocalProfile } from '../../src/database';
import { LocalPaymentQueue } from '../../src/types';
import { apiService } from '../../src/services';

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
  agentName?: string;
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocalPaymentQueue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // Debounce timer ref
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche automatique avec debounce
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    
    try {
      // Recherche locale
      const allPayments = await getAllPayments();
      const searchTerm = query.toLowerCase().trim();
      let filtered = allPayments.filter(p => 
        p.payer_name.toLowerCase().includes(searchTerm) ||
        (p.payer_phone && p.payer_phone.includes(searchTerm))
      );

      // Si peu de résultats et query assez longue, essayer via l'API
      if (filtered.length < 3 && query.trim().length >= 2) {
        try {
          const serverResults = await apiService.searchPayments(query);
          if (serverResults && serverResults.length > 0) {
            // Fusionner avec les résultats locaux (éviter les doublons)
            const existingUuids = new Set(filtered.map(p => p.local_uuid));
            for (const sp of serverResults) {
              if (!existingUuids.has(sp.uuid)) {
                filtered.push({
                  local_uuid: sp.uuid,
                  payer_name: sp.payer_name,
                  payer_phone: sp.payer_phone || '',
                  service_id: sp.service_id,
                  tax_categorie_id: sp.tax_categorie_id,
                  tax_type_id: sp.tax_type_id,
                  quantity: sp.quantity || 1,
                  unit_price: sp.unit_price,
                  total_amount: sp.total_amount,
                  chassis_number: sp.chassis_number || null,
                  vehicle_color: sp.vehicle_color || null,
                  paid_at: sp.paid_at,
                  user_id: sp.user_id,
                  terminal_id: sp.terminal_id || 0,
                  qr_signature: '',
                  status: 'SYNCED',
                  server_receipt_no: sp.receipt_no || null,
                  server_payment_id: sp.id || null,
                  created_at: sp.paid_at,
                });
              }
            }
          }
        } catch (e) {
          console.log('Recherche serveur échouée:', e);
        }
      }

      // Trier par date décroissante
      filtered.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());
      
      setSearchResults(filtered);
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Déclencher la recherche avec debounce à chaque changement
  useEffect(() => {
    // Annuler le timer précédent
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Nouveau timer de 300ms
    debounceTimer.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    // Cleanup
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Rechercher par nom (bouton)
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom à rechercher');
      return;
    }
    performSearch(searchQuery);
  };

  // Voir les détails d'un paiement
  const viewPaymentDetails = async (payment: LocalPaymentQueue) => {
    const category = await getTaxCategorieById(payment.tax_categorie_id);
    const type = await getTaxTypeById(payment.tax_type_id);
    
    // Récupérer le nom de l'agent (percepteur)
    let agentName = 'N/A';
    const profile = await getLocalProfile();
    if (profile && profile.user_id === payment.user_id) {
      agentName = profile.fullname;
    } else {
      // Essayer de récupérer via l'API si c'est un autre agent
      try {
        const agentInfo = await apiService.getUserById(payment.user_id);
        if (agentInfo) {
          agentName = agentInfo.fullname;
        }
      } catch (e) {
        agentName = `Agent #${payment.user_id}`;
      }
    }
    
    setPaymentDetails({
      ...payment,
      categoryLabel: category?.label || 'N/A',
      typeLabel: type?.label || 'N/A',
      agentName,
    });
    setShowDetails(true);
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Formater le montant
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FC';
  };

  // Rendu d'un résultat
  const renderResultItem = ({ item }: { item: LocalPaymentQueue }) => (
    <TouchableOpacity 
      style={styles.resultCard}
      onPress={() => viewPaymentDetails(item)}
    >
      <View style={styles.resultHeader}>
        <Text style={styles.resultName} numberOfLines={1}>{item.payer_name}</Text>
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.status === 'SYNCED' ? Colors.success + '20' : Colors.warning + '20' }
        ]}>
          <Text style={[
            styles.statusText,
            { color: item.status === 'SYNCED' ? Colors.success : Colors.warning }
          ]}>
            {item.status === 'SYNCED' ? 'Vérifié' : 'Local'}
          </Text>
        </View>
      </View>
      <Text style={styles.resultAmount}>{formatCurrency(item.total_amount)}</Text>
      <View style={styles.resultFooter}>
        <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.resultDate}>{formatDate(item.paid_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  // Modal des détails
  const renderDetailsModal = () => (
    <Modal
      visible={showDetails}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowDetails(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
            <Text style={styles.modalTitle}>Détails du Paiement</Text>
          </View>

          {paymentDetails && (
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payeur</Text>
                <Text style={styles.detailValue}>{paymentDetails.payer_name}</Text>
              </View>
              
              {paymentDetails.payer_phone && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Téléphone</Text>
                  <Text style={styles.detailValue}>{paymentDetails.payer_phone}</Text>
                </View>
              )}
              
              {paymentDetails.categoryLabel !== 'N/A' && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type de taxe</Text>
                  <Text style={styles.detailValue}>{paymentDetails.categoryLabel}</Text>
                </View>
              )}
              
              {paymentDetails.typeLabel !== 'N/A' && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>{paymentDetails.typeLabel}</Text>
                </View>
              )}
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Montant</Text>
                <Text style={[styles.detailValue, styles.amountValue]}>
                  {formatCurrency(paymentDetails.total_amount)}
                </Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{formatDate(paymentDetails.paid_at)}</Text>
              </View>
              
              {paymentDetails.agentName && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Percepteur</Text>
                  <Text style={styles.detailValue}>{paymentDetails.agentName}</Text>
                </View>
              )}
              
              {paymentDetails.chassis_number && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>N° Châssis</Text>
                  <Text style={styles.detailValue}>{paymentDetails.chassis_number}</Text>
                </View>
              )}
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Statut</Text>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: paymentDetails.status === 'SYNCED' ? Colors.success + '20' : Colors.warning + '20' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: paymentDetails.status === 'SYNCED' ? Colors.success : Colors.warning }
                  ]}>
                    {paymentDetails.status === 'SYNCED' ? 'Synchronisé' : 'En attente'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.uuidContainer}>
                <Text style={styles.uuidLabel}>UUID</Text>
                <Text style={styles.uuidValue}>{paymentDetails.local_uuid}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity 
            style={styles.closeModalButton}
            onPress={() => {
              setShowDetails(false);
              setPaymentDetails(null);
            }}
          >
            <Text style={styles.closeModalButtonText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.searchSection}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Nom du payeur..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="words"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
                setHasSearched(false);
              }}>
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity 
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="search" size={22} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <FlatList
          data={searchResults}
          keyExtractor={(item, index) => `${item.local_uuid}-${index}`}
          renderItem={renderResultItem}
          contentContainerStyle={styles.resultsList}
          ListEmptyComponent={
            hasSearched && !isLoading ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={64} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Aucun résultat</Text>
                <Text style={styles.emptyText}>
                  Aucun paiement trouvé pour "{searchQuery}"
                </Text>
              </View>
            ) : !hasSearched ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={64} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Rechercher un paiement</Text>
                <Text style={styles.emptyText}>
                  Entrez le nom du payeur pour vérifier ses paiements
                </Text>
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>

      {renderDetailsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: Colors.backgroundSecondary,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  searchButton: {
    width: 48,
    height: 48,
    backgroundColor: '#FF9500',
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsList: {
    padding: 16,
    paddingBottom: 100,
  },
  resultCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 12,
  },
  resultAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF9500',
    marginBottom: 8,
  },
  resultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  
  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  detailsContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  amountValue: {
    fontSize: 18,
    color: '#FF9500',
  },
  uuidContainer: {
    marginTop: 12,
    paddingTop: 12,
  },
  uuidLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  uuidValue: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  closeModalButton: {
    backgroundColor: '#FF9500',
    borderRadius: BorderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
