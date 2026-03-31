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
import { useAuth, useSync, usePayment } from '../../src/contexts';
import { useSyncWithPaymentUpdates } from '../../src/hooks';
import { notificationService } from '../../src/services/notification.service';
import { 
  getTaxCategories, 
  getTaxTypes, 
  addPaymentToQueue,
  getLocalTerminal,
  getIncompleteInstallment,
} from '../../src/database';
import { LocalTaxCategorie, LocalTaxType, LocalPaymentQueue } from '../../src/types';
import { Colors, Shadows } from '../../src/theme';
import { scale, rs, rf, rr, wp } from '../../src/utils/responsive';

export default function NewPaymentScreen() {
  const { profile } = useAuth();
  const { refreshData, isOnline, syncPayments } = useSyncWithPaymentUpdates();
  const { addPaymentToUI } = usePayment();

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
  
  // Paiement par tranche
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState(2);
  const [installmentNumber, setInstallmentNumber] = useState(1);
  const [installmentAmount, setInstallmentAmount] = useState('');
  // Tranche existante en cours de complétion
  const [existingGroupId, setExistingGroupId] = useState<string | null>(null);
  const [isContinuation, setIsContinuation] = useState(false);

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
    // Reset tranche continuation state
    setExistingGroupId(null);
    setIsContinuation(false);
    setIsInstallment(false);
    setInstallmentNumber(1);
    setInstallmentTotal(2);
    setInstallmentAmount('');
    setStep('details');
  };

  // Vérifie s'il y a une tranche incomplète pour ce payeur + taxe
  const checkIncompleteInstallment = async () => {
    if (!selectedTaxType || !payerName.trim()) return;
    try {
      const result = await getIncompleteInstallment(payerName.trim(), selectedTaxType.tax_type_id);
      if (result && result.paidCount < result.total) {
        const nextNumber = result.paidCount + 1;
        Alert.alert(
          'Tranche en cours',
          `${payerName} a déjà payé ${result.paidCount}/${result.total} tranche(s) pour "${selectedTaxType.label}". Voulez-vous continuer avec la tranche ${nextNumber} ?`,
          [
            { text: 'Non', style: 'cancel' },
            {
              text: 'Oui, continuer',
              onPress: () => {
                setIsInstallment(true);
                setIsContinuation(true);
                setExistingGroupId(result.groupId);
                setInstallmentNumber(nextNumber);
                setInstallmentTotal(result.total);
                // Pré-remplir le montant de la tranche avec celui de la dernière tranche payée
                const lastPayment = result.payments[result.payments.length - 1];
                if (lastPayment) {
                  setInstallmentAmount(lastPayment.total_amount.toString());
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Erreur vérification tranche:', error);
    }
  };

  const calculateTotal = (): number => {
    if (isInstallment && installmentAmount) {
      return parseFloat(installmentAmount) || 0;
    }
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

    if (isInstallment) {
      const trancheAmount = parseFloat(installmentAmount);
      if (isNaN(trancheAmount) || trancheAmount <= 0) {
        Alert.alert('Erreur', 'Veuillez entrer le montant de la tranche');
        return false;
      }
      if (trancheAmount >= parseFloat(customAmount)) {
        Alert.alert('Erreur', 'Le montant de la tranche doit être inférieur au montant total');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !profile || !selectedCategory || !selectedTaxType) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const fullAmount = parseFloat(customAmount);
      const unitPrice = isInstallment ? parseFloat(installmentAmount) : fullAmount;
      
      const terminal = await getLocalTerminal();
      const terminalId = terminal?.terminal_id || 1;

      // Générer un group_id commun si paiement par tranche
      const installmentGroupId = isInstallment
        ? (existingGroupId || uuidv4())
        : null;

      const uuid = uuidv4();
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
        installment_number: isInstallment ? installmentNumber : null,
        installment_total: isInstallment ? installmentTotal : null,
        installment_group_id: installmentGroupId,
        created_at: now,
      };

      // 1. Ajouter le paiement localement (historique)
      await addPaymentToQueue(payment);
      
      // Émettre l'événement pour mettre à jour l'historique en temps réel
      addPaymentToUI(payment);
      
      // Notification locale
      await notificationService.notifyPaymentSuccess(unitPrice, payerName);
      
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

      // 4. Naviguer vers la page de prévisualisation avant impression
      router.replace({
        pathname: '/payment/preview/[uuid]',
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
    setIsInstallment(false);
    setInstallmentTotal(2);
    setInstallmentNumber(1);
    setInstallmentAmount('');
    setExistingGroupId(null);
    setIsContinuation(false);
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
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
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
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
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
              contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
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
                    onBlur={checkIncompleteInstallment}
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
                  <Text style={[styles.input, { color: Colors.textPrimary, paddingVertical: rs.md }]}>
                    {formatCurrency(parseFloat(customAmount) || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Numéro de châssis {selectedTaxType?.require_chassis_number === 1 ? '*' : '(optionnel)'}
                </Text>
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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Couleur du véhicule {selectedTaxType?.require_color === 1 ? '*' : '(optionnel)'}
                </Text>
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

              {/* Option paiement par tranche */}
              <View style={styles.installmentSection}>
                <TouchableOpacity 
                  style={styles.installmentToggle}
                  onPress={() => {
                    if (isContinuation) return; // Ne pas désactiver si continuation
                    setIsInstallment(!isInstallment);
                  }}
                  activeOpacity={isContinuation ? 1 : 0.7}
                >
                  <View style={styles.installmentToggleLeft}>
                    <Ionicons 
                      name={isInstallment ? 'checkbox' : 'square-outline'} 
                      size={22} 
                      color={isInstallment ? Colors.primary : Colors.textMuted} 
                    />
                    <Text style={styles.installmentToggleText}>Paiement par tranche</Text>
                  </View>
                  <Ionicons 
                    name="layers-outline" 
                    size={20} 
                    color={isInstallment ? Colors.primary : Colors.textMuted} 
                  />
                </TouchableOpacity>

                {isInstallment && (
                  <View style={styles.installmentDetails}>
                    {isContinuation && (
                      <View style={{ backgroundColor: 'rgba(26, 115, 232, 0.1)', padding: rs.md, borderRadius: 8, marginBottom: rs.md, flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="information-circle" size={20} color={Colors.primary} />
                        <Text style={{ color: Colors.primary, marginLeft: 8, flex: 1, fontSize: rf.sm }}>
                          Continuation de tranche existante ({installmentNumber}/{installmentTotal})
                        </Text>
                      </View>
                    )}
                    <View style={styles.installmentRow}>
                      <View style={styles.installmentField}>
                        <Text style={styles.label}>Tranche n°</Text>
                        <View style={[styles.installmentCounter, isContinuation && { opacity: 0.5 }]}>
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => !isContinuation && setInstallmentNumber(Math.max(1, installmentNumber - 1))}
                            disabled={isContinuation}
                          >
                            <Ionicons name="remove" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <Text style={styles.counterValue}>{installmentNumber}</Text>
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => !isContinuation && setInstallmentNumber(Math.min(installmentTotal, installmentNumber + 1))}
                            disabled={isContinuation}
                          >
                            <Ionicons name="add" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.installmentField}>
                        <Text style={styles.label}>Nombre total de tranches</Text>
                        <View style={[styles.installmentCounter, isContinuation && { opacity: 0.5 }]}>
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => {
                              if (isContinuation) return;
                              const newTotal = Math.max(2, installmentTotal - 1);
                              setInstallmentTotal(newTotal);
                              if (installmentNumber > newTotal) setInstallmentNumber(newTotal);
                            }}
                            disabled={isContinuation}
                          >
                            <Ionicons name="remove" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <Text style={styles.counterValue}>{installmentTotal}</Text>
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => !isContinuation && setInstallmentTotal(Math.min(12, installmentTotal + 1))}
                            disabled={isContinuation}
                          >
                            <Ionicons name="add" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Montant de la tranche *</Text>
                      <View style={styles.inputWrapper}>
                        <Text style={styles.currencyPrefix}>FC</Text>
                        <TextInput
                          style={styles.input}
                          value={installmentAmount}
                          onChangeText={setInstallmentAmount}
                          placeholder="Montant à payer pour cette tranche"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                    <View style={styles.installmentInfo}>
                      <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                      <Text style={styles.installmentInfoText}>
                        Tranche {installmentNumber} sur {installmentTotal} — Montant total : {formatCurrency(parseFloat(customAmount) || 0)}.
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total à payer{isInstallment ? ` (tranche ${installmentNumber}/${installmentTotal})` : ''}</Text>
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
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
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
                <Text style={styles.summaryLabel}>Montant total taxe</Text>
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
              {isInstallment && (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tranche</Text>
                    <Text style={[styles.summaryValue, { color: Colors.primary }]}>
                      {installmentNumber} / {installmentTotal}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Montant tranche</Text>
                    <Text style={[styles.summaryValue, { color: Colors.accentGreen, fontWeight: '700' }]}>
                      {formatCurrency(parseFloat(installmentAmount) || 0)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            <LinearGradient
              colors={['rgba(123, 97, 255, 0.15)', 'rgba(0, 217, 255, 0.1)']}
              style={styles.totalCard}
            >
              <Text style={styles.totalCardLabel}>
                Montant{isInstallment ? ` (tranche ${installmentNumber}/${installmentTotal})` : ' total'}
              </Text>
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
    marginTop: rs.md,
    color: Colors.textSecondary,
    fontSize: rf.md,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: rs.lg,
    backgroundColor: Colors.backgroundSecondary,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
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
    width: scale(30),
    height: 2,
    marginHorizontal: rs.xs,
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
    padding: rs.lg,
  },
  stepTitle: {
    fontSize: rf.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: rs.xs,
  },
  stepSubtitle: {
    fontSize: rf.md,
    color: Colors.textSecondary,
    marginBottom: rs.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rs.lg,
    gap: rs.sm,
  },
  backText: {
    color: Colors.primary,
    fontSize: rf.md,
    fontWeight: '500',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xl,
    padding: rs.lg,
    marginBottom: rs.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionIconContainer: {
    width: scale(44),
    height: scale(44),
    borderRadius: rr.md,
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    marginLeft: rs.md,
  },
  optionText: {
    flex: 1,
    fontSize: rf.lg,
    color: Colors.textPrimary,
    marginLeft: rs.md,
    fontWeight: '500',
  },
  optionAmount: {
    fontSize: rf.sm,
    color: Colors.accentGreen,
    fontWeight: '600',
    marginTop: rs.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs.xxl * 2,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: rs.md,
    fontSize: rf.md,
  },
  inputGroup: {
    marginBottom: rs.lg,
  },
  label: {
    fontSize: rf.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: rs.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: {
    paddingLeft: rs.md,
  },
  currencyPrefix: {
    paddingLeft: rs.md,
    color: Colors.textMuted,
    fontSize: rf.md,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    padding: rs.md,
    fontSize: rf.lg,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
  },
  totalContainer: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xl,
    padding: rs.xl,
    marginVertical: rs.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: rf.md,
    color: Colors.textSecondary,
    marginBottom: rs.sm,
  },
  totalAmount: {
    fontSize: rf.hero,
    fontWeight: '700',
    color: Colors.primary,
  },
  submitButton: {
    borderRadius: rr.lg,
    overflow: 'hidden',
    marginBottom: rs.lg,
    ...Shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs.md + 2,
    paddingHorizontal: rs.xl,
    gap: rs.sm,
  },
  submitButtonText: {
    color: Colors.textPrimary,
    fontSize: rf.lg,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xl,
    padding: rs.lg,
    marginBottom: rs.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: rs.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    fontSize: rf.md,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: rf.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  totalCard: {
    borderRadius: rr.xl,
    padding: rs.xl,
    marginBottom: rs.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalCardLabel: {
    fontSize: rf.md,
    color: Colors.textSecondary,
    marginBottom: rs.sm,
  },
  totalCardAmount: {
    fontSize: rf.hero,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  // Styles paiement par tranche
  installmentSection: {
    marginBottom: rs.lg,
  },
  installmentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.lg,
    padding: rs.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  installmentToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs.sm,
  },
  installmentToggleText: {
    fontSize: rf.md,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  installmentDetails: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.lg,
    padding: rs.md,
    marginTop: rs.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  installmentRow: {
    flexDirection: 'row',
    gap: rs.md,
  },
  installmentField: {
    flex: 1,
  },
  installmentCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderRadius: rr.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: rs.xs,
  },
  counterButton: {
    padding: rs.md,
  },
  counterValue: {
    fontSize: rf.xl,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: scale(36),
    textAlign: 'center',
  },
  installmentInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rs.xs,
    marginTop: rs.md,
    paddingTop: rs.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  installmentInfoText: {
    flex: 1,
    fontSize: rf.sm,
    color: Colors.textMuted,
    lineHeight: rf.sm * 1.5,
  },
});
