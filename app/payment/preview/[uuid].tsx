import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { getPaymentByUuid, getTaxCategorieById, getTaxTypeById } from '../../../src/database';
import { LocalPaymentQueue } from '../../../src/types';
import { useAuth } from '../../../src/contexts';
import { printerService } from '../../../src/services/printer.service';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../../src/theme';

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export default function PrintPreviewScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { profile } = useAuth();
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    loadPayment();
  }, [uuid]);

  const loadPayment = async () => {
    try {
      const p = await getPaymentByUuid(uuid);
      if (p) {
        const category = await getTaxCategorieById(p.tax_categorie_id);
        const type = await getTaxTypeById(p.tax_type_id);
        setPayment({
          ...p,
          categoryLabel: category?.label || 'N/A',
          typeLabel: type?.label || 'N/A',
        });
      }
    } catch (error) {
      console.error('Erreur chargement paiement:', error);
    } finally {
      setIsLoading(false);
    }
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
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handlePrint = async () => {
    if (!payment || !profile) return;

    setIsPrinting(true);
    try {
      const success = await printerService.print({
        payment,
        agentName: profile.fullname,
        agentZone: profile.zone,
        categoryLabel: payment.categoryLabel || 'N/A',
        typeLabel: payment.typeLabel || 'N/A',
      });

      if (success) {
        // Naviguer vers le reçu après impression réussie
        router.replace({
          pathname: '/payment/receipt/[uuid]',
          params: { uuid: uuid },
        });
      }
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer le reçu');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSkip = () => {
    // Naviguer vers le reçu sans imprimer
    router.replace({
      pathname: '/payment/receipt/[uuid]',
      params: { uuid: uuid },
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement du reçu...</Text>
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="alert-circle" size={60} color={Colors.error} />
        <Text style={styles.errorText}>Paiement non trouvé</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.backButtonGradient}
          >
            <Text style={styles.backButtonText}>Retour</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  const qrData = payment.qr_signature;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Ionicons name="print-outline" size={28} color="#fff" />
          <Text style={styles.headerTitle}>Aperçu avant impression</Text>
        </View>
        <Text style={styles.headerSubtitle}>Vérifiez les informations avant d'imprimer</Text>
      </LinearGradient>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Success indicator */}
        <View style={styles.successBanner}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
          </View>
          <Text style={styles.successText}>Paiement enregistré avec succès!</Text>
        </View>

        {/* Receipt Preview Card */}
        <View style={styles.receiptPreview}>
          <View style={styles.receiptHeader}>
            <Text style={styles.receiptTitle}>REÇU DE PAIEMENT</Text>
            <Text style={styles.receiptNumber}>
              {payment.server_receipt_no || `#${payment.local_uuid.substring(0, 8).toUpperCase()}`}
            </Text>
          </View>

          {/* QR Code Preview */}
          <View style={styles.qrContainer}>
            <QRCode
              value={qrData}
              size={100}
              backgroundColor="#fff"
              color="#000"
            />
          </View>

          {/* Details Preview */}
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(payment.paid_at)}</Text>
            </View>

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payeur</Text>
              <Text style={styles.detailValue}>{payment.payer_name}</Text>
            </View>

            {payment.payer_phone && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Téléphone</Text>
                <Text style={styles.detailValue}>{payment.payer_phone}</Text>
              </View>
            )}

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Catégorie</Text>
              <Text style={styles.detailValue}>{payment.categoryLabel}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type de taxe</Text>
              <Text style={styles.detailValue}>{payment.typeLabel}</Text>
            </View>

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Quantité</Text>
              <Text style={styles.detailValue}>{payment.quantity}</Text>
            </View>

            {payment.chassis_number && (
              <>
                <View style={styles.separator} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>N° Châssis</Text>
                  <Text style={styles.detailValue}>{payment.chassis_number}</Text>
                </View>
              </>
            )}

            {payment.vehicle_color && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Couleur</Text>
                <Text style={styles.detailValue}>{payment.vehicle_color}</Text>
              </View>
            )}

            {/* Total */}
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalAmount}>{formatCurrency(payment.total_amount)}</Text>
            </View>
          </View>

          {/* Agent info */}
          <View style={styles.agentInfo}>
            <Text style={styles.agentLabel}>Agent collecteur</Text>
            <Text style={styles.agentName}>{profile?.fullname}</Text>
            {profile?.zone && <Text style={styles.agentId}>Zone: {profile.zone}</Text>}
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Print button */}
        <TouchableOpacity 
          style={styles.printButton} 
          onPress={handlePrint}
          disabled={isPrinting}
        >
          <LinearGradient
            colors={[Colors.accentGreen, '#00A87D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.printButtonGradient}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="print" size={24} color="#fff" />
            )}
            <Text style={styles.printButtonText}>
              {isPrinting ? 'Impression...' : 'Imprimer le reçu'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Skip button */}
        <TouchableOpacity 
          style={styles.skipButton} 
          onPress={handleSkip}
          disabled={isPrinting}
        >
          <Text style={styles.skipButtonText}>Continuer sans imprimer</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
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
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: FontSizes.lg,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  backButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadows.md,
  },
  backButtonGradient: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  header: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: Spacing.xs,
    marginLeft: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 200, 150, 0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 150, 0.3)',
  },
  successIconContainer: {
    marginRight: Spacing.md,
  },
  successText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.success,
  },
  receiptPreview: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.lg,
  },
  receiptHeader: {
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
  },
  receiptTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
    letterSpacing: 2,
  },
  receiptNumber: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  qrContainer: {
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  detailsContainer: {
    padding: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  detailLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: Spacing.lg,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.3)',
  },
  totalLabel: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  totalAmount: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
  },
  agentInfo: {
    alignItems: 'center',
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
  },
  agentLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  agentName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  agentId: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionsContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  printButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.md,
  },
  printButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  printButtonText: {
    color: '#fff',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  skipButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
  },
});
