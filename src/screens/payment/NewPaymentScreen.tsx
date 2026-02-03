import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { v4 as uuidv4 } from 'uuid';
import { useAuth, useSync } from '../../contexts';
import { 
  getTaxCategories, 
  getTaxTypes, 
  addPaymentToQueue,
  getLocalTerminal,
  getServiceIds,
} from '../../database';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue } from '../../types';

interface Props {
  navigation: any;
}

export const NewPaymentScreen: React.FC<Props> = ({ navigation }) => {
  const { profile } = useAuth();
  const { refreshData, isOnline, syncPayments } = useSync();

  const [categories, setCategories] = useState<LocalTaxCategorie[]>([]);
  const [taxTypes, setTaxTypes] = useState<LocalTaxType[]>([]);
  const [filteredTaxTypes, setFilteredTaxTypes] = useState<LocalTaxType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<LocalTaxCategorie | null>(null);
  const [selectedTaxType, setSelectedTaxType] = useState<LocalTaxType | null>(null);
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [customAmount, setCustomAmount] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  // Étape du formulaire
  const [step, setStep] = useState<'category' | 'type' | 'details' | 'confirm'>('category');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Récupérer tous les services de l'agent
      const serviceIds = await getServiceIds();
      console.log('Services de l\'agent:', serviceIds);
      
      // Charger les catégories pour tous les services de l'agent
      const cats = await getTaxCategories(serviceIds.length > 0 ? serviceIds : undefined);
      console.log(`${cats.length} catégories chargées pour les services [${serviceIds.join(', ')}]`);
      setCategories(cats);
      
      const types = await getTaxTypes();
      setTaxTypes(types);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      Alert.alert('Erreur', 'Impossible de charger les données');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (category: LocalTaxCategorie) => {
    setSelectedCategory(category);
    const filtered = taxTypes.filter(t => t.tax_categorie_id === category.tax_categorie_id);
    setFilteredTaxTypes(filtered);
    setStep('type');
  };

  const handleTaxTypeSelect = (taxType: LocalTaxType) => {
    setSelectedTaxType(taxType);
    if (taxType.amount) {
      setCustomAmount(taxType.amount.toString());
    }
    setStep('details');
  };

  const calculateTotal = (): number => {
    const qty = parseFloat(quantity) || 1;
    const amount = parseFloat(customAmount) || 0;
    return qty * amount;
  };

  const validateForm = (): boolean => {
    if (!payerName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le nom du payeur');
      return false;
    }
    if (!selectedTaxType) {
      Alert.alert('Erreur', 'Veuillez sélectionner un type de taxe');
      return false;
    }
    
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide');
      return false;
    }

    if (selectedTaxType.min_amount && amount < selectedTaxType.min_amount) {
      Alert.alert('Erreur', `Le montant minimum est ${selectedTaxType.min_amount}`);
      return false;
    }

    if (selectedTaxType.max_amount && amount > selectedTaxType.max_amount) {
      Alert.alert('Erreur', `Le montant maximum est ${selectedTaxType.max_amount}`);
      return false;
    }

    if (selectedTaxType.require_chassis_number && !chassisNumber.trim()) {
      Alert.alert('Erreur', 'Le numéro de châssis est requis');
      return false;
    }

    if (selectedTaxType.require_color && !vehicleColor.trim()) {
      Alert.alert('Erreur', 'La couleur du véhicule est requise');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !profile || !selectedCategory || !selectedTaxType) return;

    setIsSaving(true);
    try {
      const uuid = uuidv4();
      const now = new Date().toISOString();
      const unitPrice = parseFloat(customAmount);
      const qty = parseFloat(quantity) || 1;
      
      // Récupérer le terminal de l'agent
      const terminal = await getLocalTerminal();
      console.log('Terminal récupéré:', terminal);
      const terminalId = terminal?.terminal_id || 1; // ID du terminal ou 1 par défaut
      console.log('Terminal ID utilisé:', terminalId);

      const payment: LocalPaymentQueue = {
        local_uuid: uuid,
        payer_name: payerName.trim(),
        payer_phone: payerPhone.trim() || null,
        service_id: profile.service_id,
        tax_categorie_id: selectedCategory.tax_categorie_id,
        tax_type_id: selectedTaxType.tax_type_id,
        quantity: qty,
        unit_price: unitPrice,
        total_amount: qty * unitPrice,
        chassis_number: chassisNumber.trim() || null,
        vehicle_color: vehicleColor.trim() || null,
        paid_at: now,
        user_id: profile.user_id,
        terminal_id: terminalId,
        qr_signature: `${uuid}|${qty * unitPrice}|${now}|${profile.user_id}`,
        status: 'PENDING',
        server_receipt_no: null,
        server_payment_id: null,
        created_at: now,
      };

      await addPaymentToQueue(payment);
      
      // Synchroniser automatiquement si en ligne
      let syncSuccess = false;
      if (isOnline) {
        console.log('En ligne - synchronisation automatique...');
        const syncResult = await syncPayments();
        syncSuccess = syncResult.synced > 0;
        console.log('Résultat sync:', syncResult);
      }
      
      await refreshData();

      Alert.alert(
        'Succès',
        isOnline && syncSuccess 
          ? 'Paiement enregistré et synchronisé avec succès' 
          : 'Paiement enregistré (sera synchronisé ultérieurement)',
        [
          {
            text: 'Voir le reçu',
            onPress: () => navigation.navigate('Receipt', { paymentUuid: uuid }),
          },
          {
            text: 'Nouveau paiement',
            onPress: resetForm,
          },
        ]
      );
    } catch (error) {
      console.error('Erreur enregistrement:', error);
      Alert.alert('Erreur', 'Impossible d\'enregistrer le paiement');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory(null);
    setSelectedTaxType(null);
    setPayerName('');
    setPayerPhone('');
    setQuantity('1');
    setCustomAmount('');
    setChassisNumber('');
    setVehicleColor('');
    setStep('category');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Render selon l'étape
  const renderStep = () => {
    switch (step) {
      case 'category':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Sélectionnez une catégorie</Text>
            {categories.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune catégorie disponible. Synchronisez les données.
              </Text>
            ) : (
              categories.map((cat) => (
                <TouchableOpacity
                  key={cat.tax_categorie_id}
                  style={styles.optionCard}
                  onPress={() => handleCategorySelect(cat)}
                >
                  <Ionicons name="folder-outline" size={24} color="#1a73e8" />
                  <Text style={styles.optionText}>{cat.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ))
            )}
          </View>
        );

      case 'type':
        return (
          <View style={styles.stepContainer}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('category')}>
              <Ionicons name="arrow-back" size={24} color="#1a73e8" />
              <Text style={styles.backText}>Retour</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>{selectedCategory?.label}</Text>
            <Text style={styles.stepSubtitle}>Sélectionnez le type de taxe</Text>
            
            {filteredTaxTypes.length === 0 ? (
              <Text style={styles.emptyText}>Aucun type de taxe disponible</Text>
            ) : (
              filteredTaxTypes.map((type) => {
                console.log('Type de taxe:', JSON.stringify(type, null, 2));
                const displayLabel = type.label || (type as any).name || (type as any).title || `Type #${type.tax_type_id}`;
                return (
                  <TouchableOpacity
                    key={type.tax_type_id}
                    style={styles.optionCard}
                    onPress={() => handleTaxTypeSelect(type)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={styles.optionText}>{displayLabel}</Text>
                      {type.amount ? (
                        <Text style={styles.optionAmount}>{formatCurrency(type.amount)}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        );

      case 'details':
        return (
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView style={styles.stepContainer}>
              <TouchableOpacity style={styles.backButton} onPress={() => setStep('type')}>
                <Ionicons name="arrow-back" size={24} color="#1a73e8" />
                <Text style={styles.backText}>Retour</Text>
              </TouchableOpacity>
              
              <Text style={styles.stepTitle}>{selectedTaxType?.label}</Text>
              <Text style={styles.stepSubtitle}>Informations du paiement</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nom du payeur *</Text>
                <TextInput
                  style={styles.input}
                  value={payerName}
                  onChangeText={setPayerName}
                  placeholder="Entrez le nom"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Téléphone</Text>
                <TextInput
                  style={styles.input}
                  value={payerPhone}
                  onChangeText={setPayerPhone}
                  placeholder="Numéro de téléphone"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Quantité</Text>
                  <TextInput
                    style={styles.input}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 2 }]}>
                  <Text style={styles.label}>Montant unitaire *</Text>
                  <TextInput
                    style={styles.input}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </View>
              </View>

              {selectedTaxType?.require_chassis_number === 1 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Numéro de châssis *</Text>
                  <TextInput
                    style={styles.input}
                    value={chassisNumber}
                    onChangeText={setChassisNumber}
                    placeholder="Entrez le numéro de châssis"
                    autoCapitalize="characters"
                  />
                </View>
              )}

              {selectedTaxType?.require_color === 1 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Couleur du véhicule *</Text>
                  <TextInput
                    style={styles.input}
                    value={vehicleColor}
                    onChangeText={setVehicleColor}
                    placeholder="Entrez la couleur"
                  />
                </View>
              )}

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>{formatCurrency(calculateTotal())}</Text>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => {
                  if (validateForm()) {
                    setStep('confirm');
                  }
                }}
              >
                <Text style={styles.submitButtonText}>Continuer</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        );

      case 'confirm':
        return (
          <ScrollView style={styles.stepContainer}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('details')}>
              <Ionicons name="arrow-back" size={24} color="#1a73e8" />
              <Text style={styles.backText}>Modifier</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>Confirmation</Text>
            <Text style={styles.stepSubtitle}>Vérifiez les informations</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Catégorie</Text>
                <Text style={styles.summaryValue}>{selectedCategory?.label}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Type de taxe</Text>
                <Text style={styles.summaryValue}>{selectedTaxType?.label}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payeur</Text>
                <Text style={styles.summaryValue}>{payerName}</Text>
              </View>
              {payerPhone && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Téléphone</Text>
                  <Text style={styles.summaryValue}>{payerPhone}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Quantité</Text>
                <Text style={styles.summaryValue}>{quantity}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Prix unitaire</Text>
                <Text style={styles.summaryValue}>{formatCurrency(parseFloat(customAmount) || 0)}</Text>
              </View>
              {chassisNumber && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>N° Châssis</Text>
                  <Text style={styles.summaryValue}>{chassisNumber}</Text>
                </View>
              )}
              {vehicleColor && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Couleur</Text>
                  <Text style={styles.summaryValue}>{vehicleColor}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(calculateTotal())}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isSaving && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.submitButtonText}>Confirmer le paiement</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        {['category', 'type', 'details', 'confirm'].map((s, index) => (
          <View key={s} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                index <= ['category', 'type', 'details', 'confirm'].indexOf(step)
                  ? styles.progressDotActive
                  : styles.progressDotInactive,
              ]}
            />
            {index < 3 && (
              <View
                style={[
                  styles.progressLine,
                  index < ['category', 'type', 'details', 'confirm'].indexOf(step)
                    ? styles.progressLineActive
                    : styles.progressLineInactive,
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {renderStep()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  progressDotActive: {
    backgroundColor: '#1a73e8',
  },
  progressDotInactive: {
    backgroundColor: '#ddd',
  },
  progressLine: {
    width: 40,
    height: 3,
    marginHorizontal: 5,
  },
  progressLineActive: {
    backgroundColor: '#1a73e8',
  },
  progressLineInactive: {
    backgroundColor: '#ddd',
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  backText: {
    color: '#1a73e8',
    fontSize: 16,
    marginLeft: 5,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionContent: {
    flex: 1,
    marginLeft: 15,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
  },
  optionAmount: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '600',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    borderRadius: 12,
    padding: 20,
    marginVertical: 20,
  },
  totalLabel: {
    fontSize: 18,
    color: '#333',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    marginBottom: 40,
  },
  buttonDisabled: {
    backgroundColor: '#a0c4f1',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    borderBottomWidth: 0,
    marginTop: 10,
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
});
