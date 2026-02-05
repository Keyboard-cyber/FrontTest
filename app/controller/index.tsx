import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, BorderRadius } from '../../src/theme';
import { getAllPayments, getPaymentByUuid, getTaxCategorieById, getTaxTypeById } from '../../src/database';
import { LocalPaymentQueue } from '../../src/types';

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export default function ControllerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'menu' | 'scan' | 'search'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocalPaymentQueue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Rechercher par nom
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom à rechercher');
      return;
    }

    setIsLoading(true);
    try {
      const allPayments = await getAllPayments();
      const query = searchQuery.toLowerCase().trim();
      const filtered = allPayments.filter(p => 
        p.payer_name.toLowerCase().includes(query)
      );
      setSearchResults(filtered);
      
      if (filtered.length === 0) {
        Alert.alert('Aucun résultat', 'Aucun paiement trouvé pour ce nom');
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
      Alert.alert('Erreur', 'Erreur lors de la recherche');
    } finally {
      setIsLoading(false);
    }
  };

  // Parser les données QR
  const parseQrData = (data: string): { uuid: string; amount: string; date: string; agentId: string } | null => {
    if (!data || !data.includes('|')) return null;
    const parts = data.split('|');
    if (parts.length < 4) return null;
    return {
      uuid: parts[0],
      amount: parts[1],
      date: parts[2],
      agentId: parts[3],
    };
  };

  // Gérer le scan QR
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scannedData) return; // Éviter les scans multiples
    
    setScannedData(data);
    console.log('QR scanné:', data);

    const parsed = parseQrData(data);
    if (!parsed) {
      Alert.alert('QR invalide', 'Ce QR code n\'est pas un reçu valide', [
        { text: 'OK', onPress: () => setScannedData(null) }
      ]);
      return;
    }

    // Rechercher le paiement par UUID
    setIsLoading(true);
    try {
      const payment = await getPaymentByUuid(parsed.uuid);
      
      if (payment) {
        // Récupérer les labels
        const category = await getTaxCategorieById(payment.tax_categorie_id);
        const type = await getTaxTypeById(payment.tax_type_id);
        
        setPaymentDetails({
          ...payment,
          categoryLabel: category?.label || 'N/A',
          typeLabel: type?.label || 'N/A',
        });
        setShowDetails(true);
      } else {
        // Paiement non trouvé localement, afficher les infos du QR
        Alert.alert(
          'Paiement non trouvé',
          `Ce paiement n'est pas dans la base locale.\n\nUUID: ${parsed.uuid}\nMontant: ${parsed.amount} FC\nDate: ${parsed.date}`,
          [{ text: 'OK', onPress: () => setScannedData(null) }]
        );
      }
    } catch (error) {
      console.error('Erreur vérification:', error);
      Alert.alert('Erreur', 'Erreur lors de la vérification');
    } finally {
      setIsLoading(false);
    }
  };

  // Voir les détails d'un paiement depuis la recherche
  const viewPaymentDetails = async (payment: LocalPaymentQueue) => {
    const category = await getTaxCategorieById(payment.tax_categorie_id);
    const type = await getTaxTypeById(payment.tax_type_id);
    
    setPaymentDetails({
      ...payment,
      categoryLabel: category?.label || 'N/A',
      typeLabel: type?.label || 'N/A',
    });
    setShowDetails(true);
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Formater le montant
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FC';
  };

  // Rendu du menu principal
  const renderMenu = () => (
    <View style={styles.menuContainer}>
      <View style={styles.logoContainer}>
        <Ionicons name="shield-checkmark" size={80} color={Colors.primary} />
        <Text style={styles.title}>Contrôle des Paiements</Text>
        <Text style={styles.subtitle}>Vérifiez l'authenticité des reçus</Text>
      </View>

      <View style={styles.optionsContainer}>
        <TouchableOpacity 
          style={styles.optionCard}
          onPress={async () => {
            if (!permission?.granted) {
              const result = await requestPermission();
              if (!result.granted) {
                Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour scanner les QR codes');
                return;
              }
            }
            setMode('scan');
          }}
        >
          <View style={[styles.optionIcon, { backgroundColor: Colors.primary + '20' }]}>
            <Ionicons name="qr-code" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.optionTitle}>Scanner QR Code</Text>
          <Text style={styles.optionDescription}>
            Scannez le QR code sur le reçu pour vérifier le paiement
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.optionCard}
          onPress={() => setMode('search')}
        >
          <View style={[styles.optionIcon, { backgroundColor: Colors.success + '20' }]}>
            <Ionicons name="search" size={40} color={Colors.success} />
          </View>
          <Text style={styles.optionTitle}>Rechercher par Nom</Text>
          <Text style={styles.optionDescription}>
            Recherchez un paiement par le nom du payeur
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={20} color={Colors.textMuted} />
        <Text style={styles.backButtonText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );

  // Rendu du scanner
  const renderScanner = () => (
    <View style={styles.scannerContainer}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scannedData ? undefined : handleBarCodeScanned}
      >
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => {
                setMode('menu');
                setScannedData(null);
              }}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scannez le QR Code</Text>
          </View>
          
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          
          <Text style={styles.scannerHint}>
            Alignez le QR code du reçu dans le cadre
          </Text>
        </View>
      </CameraView>
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Vérification...</Text>
        </View>
      )}
    </View>
  );

  // Rendu de la recherche
  const renderSearch = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchHeader}>
        <TouchableOpacity 
          style={styles.backIconButton}
          onPress={() => {
            setMode('menu');
            setSearchQuery('');
            setSearchResults([]);
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.searchTitle}>Recherche par Nom</Text>
      </View>

      <View style={styles.searchInputContainer}>
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Entrez le nom du payeur..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
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
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="search" size={20} color="#FFF" />
            <Text style={styles.searchButtonText}>Rechercher</Text>
          </>
        )}
      </TouchableOpacity>

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.local_uuid}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.resultCard}
            onPress={() => viewPaymentDetails(item)}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultName}>{item.payer_name}</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: item.status === 'SYNCED' ? Colors.success + '20' : Colors.warning + '20' }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: item.status === 'SYNCED' ? Colors.success : Colors.warning }
                ]}>
                  {item.status === 'SYNCED' ? 'Synchronisé' : 'En attente'}
                </Text>
              </View>
            </View>
            <Text style={styles.resultAmount}>{formatCurrency(item.total_amount)}</Text>
            <Text style={styles.resultDate}>{formatDate(item.paid_at)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          searchQuery && !isLoading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Aucun résultat</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.resultsList}
      />
    </View>
  );

  // Modal des détails
  const renderDetailsModal = () => (
    <Modal
      visible={showDetails}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowDetails(false);
        setPaymentDetails(null);
        setScannedData(null);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.validBadge}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
            </View>
            <Text style={styles.modalTitle}>Paiement Vérifié</Text>
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
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Catégorie</Text>
                <Text style={styles.detailValue}>{paymentDetails.categoryLabel}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>{paymentDetails.typeLabel}</Text>
              </View>
              
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
              setScannedData(null);
            }}
          >
            <Text style={styles.closeModalButtonText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {mode === 'menu' && renderMenu()}
      {mode === 'scan' && renderScanner()}
      {mode === 'search' && renderSearch()}
      {renderDetailsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  
  // Menu styles
  menuContainer: {
    flex: 1,
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
  },
  optionsContainer: {
    flex: 1,
    gap: 16,
  },
  optionCard: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 24,
    alignItems: 'center',
  },
  optionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  
  // Scanner styles
  scannerContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'space-between',
    padding: 20,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
  },
  closeButton: {
    padding: 8,
  },
  scannerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
    marginRight: 40,
  },
  scanFrame: {
    width: 250,
    height: 250,
    alignSelf: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: Colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  scannerHint: {
    fontSize: 14,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 40,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 12,
    fontSize: 16,
  },
  
  // Search styles
  searchContainer: {
    flex: 1,
    padding: 20,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backIconButton: {
    padding: 8,
    marginRight: 12,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    height: 50,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    height: 50,
    marginTop: 16,
    gap: 8,
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  resultsList: {
    paddingTop: 20,
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
  },
  resultAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  resultDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 12,
  },
  
  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
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
  validBadge: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.success,
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
    color: Colors.primary,
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
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  closeModalButton: {
    backgroundColor: Colors.primary,
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
