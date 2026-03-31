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
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { getPaymentByUuid, getTaxCategorieById, getTaxTypeById } from '../../database';
import { LocalPaymentQueue } from '../../types';
import { useAuth } from '../../contexts';

interface Props {
  route: { params: { paymentUuid: string } };
  navigation: any;
}

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
}

export const ReceiptScreen: React.FC<Props> = ({ route, navigation }) => {
  const { paymentUuid } = route.params;
  const { profile } = useAuth();
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPayment();
  }, [paymentUuid]);

  const loadPayment = async () => {
    try {
      const p = await getPaymentByUuid(paymentUuid);
      if (p) {
        // Récupérer la catégorie seulement si tax_categorie_id n'est pas null
        const category = p.tax_categorie_id ? await getTaxCategorieById(p.tax_categorie_id) : null;
        const type = await getTaxTypeById(p.tax_type_id);
        setPayment({
          ...p,
          categoryLabel: category?.label || 'Taxe directe',
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
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
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
        return 'En attente de synchronisation';
      case 'FAILED':
        return 'Échec de synchronisation';
      default:
        return status;
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

TOTAL: ${formatCurrency(payment.total_amount)}

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
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={60} color="#ea4335" />
        <Text style={styles.errorText}>Paiement non trouvé</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Le QR code contient la signature pour vérification
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

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Prix unitaire</Text>
            <Text style={styles.detailValue}>{formatCurrency(payment.unit_price)}</Text>
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
                <Text style={[styles.detailValue, { color: '#1a73e8', fontWeight: '700' }]}>
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
          <Text style={styles.agentId}>ID: {profile?.user_uid}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color="#fff" />
          <Text style={styles.shareButtonText}>Partager le reçu</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.newPaymentButton} 
          onPress={() => navigation.navigate('NewPayment')}
        >
          <Ionicons name="add-circle-outline" size={24} color="#1a73e8" />
          <Text style={styles.newPaymentButtonText}>Nouveau paiement</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginTop: 15,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1a73e8',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  statusBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  receiptCard: {
    backgroundColor: '#fff',
    margin: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  receiptHeader: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#1a73e8',
    borderStyle: 'dashed',
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  receiptNumber: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  detailsContainer: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    textAlign: 'right',
    flex: 1,
    marginLeft: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    marginTop: 20,
    marginHorizontal: -20,
    marginBottom: -20,
    padding: 20,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  agentInfo: {
    padding: 15,
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  agentLabel: {
    fontSize: 12,
    color: '#666',
  },
  agentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  agentId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  actionsContainer: {
    padding: 15,
    paddingBottom: 30,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  newPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#1a73e8',
  },
  newPaymentButtonText: {
    color: '#1a73e8',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});
