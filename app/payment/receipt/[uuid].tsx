import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { getPaymentByUuid, getTaxCategorieById, getTaxTypeById } from '../../../src/database';
import { LocalPaymentQueue } from '../../../src/types';
import { useAuth } from '../../../src/contexts';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../../src/theme';

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export default function ReceiptScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { profile } = useAuth();
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      case 'PENDING': return 'En attente de synchronisation';
      case 'FAILED': return 'Échec de synchronisation';
      default: return status;
    }
  };

  const handleShare = async () => {
    if (!payment) return;

    const message = `
REÇU DE PAIEMENT DE TAXE
========================
Réf: ${payment.server_receipt_no || payment.local_uuid.substring(0, 8).toUpperCase()}
Date: ${formatDate(payment.paid_at)}

Payeur: ${payment.payer_name}
${payment.payer_phone ? `Tél: ${payment.payer_phone}` : ''}

Type: ${payment.typeLabel}
Catégorie: ${payment.categoryLabel}
Quantité: ${payment.quantity}
Prix unitaire: ${formatCurrency(payment.unit_price)}
${payment.installment_number ? `\nTranche: ${payment.installment_number} / ${payment.installment_total}` : ''}

${payment.installment_number ? `TRANCHE ${payment.installment_number}/${payment.installment_total}: ` : 'TOTAL: '}${formatCurrency(payment.total_amount)}

Agent: ${profile?.fullname}
ID Agent: ${profile?.user_uid}
========================
    `.trim();

    try {
      await Share.share({ message });
    } catch (error) {
      console.error('Erreur partage:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.errorContainer}>
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
    <ScrollView style={styles.container}>
      {/* Status banner */}
      <View style={[styles.statusBanner, { backgroundColor: getStatusColor(payment.status) }]}>
        <Ionicons 
          name={payment.status === 'SYNCED' ? 'checkmark-circle' : payment.status === 'PENDING' ? 'time' : 'close-circle'} 
          size={20} 
          color="#fff" 
        />
        <Text style={styles.statusBannerText}>{getStatusLabel(payment.status)}</Text>
      </View>

      {/* Receipt card */}
      <View style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptTitle}>REÇU DE PAIEMENT</Text>
          <Text style={styles.receiptNumber}>
            {payment.server_receipt_no || `#${payment.local_uuid.substring(0, 8).toUpperCase()}`}
          </Text>
        </View>

        {/* QR Code */}
        <View style={styles.qrContainer}>
          <QRCode
            value={qrData}
            size={150}
            backgroundColor="#fff"
            color="#000"
          />
        </View>

        {/* Details */}
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

          {payment.installment_number && (
            <>
              <View style={styles.separator} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tranche</Text>
                <Text style={[styles.detailValue, { color: Colors.primary, fontWeight: '700' as const }]}>
                  {payment.installment_number} / {payment.installment_total}
                </Text>
              </View>
            </>
          )}

          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>
              {payment.installment_number ? `TRANCHE ${payment.installment_number}/${payment.installment_total}` : 'TOTAL'}
            </Text>
            <Text style={styles.totalAmount}>{formatCurrency(payment.total_amount)}</Text>
          </View>
        </View>

        {/* Agent info */}
        <View style={styles.agentInfo}>
          <Text style={styles.agentLabel}>Agent collecteur</Text>
          <Text style={styles.agentName}>{profile?.fullname}</Text>
          {profile?.zone && <Text style={styles.agentId}>Zone: {profile.zone}</Text>}
          <Text style={styles.agentId}>ID: {profile?.user_uid}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <LinearGradient
            colors={[Colors.accentGreen, '#00C96F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shareButtonGradient}
          >
            <Ionicons name="share-outline" size={24} color={Colors.textPrimary} />
            <Text style={styles.shareButtonText}>Partager le reçu</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Link href="/payment/new" asChild>
          <TouchableOpacity style={styles.newPaymentButton}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.newPaymentButtonGradient}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.textPrimary} />
              <Text style={styles.newPaymentButtonText}>Nouveau paiement</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Link>

        <Link href="/(tabs)/home" asChild>
          <TouchableOpacity style={styles.homeButton}>
            <Ionicons name="home-outline" size={24} color={Colors.textSecondary} />
            <Text style={styles.homeButtonText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
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
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  statusBannerText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.sm,
  },
  receiptCard: {
    backgroundColor: Colors.backgroundCard,
    margin: Spacing.md,
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
    paddingBottom: Spacing.xxl,
  },
  shareButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.md,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  shareButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  newPaymentButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.md,
  },
  newPaymentButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  newPaymentButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  homeButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});
