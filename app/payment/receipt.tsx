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
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../src/theme';

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
      
      // 3. Import du service d'impression
      const { printerService } = await import('../../src/services/printer.service');
      
      // 4. Initialiser l'imprimante
      await printerService.initialize();
      
      // 5. Imprimer le reçu (ouvre le dialogue d'impression Android)
      const success = await printerService.printReceipt(receiptText, {
        cutPaper: true,
      });
      
      if (success) {
        Alert.alert('✅ Succès', 'Reçu envoyé à l\'imprimante');
      }
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('❌ Erreur', 'Erreur lors de l\'impression: ' + String(error));
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
    
    try {
      const { printerService } = await import('../../src/services/printer.service');
      const success = await printerService.shareReceipt(receiptText);
      
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
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  backButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  header: {
    paddingTop: 50,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: '#FFFFFF',
  },
  headerPlaceholder: {
    width: 40,
  },
  successBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.backgroundCard,
    marginHorizontal: Spacing.lg,
    marginTop: -Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.success}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  statusText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  receiptContainer: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  receiptPaper: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
    // Simule le papier thermique
    borderWidth: 1,
    borderColor: Colors.border,
  },
  receiptLine: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    lineHeight: 14,
    color: '#000000',
  },
  receiptCenter: {
    textAlign: 'center',
  },
  qrCodeContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: '#FFFFFF',
  },
  actionsContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  printButton: {
    borderRadius: BorderRadius.md,
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
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  secondaryActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
});
