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
  getServices,
  getServiceIds,
  addPaymentToQueue,
  getLocalTerminalForUser,
  getIncompleteInstallment,
} from '../../src/database';
import { LocalService, LocalTaxCategorie, LocalTaxType, LocalPaymentQueue } from '../../src/types';
import { Colors, Shadows } from '../../src/theme';
import { scale, rs, rf, rr, wp } from '../../src/utils/responsive';

const MAX_QUANTITY = 999;
const MAX_QUANTITY_INPUT_LENGTH = String(MAX_QUANTITY).length;

const MIN_INSTALLMENT_TOTAL = 2;
const MAX_INSTALLMENT_TOTAL = 12;
const INSTALLMENT_INPUT_LENGTH = String(MAX_INSTALLMENT_TOTAL).length;

type Step = 'service' | 'directType' | 'category' | 'type' | 'details' | 'confirm';

const DIRECT_TAX_FLOW: Step[] = ['service', 'directType', 'category', 'type', 'details', 'confirm'];
const CATEGORY_FLOW: Step[] = ['service', 'category', 'type', 'details', 'confirm'];
const DIRECT_ONLY_FLOW: Step[] = ['service', 'directType', 'type', 'details', 'confirm'];
const SINGLE_SERVICE_FLOW: Step[] = ['category', 'type', 'details', 'confirm'];
const SINGLE_DIRECT_FLOW: Step[] = ['directType', 'type', 'details', 'confirm'];

// Une taxe directe n'appartient à aucune catégorie
const isDirectTaxType = (type: LocalTaxType): boolean =>
  type.tax_categorie_id === null || type.tax_categorie_id === 0;

const hasDirectTaxes = (types: LocalTaxType[], service: LocalService): boolean =>
  types.some((t) => t.service_id === service.service_id && isDirectTaxType(t));

export default function NewPaymentScreen() {
  const { profile } = useAuth();
  const { refreshData, isOnline, syncPayments } = useSyncWithPaymentUpdates();
  const { addPaymentToUI } = usePayment();

  const [categories, setCategories] = useState<LocalTaxCategorie[]>([]);
  const [taxTypes, setTaxTypes] = useState<LocalTaxType[]>([]);
  const [filteredTaxTypes, setFilteredTaxTypes] = useState<LocalTaxType[]>([]);
  const [services, setServices] = useState<LocalService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [selectedService, setSelectedService] = useState<LocalService | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LocalTaxCategorie | null>(null);
  const [selectedTaxType, setSelectedTaxType] = useState<LocalTaxType | null>(null);
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [chassisNumber, setChassisNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  
  // Paiement par tranche
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState(MIN_INSTALLMENT_TOTAL);
  const [installmentNumberInput, setInstallmentNumberInput] = useState('1');
  const [installmentTotalInput, setInstallmentTotalInput] = useState(String(MIN_INSTALLMENT_TOTAL));
  const [installmentNumber, setInstallmentNumber] = useState(1);
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [installmentAmountTouched, setInstallmentAmountTouched] = useState(false);
  // Tranche existante en cours de complétion
  const [existingGroupId, setExistingGroupId] = useState<string | null>(null);
  const [isContinuation, setIsContinuation] = useState(false);

  // Étape du formulaire
  const [step, setStep] = useState<Step>('service');

  // L'étape service n'a de sens que si l'agent est rattaché à plusieurs services
  const hasServiceStep = services.length > 1;

  // Taxes directes (sans catégorie) et catégories du service sélectionné
  const directTaxTypes = selectedService
    ? taxTypes.filter((t) => t.service_id === selectedService.service_id && isDirectTaxType(t))
    : [];
  const visibleCategories = selectedService
    ? categories.filter((cat) => cat.service_id === selectedService.service_id)
    : categories;

  // Un service qui n'a que des taxes directes saute l'étape catégories
  const skipCategoryStep = Boolean(selectedService) && visibleCategories.length === 0;

  const progressSteps = !selectedService
    ? hasServiceStep
      ? CATEGORY_FLOW
      : SINGLE_SERVICE_FLOW
    : hasServiceStep
    ? skipCategoryStep
      ? DIRECT_ONLY_FLOW
      : DIRECT_TAX_FLOW
    : skipCategoryStep
    ? SINGLE_DIRECT_FLOW
    : SINGLE_SERVICE_FLOW;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Services assignés à l'agent (noms via local_services, ids via le profil)
      const [storedServices, assignedIds] = await Promise.all([
        getServices(),
        getServiceIds(),
      ]);

      const assignedIdSet = new Set(assignedIds);
      const knownServices =
        storedServices.length > 0
          ? storedServices
          : assignedIds.map((id) => ({
              service_id: id,
              name: `Service #${id}`,
              code: '',
              saved_at: '',
            }));

      const assignedServices =
        assignedIds.length > 0
          ? knownServices.filter((s) => assignedIdSet.has(s.service_id))
          : knownServices;

      assignedServices.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      setServices(assignedServices);
      console.log(`Chargé ${assignedServices.length} services assignés`);

      // Un seul service : pas d'étape de sélection, on enchaîne directement
      const preselected = assignedServices.length === 1 ? assignedServices[0] : null;
      setSelectedService(preselected);

      // Elles sont déjà filtrées par les services de l'agent lors de la sync
      const serviceFilter = assignedServices.length > 0
        ? assignedServices.map((s) => s.service_id)
        : undefined;

      const [cats, types] = await Promise.all([
        getTaxCategories(serviceFilter),
        getTaxTypes(),
      ]);
      console.log(`Chargé ${cats.length} catégories de taxes`);
      setCategories(cats);
      setTaxTypes(types);
      console.log(`Chargé ${types.length} types de taxes`);

      // Point d'entrée : service à choisir si l'agent est rattaché à plusieurs
      // services, taxes directes si le service en propose, sinon les catégories.
      // Sans service assigné, on retombe sur toutes les catégories.
      if (assignedServices.length > 1) {
        setStep('service');
      } else if (preselected && hasDirectTaxes(types, preselected)) {
        setStep('directType');
      } else {
        setStep('category');
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      Alert.alert('Erreur', 'Impossible de charger les données');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceSelect = (service: LocalService) => {
    setSelectedService(service);
    setSelectedCategory(null);
    setSelectedTaxType(null);
    setFilteredTaxTypes([]);
    // Taxes directes d'abord si le service en propose, sinon les catégories
    setStep(hasDirectTaxes(taxTypes, service) ? 'directType' : 'category');
  };

  // Une taxe directe n'a pas de catégorie : on enchaîne sur les détails
  const handleDirectTypeSelect = (taxType: LocalTaxType) => {
    setSelectedCategory(null);
    handleTaxTypeSelect(taxType);
  };

  // Passage direct → catégories quand le service en propose aussi
  const handleContinueToCategories = () => {
    setSelectedCategory(null);
    setSelectedTaxType(null);
    setStep('category');
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
    setInstallmentTotalValue(MIN_INSTALLMENT_TOTAL);
    setInstallmentNumberValue(1);
    setInstallmentAmount('');
    setInstallmentAmountTouched(false);
    setQuantityValue(1);
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
                setInstallmentTotalValue(result.total);
                setInstallmentNumberValue(nextNumber);
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

  // Prix unitaire de la taxe : le montant saisi, jamais celui d'une tranche
  const unitPrice = (): number => parseFloat(customAmount) || 0;

  // Montant global de la facture : unitaire × quantité
  const billTotal = (): number => unitPrice() * quantity;

  // Montant réellement encaissé par ce paiement
  const collectedAmount = (): number =>
    isInstallment ? parseFloat(installmentAmount) || 0 : billTotal();

  const clampQuantity = (value: number): number =>
    Math.min(MAX_QUANTITY, Math.max(1, value));

  // Les boutons −/+ et la saisie manuelle passent par ici pour rester synchro
  const setQuantityValue = (value: number) => {
    const clamped = clampQuantity(value);
    setQuantity(clamped);
    setQuantityInput(String(clamped));
  };

  const handleQuantityChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    // Champ vidé : on tolère l'état vide le temps de la saisie
    if (digits === '') {
      setQuantityInput('');
      setQuantity(1);
      return;
    }
    setQuantityValue(parseInt(digits, 10));
  };

  // Le numéro de tranche ne peut pas dépasser le nombre total de tranches
  const setInstallmentNumberValue = (value: number) => {
    const clamped = Math.min(installmentTotal, Math.max(1, value));
    setInstallmentNumber(clamped);
    setInstallmentNumberInput(String(clamped));
  };

  // Réduire le total recale le numéro de tranche s'il dépasse
  const setInstallmentTotalValue = (value: number) => {
    const clamped = Math.min(MAX_INSTALLMENT_TOTAL, Math.max(MIN_INSTALLMENT_TOTAL, value));
    setInstallmentTotal(clamped);
    setInstallmentTotalInput(String(clamped));
    if (installmentNumber > clamped) {
      setInstallmentNumber(clamped);
      setInstallmentNumberInput(String(clamped));
    }
  };

  const handleInstallmentNumberChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits === '') {
      setInstallmentNumberInput('');
      setInstallmentNumber(1);
      return;
    }
    setInstallmentNumberValue(parseInt(digits, 10));
  };

  const handleInstallmentTotalChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits === '') {
      setInstallmentTotalInput('');
      setInstallmentTotal(MIN_INSTALLMENT_TOTAL);
      return;
    }
    setInstallmentTotalValue(parseInt(digits, 10));
  };

  // Part de tranche : montant global (unitaire × quantité) divisé par le nombre
  // de tranches. L'agent reste libre de la modifier manuellement.
  const suggestedInstallmentAmount = (): number => {
    const total = billTotal();
    if (total <= 0) return 0;
    if (isContinuation) return 0;
    return Math.max(1, Math.floor((total / installmentTotal) * 100) / 100);
  };

  // La tranche se recalcule sur le montant global tant que l'agent ne l'a pas saisie
  useEffect(() => {
    if (!isInstallment) return;
    setInstallmentAmountTouched(false);
  }, [customAmount, quantity, installmentTotal, isInstallment]);

  useEffect(() => {
    if (!isInstallment || installmentAmountTouched || isContinuation) return;
    const suggested = suggestedInstallmentAmount();
    setInstallmentAmount(suggested > 0 ? String(suggested) : '');
  }, [isInstallment, installmentAmountTouched, customAmount, quantity, installmentTotal, isContinuation]);

  const calculateTotal = (): number => collectedAmount();

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

    if (!Number.isInteger(quantity) || quantity < 1) {
      Alert.alert('Erreur', 'La quantité doit être un entier supérieur ou égal à 1');
      return false;
    }
    if (quantity > MAX_QUANTITY) {
      Alert.alert('Erreur', `La quantité ne peut pas dépasser ${MAX_QUANTITY}`);
      return false;
    }

    // min_amount / max_amount portent sur le prix unitaire de la taxe
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
        Alert.alert('Erreur', 'Veuillez entrer un montant de tranche valide');
        return false;
      }
      // Montant global = unitaire × quantité, base du découpage en tranches
      const total = billTotal();
      if (total <= 0) {
        Alert.alert('Erreur', 'Le montant global doit être supérieur à zéro');
        return false;
      }
      if (trancheAmount >= total) {
        Alert.alert(
          'Erreur',
          `Le montant de la tranche doit être inférieur au montant global (${formatCurrency(total)})`
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !profile || !selectedTaxType) return;
    if (!selectedService && !selectedCategory) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      // unit_price = prix unitaire de la taxe, total_amount = montant encaissé
      // (la tranche en mode installment, sinon unitaire × quantité)
      const qty = quantity;
      const unitPriceValue = unitPrice();
      const totalAmount = collectedAmount();
      
      // Un agent sans terminal assigné ne peut pas encaisser : on bloque
      // explicitement plutôt que d'envoyer un terminal_id arbitraire.
      const terminal = await getLocalTerminalForUser(profile.user_id);
      if (!terminal) {
        throw new Error(
          'Aucun terminal assigné. Synchronisez votre compte ou contactez votre administrateur pour obtenir un terminal.'
        );
      }
      if (terminal.is_blocked) {
        throw new Error('Ce terminal est bloqué. Contactez votre administrateur.');
      }
      const terminalId = terminal.terminal_id;

      // Générer un group_id commun si paiement par tranche
      const installmentGroupId = isInstallment
        ? (existingGroupId || uuidv4())
        : null;

      const uuid = uuidv4();
      const payment: LocalPaymentQueue = {
        local_uuid: uuid,
        payer_name: payerName.trim(),
        payer_phone: payerPhone.trim() || null,
        service_id: selectedService?.service_id ?? selectedCategory?.service_id ?? profile.service_id,
        tax_categorie_id: selectedCategory?.tax_categorie_id ?? null,
        tax_type_id: selectedTaxType.tax_type_id,
        quantity: qty,
        unit_price: unitPriceValue,
        total_amount: totalAmount,
        chassis_number: chassisNumber.trim() || null,
        vehicle_color: vehicleColor.trim() || null,
        paid_at: now,
        user_id: profile.user_id,
        terminal_id: terminalId,
        qr_signature: `${uuid}|${totalAmount}|${now}|${profile.user_id}`,
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
      await notificationService.notifyPaymentSuccess(totalAmount, payerName);
      
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
    } catch (error: any) {
      console.error('Erreur enregistrement:', error);
      // Les erreurs métier (terminal absent, blocage) portent leur message
      Alert.alert('Erreur', error?.message || 'Impossible d\'enregistrer le paiement');
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
    setQuantityValue(1);
    setChassisNumber('');
    setVehicleColor('');
    setIsInstallment(false);
    setInstallmentTotalValue(MIN_INSTALLMENT_TOTAL);
    setInstallmentNumberValue(1);
    setInstallmentAmount('');
    setInstallmentAmountTouched(false);
    setExistingGroupId(null);
    setIsContinuation(false);
    // Le service choisi est conservé quand il n'y en a qu'un (préalélectionné)
    if (hasServiceStep) {
      setSelectedService(null);
      setFilteredTaxTypes([]);
    }
    setStep(progressSteps[0]);
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
      case 'service':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
          >
            <Text style={styles.stepTitle}>Service</Text>
            <Text style={styles.stepSubtitle}>Sélectionnez le service pour afficher ses catégories</Text>
            {services.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Aucun service assigné</Text>
              </View>
            ) : (
              services.map((service) => (
              <TouchableOpacity
                key={service.service_id}
                style={styles.optionCard}
                onPress={() => handleServiceSelect(service)}
                activeOpacity={0.7}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name="business-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionText}>{service.name}</Text>
                  {service.code ? (
                    <Text style={styles.optionAmount}>{service.code}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ))
            )}
          </ScrollView>
        );

      case 'directType':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
          >
            {hasServiceStep ? (
              <TouchableOpacity style={styles.backButton} onPress={() => setStep('service')}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backText}>Changer de service</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.stepTitle}>Taxe directe</Text>
            <Text style={styles.stepSubtitle}>
              {selectedService
                ? `${selectedService.name} · Taxes sans catégorie`
                : 'Sélectionnez une taxe directe'}
            </Text>
            {directTaxTypes.map((type) => (
              <TouchableOpacity
                key={type.tax_type_id}
                style={styles.optionCard}
                onPress={() => handleDirectTypeSelect(type)}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconContainer, { backgroundColor: 'rgba(0, 245, 160, 0.15)' }]}>
                  <Ionicons name="flash-outline" size={22} color={Colors.accentGreen} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionText}>{type.label}</Text>
                  {type.amount ? (
                    <Text style={styles.optionAmount}>{formatCurrency(type.amount)}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
            {/* Les taxes directes n'ont pas de catégorie, mais le service peut
                en proposer d'autres : sans ce bouton l'étape catégories était
                inaccessible depuis l'écran des taxes directes. */}
            {visibleCategories.length > 0 ? (
              <TouchableOpacity
                style={styles.continueCard}
                onPress={handleContinueToCategories}
                activeOpacity={0.7}
              >
                <Ionicons name="folder-outline" size={22} color={Colors.primary} />
                <View style={styles.optionContent}>
                  <Text style={styles.continueText}>Voir les autres catégories</Text>
                  <Text style={styles.continueSubtext}>
                    {visibleCategories.length} catégorie(s) sur ce service
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        );

      case 'category':
        return (
          <ScrollView 
            style={styles.stepContainer} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: rs.lg, paddingBottom: 40 }}
          >
            {directTaxTypes.length > 0 ? (
              <TouchableOpacity style={styles.backButton} onPress={() => setStep('directType')}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backText}>Taxes directes</Text>
              </TouchableOpacity>
            ) : hasServiceStep ? (
              <TouchableOpacity style={styles.backButton} onPress={() => setStep('service')}>
                <Ionicons name="arrow-back" size={20} color={Colors.primary} />
                <Text style={styles.backText}>Changer de service</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.stepTitle}>Catégorie</Text>
            <Text style={styles.stepSubtitle}>
              {selectedService
                ? `${selectedService.name} · Sélectionnez une catégorie de taxe`
                : 'Sélectionnez une catégorie de taxe'}
            </Text>
            {visibleCategories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Aucune catégorie disponible pour ce service</Text>
              </View>
            ) : (
              visibleCategories.map((cat) => (
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
                <Text style={styles.label}>Montant unitaire *</Text>
                <View style={[styles.inputWrapper, { backgroundColor: Colors.border }]}>
                  <Text style={styles.currencyPrefix}>FC</Text>
                  <Text style={[styles.input, { color: Colors.textPrimary, paddingVertical: rs.md }]}>
                    {formatCurrency(parseFloat(customAmount) || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Quantité *</Text>
                <View style={styles.installmentCounter}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setQuantityValue(quantity - 1)}
                    disabled={quantity <= 1}
                  >
                    <Ionicons
                      name="remove"
                      size={18}
                      color={quantity <= 1 ? Colors.textMuted : Colors.primary}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.counterInput}
                    value={quantityInput}
                    onChangeText={handleQuantityChange}
                    editable
                    keyboardType="number-pad"
                    maxLength={MAX_QUANTITY_INPUT_LENGTH}
                    selectTextOnFocus
                    placeholder="1"
                    placeholderTextColor={Colors.textMuted}
                    accessibilityLabel="Quantité"
                  />
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setQuantityValue(quantity + 1)}
                    disabled={quantity >= MAX_QUANTITY}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={quantity >= MAX_QUANTITY ? Colors.textMuted : Colors.primary}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.installmentInfoText}>
                  Total : {formatCurrency(calculateTotal())}
                  {isInstallment ? ` · Montant global : ${formatCurrency(billTotal())}` : ''}
                </Text>
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
                            onPress={() => !isContinuation && setInstallmentNumberValue(installmentNumber - 1)}
                            disabled={isContinuation}
                          >
                            <Ionicons name="remove" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <TextInput
                            style={styles.counterInput}
                            value={installmentNumberInput}
                            onChangeText={handleInstallmentNumberChange}
                            editable={!isContinuation}
                            keyboardType="number-pad"
                            maxLength={INSTALLMENT_INPUT_LENGTH}
                            selectTextOnFocus
                            placeholder="1"
                            placeholderTextColor={Colors.textMuted}
                            accessibilityLabel="Numéro de tranche"
                          />
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => !isContinuation && setInstallmentNumberValue(installmentNumber + 1)}
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
                            onPress={() => !isContinuation && setInstallmentTotalValue(installmentTotal - 1)}
                            disabled={isContinuation}
                          >
                            <Ionicons name="remove" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <TextInput
                            style={styles.counterInput}
                            value={installmentTotalInput}
                            onChangeText={handleInstallmentTotalChange}
                            editable={!isContinuation}
                            keyboardType="number-pad"
                            maxLength={INSTALLMENT_INPUT_LENGTH}
                            selectTextOnFocus
                            placeholder={String(MIN_INSTALLMENT_TOTAL)}
                            placeholderTextColor={Colors.textMuted}
                            accessibilityLabel="Nombre total de tranches"
                          />
                          <TouchableOpacity 
                            style={styles.counterButton}
                            onPress={() => !isContinuation && setInstallmentTotalValue(installmentTotal + 1)}
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
                          onChangeText={(text) => {
                            setInstallmentAmountTouched(true);
                            setInstallmentAmount(text);
                          }}
                          placeholder="Montant à payer pour cette tranche"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                    <View style={styles.installmentInfo}>
                      <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                      <Text style={styles.installmentInfoText}>
                        Tranche {installmentNumber} sur {installmentTotal} — Montant total :{' '}
                        {formatCurrency(billTotal())} ({formatCurrency(unitPrice())} × {quantity}).
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
              {selectedService && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Service</Text>
                  <Text style={styles.summaryValue}>{selectedService.name}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Catégorie</Text>
                <Text style={styles.summaryValue}>{selectedCategory?.label ?? 'Taxe directe'}</Text>
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
                <Text style={styles.summaryLabel}>Prix unitaire</Text>
                <Text style={styles.summaryValue}>{formatCurrency(parseFloat(customAmount) || 0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Quantité</Text>
                <Text style={styles.summaryValue}>{quantity}</Text>
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
        {progressSteps.map((s, index) => (
          <View key={s} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                index <= progressSteps.indexOf(step)
                  ? styles.progressDotActive
                  : styles.progressDotInactive,
              ]}
            >
              {index < progressSteps.indexOf(step) && (
                <Ionicons name="checkmark" size={10} color="#FFFFFF" />
              )}
            </View>
            {index < progressSteps.length - 1 && (
              <View
                style={[
                  styles.progressLine,
                  index < progressSteps.indexOf(step)
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
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xl,
    padding: rs.lg,
    marginTop: rs.sm,
    marginBottom: rs.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  continueText: {
    fontSize: rf.lg,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  continueSubtext: {
    fontSize: rf.sm,
    color: Colors.textMuted,
    marginTop: 2,
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
  counterInput: {
    fontSize: rf.xl,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: scale(56),
    paddingVertical: 0,
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
