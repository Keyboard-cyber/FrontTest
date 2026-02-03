import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth, useSync } from '../../src/contexts';
import { getPaymentByUuid, getTaxCategorieById, getTaxTypeById, getLocalTerminal } from '../../src/database';
import { receiptService } from '../../src/services/receipt.service';
import { LocalPaymentQueue } from '../../src/types';
import { Colors, Shadows } from '../../src/theme';
import { scale, rs, rf, rr, hp } from '../../src/utils/responsive';

export default function ReceiptScreen() {
  const router = useRouter();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { profile } = useAuth();
  const { syncPayments, isOnline } = useSync();
  
  const [payment, setPayment] = useState<LocalPaymentQueue | null>(null);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [typeLabel, setTypeLabel] = useState('');
  const [terminalUid, setTerminalUid] = useState('');
  const [receiptLines, setReceiptLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    loadPaymentData();
  }, [uuid]);

  const loadPaymentData = async () => {
    if (!uuid) return;
    
    try {
      const paymentData = await getPaymentByUuid(uuid);
      if (paymentData) {
        setPayment(paymentData);
        
        const category = await getTaxCategorieById(paymentData.tax_categorie_id);
        const type = await getTaxTypeById(paymentData.tax_type_id);
        const terminal = await getLocalTerminal();
        
        setCategoryLabel(category?.label || 'N/A');
        setTypeLabel(type?.label || 'N/A');
        setTerminalUid(terminal?.terminal_uid || `T-${paymentData.terminal_id}`);
        
        // Générer le reçu
        const lines = receiptService.generateReceipt({
          payment: paymentData,
          agentName: profile?.fullname || 'Agent',
          agentZone: profile?.zone || 'Zone',
          categoryLabel: category?.label || 'N/A',
          typeLabel: type?.label || 'N/A',
          terminalUid: terminal?.terminal_uid,
          agentUid: profile?.user_uid,
          cityName: profile?.zone?.toUpperCase() || 'KOLWEZI',
        });
        setReceiptLines(lines);
      }
    } catch (error) {
      console.error('Erreur chargement paiement:', error);
    } finally {
      setLoading(false);
    }
  };

  // Synchroniser avant impression pour obtenir le numéro de reçu serveur
  const syncBeforePrint = async (): Promise<boolean> => {
    if (!payment) return false;
    
    // Si déjà synchronisé (a un server_receipt_no), pas besoin de re-sync
    if (payment.status === 'SYNCED' && payment.server_receipt_no) {
      return true;
    }
    
    // Si pas en ligne, impossible de synchroniser
    if (!isOnline) {
      Alert.alert(
        '📴 Mode hors ligne',
        'Impossible de synchroniser. L\'impression utilisera le numéro local.',
        [{ text: 'OK' }]
      );
      return true; // Permettre l'impression quand même
    }
    
    setSyncing(true);
    try {
      const result = await syncPayments();
      
      if (result.synced > 0) {
        // Recharger le paiement pour obtenir les nouvelles données
        await loadPaymentData();
        return true;
      } else if (result.failed > 0) {
        Alert.alert(
          '⚠️ Synchronisation échouée',
          'Impossible de synchroniser. L\'impression utilisera les données locales.',
          [{ text: 'OK' }]
        );
        return true; // Permettre l'impression quand même
      }
      
      return true;
    } catch (error) {
      console.error('Erreur sync:', error);
      Alert.alert(
        '⚠️ Erreur',
        'Erreur lors de la synchronisation. L\'impression utilisera les données locales.',
        [{ text: 'OK' }]
      );
      return true;
    } finally {
      setSyncing(false);
    }
  };

  const handlePrint = async () => {
    if (!payment) return;
    
    setIsPrinting(true);
    
    try {
      // 1. Synchroniser d'abord pour obtenir le numéro de reçu serveur
      await syncBeforePrint();
      
      // 2. Recharger les données après sync
      const updatedPayment = await getPaymentByUuid(uuid!);
      const paymentToPrint = updatedPayment || payment;
      
      const receiptText = receiptService.generateReceiptText({
        payment: paymentToPrint,
        agentName: profile?.fullname || 'Agent',
        agentZone: profile?.zone || 'Zone',
        categoryLabel,
        typeLabel,
      });
      
      // Générer les données QR
      const qrData = receiptService.generateQrData(paymentToPrint);
      
      // 3. Import du service d'impression
      const { printerService } = await import('../../src/services/printer.service');
      
      // 4. Initialiser l'imprimante
      await printerService.initialize();
      
      // 5. Imprimer le reçu avec QR code
      const success = await printerService.printReceipt(receiptText, qrData);
      
      if (success) {
        Alert.alert('✅ Succès', 'Reçu envoyé à l\'imprimante');
      }
      // Si pas de succès, pas d'alerte d'erreur (annulation ou Expo Go)
    } catch (error) {
      console.log('Erreur impression:', error);
      // Ne pas afficher d'alerte pour les erreurs d'impression sur Expo Go
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSharePDF = async () => {
    if (!payment) return;
    
    // Synchroniser d'abord
    await syncBeforePrint();
    
    // Recharger les données
    const updatedPayment = await getPaymentByUuid(uuid!);
    const paymentToShare = updatedPayment || payment;
    
    const receiptText = receiptService.generateReceiptText({
      payment: paymentToShare,
      agentName: profile?.fullname || 'Agent',
      agentZone: profile?.zone || 'Zone',
      categoryLabel,
      typeLabel,
    });
    
    // Générer les données QR
    const qrData = receiptService.generateQrData(paymentToShare);
    
    try {
      const { printerService } = await import('../../src/services/printer.service');
      const success = await printerService.shareReceipt(receiptText, qrData);
      
      if (!success) {
        // Fallback sur le partage texte
        await handleShare();
      }
    } catch (error) {
      console.error('Erreur partage PDF:', error);
      await handleShare();
    }
  };

  const handleShare = async () => {
    if (!payment) return;
    
    const receiptText = receiptService.generateReceiptText({
      payment,
      agentName: profile?.fullname || 'Agent',
      agentZone: profile?.zone || 'Zone',
      categoryLabel,
      typeLabel,
    });
    
    try {
      await Share.share({
        message: receiptText,
        title: `Reçu ${payment.server_receipt_no || payment.local_uuid.substring(0, 8)}`,
      });
    } catch (error) {
      console.error('Erreur partage:', error);
    }
  };

  const handleNewPayment = () => {
    router.replace('/payment/new');
  };

  const handleGoHome = () => {
    router.replace('/(tabs)/home');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
        <Text style={styles.errorText}>Paiement non trouvé</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleGoHome}>
          <Text style={styles.backButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.primary, Colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={handleGoHome} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="receipt-outline" size={24} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Reçu de paiement</Text>
          </View>
          <View style={styles.headerPlaceholder} />
        </View>
      </LinearGradient>

      {/* Success indicator */}
      <View style={styles.successBadge}>
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
        </View>
        <Text style={styles.successText}>Paiement enregistré</Text>
        <Text style={styles.statusText}>
          {payment.status === 'SYNCED' ? 'Synchronisé' : 'En attente de synchronisation'}
        </Text>
      </View>

      {/* Receipt Preview */}
      <ScrollView style={styles.receiptContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.receiptPaper}>
          {/* Texte du reçu */}
          {receiptLines.map((line, index) => (
            <Text key={index} style={styles.receiptLine}>
              {line || ' '}
            </Text>
          ))}
          
          {/* QR Code */}
          <View style={styles.qrCodeContainer}>
            <QRCode
              value={payment.local_uuid}
              size={120}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>
          
          {/* Footer après QR */}
          <Text style={styles.receiptLine}>{SEPARATOR}</Text>
          <Text style={[styles.receiptLine, styles.receiptCenter]}>Merci.</Text>
          <Text style={styles.receiptLine}> </Text>
          <Text style={styles.receiptLine}> </Text>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={[styles.printButton, (syncing || isPrinting) && styles.printButtonDisabled]} 
          onPress={handlePrint}
          disabled={syncing || isPrinting}
        >
          <LinearGradient
            colors={(syncing || isPrinting) ? ['#9CA3AF', '#9CA3AF'] : [Colors.primary, Colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.printButtonGradient}
          >
            {(syncing || isPrinting) ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.printButtonText}>
                  {syncing ? 'Synchronisation...' : 'Impression...'}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="print-outline" size={24} color="#FFFFFF" />
                <Text style={styles.printButtonText}>Imprimer</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSharePDF}>
            <Ionicons name="document-outline" size={22} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Partager</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleNewPayment}>
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Nouveau</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Séparateur pour le reçu
const SEPARATOR = '─'.repeat(31);

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
    fontSize: rf.md,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: rs.xl,
  },
  errorText: {
    fontSize: rf.lg,
    color: Colors.textPrimary,
    marginTop: rs.md,
    marginBottom: rs.xl,
  },
  backButton: {
    paddingHorizontal: rs.xl,
    paddingVertical: rs.md,
    backgroundColor: Colors.primary,
    borderRadius: rr.md,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: rf.md,
    fontWeight: '600',
  },
  header: {
    paddingTop: hp(6),
    paddingBottom: rs.lg,
    paddingHorizontal: rs.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs.sm,
  },
  headerTitle: {
    fontSize: rf.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerPlaceholder: {
    width: scale(40),
  },
  successBadge: {
    alignItems: 'center',
    paddingVertical: rs.lg,
    backgroundColor: Colors.backgroundCard,
    marginHorizontal: rs.lg,
    marginTop: -rs.md,
    borderRadius: rr.lg,
    ...Shadows.sm,
  },
  successIconContainer: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: `${Colors.success}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: rf.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: rs.sm,
  },
  statusText: {
    fontSize: rf.sm,
    color: Colors.textSecondary,
    marginTop: rs.xs,
  },
  receiptContainer: {
    flex: 1,
    marginHorizontal: rs.lg,
    marginTop: rs.md,
  },
  receiptPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: rr.md,
    padding: rs.md,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  receiptLine: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: scale(11),
    lineHeight: scale(14),
    color: '#000000',
  },
  receiptCenter: {
    textAlign: 'center',
  },
  qrCodeContainer: {
    alignItems: 'center',
    paddingVertical: rs.md,
    backgroundColor: '#FFFFFF',
  },
  actionsContainer: {
    padding: rs.lg,
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  printButton: {
    borderRadius: rr.md,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  printButtonDisabled: {
    opacity: 0.7,
  },
  printButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs.md,
    gap: rs.sm,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontSize: rf.md,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    marginTop: rs.md,
    gap: rs.md,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs.md,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: rr.md,
    gap: rs.xs,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: rf.sm,
    fontWeight: '600',
  },
});
