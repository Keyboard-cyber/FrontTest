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
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { v4 as uuidv4 } from 'uuid';
import { useAuth, useSync } from '../../src/contexts';
import { 
  getTaxCategories, 
  getTaxTypes, 
  addPaymentToQueue,
  getLocalTerminal,
} from '../../src/database';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue } from '../../src/types';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../src/theme';

export default function NewPaymentScreen() {
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
      // Récupérer TOUTES les catégories stockées localement
      // (elles sont déjà filtrées par les services de l'agent lors de la sync)
      const cats = await getTaxCategories();
      console.log(`Chargé ${cats.length} catégories de taxes`);
      setCategories(cats);
      
      const types = await getTaxTypes();
      console.log(`Chargé ${types.length} types de taxes`);
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
    const amount = parseFloat(customAmount) || 0;
    return amount;
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
      
      const terminal = await getLocalTerminal();
      const terminalId = terminal?.terminal_id || 1;

      const payment: LocalPaymentQueue = {
        local_uuid: uuid,
        payer_name: payerName.trim(),
        payer_phone: payerPhone.trim() || null,
        service_id: profile.service_id,
        tax_categorie_id: selectedCategory.tax_categorie_id,
        tax_type_id: selectedTaxType.tax_type_id,
        quantity: 1,
        unit_price: unitPrice,
        total_amount: unitPrice,
        chassis_number: chassisNumber.trim() || null,
        vehicle_color: vehicleColor.trim() || null,
        paid_at: now,
        user_id: profile.user_id,
        terminal_id: terminalId,
        qr_signature: `${uuid}|${unitPrice}|${now}|${profile.user_id}`,
        status: 'PENDING',
        server_receipt_no: null,
        server_payment_id: null,
        created_at: now,
      };

      // 1. Ajouter le paiement localement (historique)
      await addPaymentToQueue(payment);
      
      // 2. Synchroniser OBLIGATOIREMENT avant impression
      let syncSuccess = false;
      if (isOnline) {
        try {
          const syncResult = await syncPayments();
          syncSuccess = syncResult.synced > 0;
          
          if (!syncSuccess && syncResult.failed > 0) {
            Alert.alert(
              '⚠️ Synchronisation échouée',
              'Le paiement est enregistré localement mais n\'a pas pu être synchronisé. Réessayez plus tard.',
              [{ text: 'OK' }]
            );
          }
        } catch (syncError) {
          console.error('Erreur sync:', syncError);
          Alert.alert(
            '⚠️ Synchronisation échouée',
            'Le paiement est enregistré localement. La synchronisation sera tentée automatiquement.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          '📴 Mode hors ligne',
          'Paiement enregistré localement. Il sera synchronisé dès que la connexion sera disponible.',
          [{ text: 'OK' }]
        );
      }
      
      // 3. Rafraîchir les données pour obtenir le numéro de reçu du serveur
      await refreshData();

      // 4. Naviguer vers le reçu (avec données synchronisées si possible)
      router.replace({
        pathname: '/payment/receipt',
        params: { uuid: uuid }
      });
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
    setCustomAmount('');
    setChassisNumber('');
    setVehicleColor('');
    setStep('category');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FC';
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 'category':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          >
            <Text style={styles.stepTitle}>Catégorie</Text>
            <Text style={styles.stepSubtitle}>Sélectionnez une catégorie de taxe</Text>
            {categories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Aucune catégorie disponible</Text>
              </View>
            ) : (
              categories.map((cat) => (
                <TouchableOpacity
                  key={cat.tax_categorie_id}
                  style={styles.optionCard}
                  onPress={() => handleCategorySelect(cat)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIconContainer}>
                    <Ionicons name="folder-outline" size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.optionText}>{cat.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        );

      case 'type':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          >
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('category')}>
              <Ionicons name="arrow-back" size={20} color={Colors.primary} />
              <Text style={styles.backText}>Retour</Text>
            </TouchableOpacity>
            <Text style={styles.stepTitle}>{selectedCategory?.label}</Text>
            <Text style={styles.stepSubtitle}>Sélectionnez le type de taxe</Text>
            
            {filteredTaxTypes.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Aucun type de taxe disponible</Text>
              </View>
            ) : (
              filteredTaxTypes.map((type) => (
                <TouchableOpacity
                  key={type.tax_type_id}
                  style={styles.optionCard}
                  onPress={() => handleTaxTypeSelect(type)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionIconContainer, { backgroundColor: 'rgba(0, 245, 160, 0.15)' }]}>
                    <Ionicons name="pricetag-outline" size={22} color={Colors.accentGreen} />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionText}>{type.label}</Text>
                    {type.amount ? (
                      <Text style={styles.optionAmount}>{formatCurrency(type.amount)}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        );

      case 'details':
        return (
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView 
              style={styles.stepContainer} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
            >
              <TouchableOpacity style={styles.backButton} onPress={() => setStep('type')}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backText}>Retour</Text>
              </TouchableOpacity>
              
              <Text style={styles.stepTitle}>{selectedTaxType?.label}</Text>
              <Text style={styles.stepSubtitle}>Informations du paiement</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nom du payeur *</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={payerName}
                    onChangeText={setPayerName}
                    placeholder="Entrez le nom"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Téléphone</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={payerPhone}
                    onChangeText={setPayerPhone}
                    placeholder="Numéro de téléphone"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Montant *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.border }]}>
                  <Text style={styles.currencyPrefix}>FC</Text>
                  <Text style={[styles.input, { color: Colors.textPrimary, paddingVertical: Spacing.md }]}>
                    {formatCurrency(parseFloat(customAmount) || 0)}
                  </Text>
                </View>
              </View>

              {selectedTaxType?.require_chassis_number === 1 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Numéro de châssis *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="car-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={chassisNumber}
                      onChangeText={setChassisNumber}
                      placeholder="Entrez le numéro de châssis"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>
              )}

              {selectedTaxType?.require_color === 1 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Couleur du véhicule *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="color-palette-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={vehicleColor}
                      onChangeText={setVehicleColor}
                      placeholder="Entrez la couleur"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>
              )}

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total à payer</Text>
                <Text style={styles.totalAmount}>{formatCurrency(calculateTotal())}</Text>
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => {
                  if (validateForm()) {
                    setStep('confirm');
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitButtonGradient}
                >
                  <Text style={styles.submitButtonText}>Continuer</Text>
                  <Ionicons name="arrow-forward" size={20} color={Colors.textPrimary} />
                </LinearGradient>
              </TouchableOpacity>
              
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        );

      case 'confirm':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          >
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('details')}>
              <Ionicons name="arrow-back" size={20} color={Colors.primary} />
              <Text style={styles.backText}>Modifier</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>Confirmation</Text>
            <Text style={styles.stepSubtitle}>Vérifiez les informations avant de valider</Text>

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
                <Text style={styles.summaryLabel}>Montant</Text>
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
            </View>

            <LinearGradient
              colors={['rgba(123, 97, 255, 0.15)', 'rgba(0, 217, 255, 0.1)']}
              style={styles.totalCard}
            >
              <Text style={styles.totalCardLabel}>Montant total</Text>
              <Text style={styles.totalCardAmount}>{formatCurrency(calculateTotal())}</Text>
            </LinearGradient>

            <TouchableOpacity
              style={[styles.submitButton, isSaving && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.accentGreen, '#00A87D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitButtonGradient}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                    <Text style={[styles.submitButtonText, { color: '#FFFFFF' }]}>Confirmer le paiement</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
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
            >
              {index < ['category', 'type', 'details', 'confirm'].indexOf(step) && (
                <Ionicons name="checkmark" size={10} color="#FFFFFF" />
              )}
            </View>
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  progressDotInactive: {
    backgroundColor: Colors.backgroundCard,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  progressLine: {
    width: 30,
    height: 2,
    marginHorizontal: Spacing.xs,
  },
  progressLineActive: {
    backgroundColor: Colors.primary,
  },
  progressLineInactive: {
    backgroundColor: Colors.border,
  },
  stepContainer: {
    flex: 1,
  },
  stepContentPadding: {
    padding: Spacing.lg,
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  backText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
    fontWeight: FontWeights.medium,
  },
  optionAmount: {
    fontSize: FontSizes.sm,
    color: Colors.accentGreen,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: {
    paddingLeft: Spacing.md,
  },
  currencyPrefix: {
    paddingLeft: Spacing.md,
    color: Colors.textMuted,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
  },
  input: {
    flex: 1,
    padding: Spacing.md,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
  },
  totalContainer: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginVertical: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  totalAmount: {
    fontSize: FontSizes.hero,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  submitButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  submitButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
  },
  summaryCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  totalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalCardLabel: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  totalCardAmount: {
    fontSize: FontSizes.hero,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
});
