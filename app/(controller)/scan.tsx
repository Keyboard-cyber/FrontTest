import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, BorderRadius } from '../../src/theme';
import { getPaymentByUuid, getTaxCategorieById, getTaxTypeById, getLocalProfile } from '../../src/database';
import { LocalPaymentQueue } from '../../src/types';
import { apiService, qrCodeService } from '../../src/services';
import type { QRPaymentData } from '../../src/services';

interface PaymentDetails extends LocalPaymentQueue {
  categoryLabel?: string;
  typeLabel?: string;
  agentName?: string;
  receiptNo?: string;
  signatureValid?: boolean;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | 'not_found' | null>(null);

  // Parser les données QR (nouveau format JSON compact)
  const parseQrData = (data: string): QRPaymentData | null => {
    // Utiliser le service QR pour parser le format JSON compact
    const qrData = qrCodeService.parseQRData(data);
    if (qrData) return qrData;

    // Fallback: ancien format pipe-separated uuid|amount|date|agentId
    if (data && data.includes('|')) {
      const parts = data.split('|');
      if (parts.length >= 4) {
        return {
          v: 0,
          id: parts[0],
          pn: 'Inconnu',
          am: parseFloat(parts[1]) || 0,
          qt: 1,
          up: parseFloat(parts[1]) || 0,
          sv: 0,
          tt: 0,
          pd: new Date(parts[2]).getTime() || Date.now(),
          ag: parseInt(parts[3]) || 0,
          tm: 0,
          st: 0,
          sg: '',
        };
      }
    }

    return null;
  };

  // Démarrer le scan
  const startScanning = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission requise', 'L\'accès à la caméra est nécessaire pour scanner les QR codes');
        return;
      }
    }
    setIsScanning(true);
    setScannedData(null);
  };

  // Gérer le scan QR
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scannedData) return;
    
    setScannedData(data);
    setIsLoading(true);

    const parsed = parseQrData(data);
    if (!parsed) {
      setVerificationResult('invalid');
      setIsLoading(false);
      setShowDetails(true);
      return;
    }

    // Vérifier la signature du QR
    const signatureValid = parsed.v >= 1 && parsed.sg ? qrCodeService.verifyQRSignature(parsed) : false;

    // Mapper le statut depuis le QR
    const statusMap: Record<number, 'PENDING' | 'SYNCED' | 'FAILED'> = {
      0: 'PENDING',
      1: 'SYNCED',
      2: 'FAILED',
    };

    try {
      // Construire le paiement à partir des données QR directement
      let payment: LocalPaymentQueue = {
        local_uuid: parsed.id,
        payer_name: parsed.pn,
        payer_phone: parsed.pt || '',
        service_id: parsed.sv,
        tax_categorie_id: parsed.tc || 0,
        tax_type_id: parsed.tt,
        quantity: parsed.qt,
        unit_price: parsed.up,
        total_amount: parsed.am,
        chassis_number: parsed.cn || null,
        vehicle_color: parsed.vc || null,
        paid_at: new Date(parsed.pd).toISOString(),
        user_id: parsed.ag,
        terminal_id: parsed.tm,
        qr_signature: data,
        status: statusMap[parsed.st] || 'PENDING',
        server_receipt_no: parsed.rn || null,
        server_payment_id: null,
        created_at: new Date(parsed.pd).toISOString(),
      };

      // Enrichir avec la DB locale ou le serveur si disponible
      const localPayment = await getPaymentByUuid(parsed.id);
      if (localPayment) {
        payment = { ...payment, ...localPayment };
      } else {
        try {
          const serverPayment = await apiService.verifyPayment(parsed.id);
          if (serverPayment) {
            payment.status = 'SYNCED';
            payment.server_receipt_no = serverPayment.receipt_no || parsed.rn || null;
            payment.server_payment_id = serverPayment.id || null;
          }
        } catch (e) {
          console.log('Vérification serveur échouée:', e);
        }
      }

      // Récupérer les labels catégorie et type
      const category = payment.tax_categorie_id ? await getTaxCategorieById(payment.tax_categorie_id) : null;
      const type = await getTaxTypeById(payment.tax_type_id);

      // Récupérer le nom de l'agent
      let agentName = `Agent #${payment.user_id}`;
      try {
        const localProfile = await getLocalProfile();
        if (localProfile && localProfile.user_id === payment.user_id) {
          agentName = localProfile.fullname;
        } else {
          const user = await apiService.getUserById(payment.user_id);
          if (user) {
            agentName = user.fullname;
          }
        }
      } catch (e) {
        console.log('Erreur récupération agent:', e);
      }

      setPaymentDetails({
        ...payment,
        categoryLabel: category?.label || undefined,
        typeLabel: type?.label || undefined,
        agentName,
        receiptNo: payment.server_receipt_no || parsed.rn || undefined,
        signatureValid,
      });
      setVerificationResult(signatureValid ? 'valid' : 'not_found');
      setShowDetails(true);
    } catch (error) {
      console.error('Erreur vérification:', error);
      setVerificationResult('invalid');
      setShowDetails(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Formater la date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Formater le montant
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FC';
  };

  // Fermer et réinitialiser
  const closeModal = () => {
    setShowDetails(false);
    setPaymentDetails(null);
    setScannedData(null);
    setVerificationResult(null);
    setIsScanning(false);
  };

  // Nouveau scan
  const newScan = () => {
    setScannedData(null);
    setVerificationResult(null);
    setPaymentDetails(null);
    setShowDetails(false);
  };

  // Écran principal (non scanning)
  const renderMainScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={60} color="#FF9500" />
        <Text style={styles.title}>Scanner QR Code</Text>
        <Text style={styles.subtitle}>Vérifiez l'authenticité des reçus de paiement</Text>
      </View>

      <View style={styles.instructionsContainer}>
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>1</Text>
          </View>
          <Text style={styles.instructionText}>Appuyez sur le bouton Scanner</Text>
        </View>
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>2</Text>
          </View>
          <Text style={styles.instructionText}>Pointez la caméra vers le QR code du reçu</Text>
        </View>
        <View style={styles.instructionItem}>
          <View style={styles.instructionNumber}>
            <Text style={styles.instructionNumberText}>3</Text>
          </View>
          <Text style={styles.instructionText}>Les détails du paiement s'afficheront</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={startScanning}>
        <Ionicons name="scan" size={28} color="#FFF" />
        <Text style={styles.scanButtonText}>Scanner un reçu</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  // Scanner actif
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
        <SafeAreaView style={styles.scannerOverlay}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setIsScanning(false)}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scannez le QR Code</Text>
            <View style={{ width: 44 }} />
          </View>
          
          <View style={styles.scanFrameContainer}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
          
          <Text style={styles.scannerHint}>
            Alignez le QR code du reçu dans le cadre
          </Text>
        </SafeAreaView>
      </CameraView>
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF9500" />
          <Text style={styles.loadingText}>Vérification en cours...</Text>
        </View>
      )}
    </View>
  );

  // Modal des détails
  const renderDetailsModal = () => (
    <Modal
      visible={showDetails}
      animationType="slide"
      transparent={true}
      onRequestClose={closeModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            {verificationResult === 'valid' && (
              <>
                <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
                <Text style={[styles.modalTitle, { color: Colors.success }]}>Paiement Vérifié</Text>
              </>
            )}
            {verificationResult === 'not_found' && (
              <>
                <Ionicons name="help-circle" size={56} color={Colors.warning} />
                <Text style={[styles.modalTitle, { color: Colors.warning }]}>Paiement Non Trouvé</Text>
                <Text style={styles.modalSubtitle}>Ce paiement n'est pas dans notre base</Text>
              </>
            )}
            {verificationResult === 'invalid' && (
              <>
                <Ionicons name="close-circle" size={56} color={Colors.error} />
                <Text style={[styles.modalTitle, { color: Colors.error }]}>QR Code Invalide</Text>
                <Text style={styles.modalSubtitle}>Ce QR code n'est pas un reçu valide</Text>
              </>
            )}
          </View>

          {paymentDetails && verificationResult !== 'invalid' && (
            <View style={styles.detailsContainer}>
              {paymentDetails.receiptNo && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>N° Reçu</Text>
                  <Text style={[styles.detailValue, { fontWeight: '700', color: '#FF9500' }]}>{paymentDetails.receiptNo}</Text>
                </View>
              )}
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payeur</Text>
                <Text style={styles.detailValue}>{paymentDetails.payer_name}</Text>
              </View>
              
              {paymentDetails.payer_phone ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Téléphone</Text>
                  <Text style={styles.detailValue}>{paymentDetails.payer_phone}</Text>
                </View>
              ) : null}
              
              {paymentDetails.categoryLabel && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Catégorie</Text>
                  <Text style={styles.detailValue}>{paymentDetails.categoryLabel}</Text>
                </View>
              )}
              
              {paymentDetails.typeLabel && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type de taxe</Text>
                  <Text style={styles.detailValue}>{paymentDetails.typeLabel}</Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantité</Text>
                <Text style={styles.detailValue}>{paymentDetails.quantity}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Prix unitaire</Text>
                <Text style={styles.detailValue}>{formatCurrency(paymentDetails.unit_price)}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Montant total</Text>
                <Text style={[styles.detailValue, styles.amountValue]}>
                  {formatCurrency(paymentDetails.total_amount)}
                </Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{formatDate(paymentDetails.paid_at)}</Text>
              </View>
              
              {paymentDetails.agentName && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Percepteur</Text>
                  <Text style={styles.detailValue}>{paymentDetails.agentName}</Text>
                </View>
              )}
              
              {paymentDetails.chassis_number && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>N° Châssis</Text>
                  <Text style={styles.detailValue}>{paymentDetails.chassis_number}</Text>
                </View>
              )}

              {paymentDetails.vehicle_color && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Couleur véhicule</Text>
                  <Text style={styles.detailValue}>{paymentDetails.vehicle_color}</Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Statut</Text>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: paymentDetails.status === 'SYNCED' ? Colors.success + '20' : paymentDetails.status === 'FAILED' ? Colors.error + '20' : Colors.warning + '20' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: paymentDetails.status === 'SYNCED' ? Colors.success : paymentDetails.status === 'FAILED' ? Colors.error : Colors.warning }
                  ]}>
                    {paymentDetails.status === 'SYNCED' ? 'Synchronisé' : paymentDetails.status === 'FAILED' ? 'Échoué' : 'En attente'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Signature</Text>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: paymentDetails.signatureValid ? Colors.success + '20' : Colors.error + '20' }
                ]}>
                  <Ionicons 
                    name={paymentDetails.signatureValid ? 'checkmark-circle' : 'close-circle'} 
                    size={14} 
                    color={paymentDetails.signatureValid ? Colors.success : Colors.error} 
                  />
                  <Text style={[
                    styles.statusText,
                    { color: paymentDetails.signatureValid ? Colors.success : Colors.error, marginLeft: 4 }
                  ]}>
                    {paymentDetails.signatureValid ? 'Valide' : 'Non vérifiée'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.uuidContainer}>
                <Text style={styles.uuidLabel}>UUID</Text>
                <Text style={styles.uuidValue}>{paymentDetails.local_uuid}</Text>
              </View>
            </View>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={styles.newScanButton}
              onPress={newScan}
            >
              <Ionicons name="scan" size={20} color="#FF9500" />
              <Text style={styles.newScanButtonText}>Nouveau scan</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.closeModalButton}
              onPress={closeModal}
            >
              <Text style={styles.closeModalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {isScanning ? renderScanner() : renderMainScreen()}
      {renderDetailsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  instructionsContainer: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  instructionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF9500' + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  instructionNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF9500',
  },
  instructionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    flex: 1,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    marginHorizontal: 24,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    gap: 12,
  },
  scanButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
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
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  closeButton: {
    padding: 8,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  scanFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: '#FF9500',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scannerHint: {
    fontSize: 14,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 60,
    paddingHorizontal: 40,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
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
    maxHeight: '90%',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
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
    color: '#FF9500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  modalButtons: {
    marginTop: 24,
    gap: 12,
  },
  newScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500' + '15',
    borderRadius: BorderRadius.md,
    height: 50,
    gap: 8,
  },
  newScanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
  },
  closeModalButton: {
    backgroundColor: '#FF9500',
    borderRadius: BorderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
