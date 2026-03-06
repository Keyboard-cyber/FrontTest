/**
 * Service de génération QR Code pour les paiements
 * Utilise react-native-qrcode-svg pour le rendu
 * Fonctionne 100% offline avec toutes les informations de paiement
 */

import { LocalPaymentQueue } from '../types';

// ============================================
// Types pour les données QR
// ============================================

/**
 * Structure des données encodées dans le QR code
 * Format compact pour optimiser la taille du QR
 */
export interface QRPaymentData {
  /** Version du format QR (pour évolutions futures) */
  v: number;
  /** UUID local du paiement */
  id: string;
  /** Numéro de reçu serveur (si synchronisé) */
  rn?: string;
  /** Nom du payeur */
  pn: string;
  /** Téléphone du payeur */
  pt?: string;
  /** Montant total */
  am: number;
  /** Quantité */
  qt: number;
  /** Prix unitaire */
  up: number;
  /** ID service */
  sv: number;
  /** ID catégorie taxe */
  tc?: number;
  /** ID type taxe */
  tt: number;
  /** Numéro châssis (véhicules) */
  cn?: string;
  /** Couleur véhicule */
  vc?: string;
  /** Date paiement (timestamp) */
  pd: number;
  /** ID agent */
  ag: number;
  /** ID terminal */
  tm: number;
  /** Statut sync: 0=PENDING, 1=SYNCED, 2=FAILED */
  st: number;
  /** Signature HMAC pour vérification */
  sg: string;
}

/**
 * Options pour la génération QR
 */
export interface QRCodeOptions {
  size?: number;
  backgroundColor?: string;
  color?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  includeSignature?: boolean;
}

// ============================================
// Clé secrète pour signature (en prod: utiliser une clé sécurisée)
// ============================================
const SIGNATURE_SECRET = 'TAXE_MOBILE_2024_SECRET_KEY';

// ============================================
// Service QR Code
// ============================================

class QRCodeService {
  /**
   * Génère une signature HMAC simple pour les données de paiement
   * Compatible offline - utilise un hash simple mais efficace
   */
  private generateSignature(data: Omit<QRPaymentData, 'sg'>): string {
    // Créer une chaîne de données à signer
    const dataString = [
      data.v,
      data.id,
      data.pn,
      data.am,
      data.pd,
      data.ag,
      data.tm,
      SIGNATURE_SECRET
    ].join('|');

    // Hash simple mais efficace (djb2 + rotation)
    let hash = 5381;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) + hash + char) >>> 0; // hash * 33 + char
      hash = ((hash << 13) | (hash >>> 19)) >>> 0; // rotation
    }

    // Convertir en base36 pour signature compacte
    return hash.toString(36).toUpperCase();
  }

  /**
   * Convertit un paiement local en données QR compactes
   */
  paymentToQRData(payment: LocalPaymentQueue, includeSignature: boolean = true): QRPaymentData {
    const statusMap: Record<string, number> = {
      'PENDING': 0,
      'SYNCED': 1,
      'FAILED': 2
    };

    const data: Omit<QRPaymentData, 'sg'> = {
      v: 1,
      id: payment.local_uuid,
      pn: payment.payer_name,
      am: payment.total_amount,
      qt: payment.quantity,
      up: payment.unit_price,
      sv: payment.service_id,
      tt: payment.tax_type_id,
      pd: new Date(payment.paid_at).getTime(),
      ag: payment.user_id,
      tm: payment.terminal_id,
      st: statusMap[payment.status] || 0,
    };

    // Champs optionnels
    if (payment.server_receipt_no) data.rn = payment.server_receipt_no;
    if (payment.payer_phone) data.pt = payment.payer_phone;
    if (payment.tax_categorie_id) data.tc = payment.tax_categorie_id;
    if (payment.chassis_number) data.cn = payment.chassis_number;
    if (payment.vehicle_color) data.vc = payment.vehicle_color;

    // Ajouter la signature
    const signature = includeSignature ? this.generateSignature(data) : '';

    return { ...data, sg: signature };
  }

  /**
   * Génère la chaîne JSON compacte pour le QR code
   */
  generateQRString(payment: LocalPaymentQueue): string {
    const qrData = this.paymentToQRData(payment);
    return JSON.stringify(qrData);
  }

  /**
   * Génère la chaîne QR à partir d'un UUID existant (pour compatibilité)
   * Retourne simplement l'UUID si les données de paiement ne sont pas disponibles
   */
  generateQRSignature(payment: LocalPaymentQueue): string {
    return this.generateQRString(payment);
  }

  /**
   * Vérifie la signature d'un QR code scanné
   */
  verifyQRSignature(qrData: QRPaymentData): boolean {
    const { sg, ...dataWithoutSig } = qrData;
    const expectedSignature = this.generateSignature(dataWithoutSig);
    return sg === expectedSignature;
  }

  /**
   * Parse les données QR scannées
   */
  parseQRData(qrString: string): QRPaymentData | null {
    try {
      const data = JSON.parse(qrString) as QRPaymentData;
      
      // Vérifier les champs obligatoires
      if (!data.v || !data.id || !data.pn || data.am === undefined) {
        console.warn('QRCodeService: Données QR incomplètes');
        return null;
      }

      return data;
    } catch (error) {
      console.error('QRCodeService: Erreur parsing QR:', error);
      return null;
    }
  }

  /**
   * Extrait les informations de paiement depuis un QR code
   */
  extractPaymentInfo(qrString: string): {
    isValid: boolean;
    uuid: string;
    receiptNo?: string;
    payerName: string;
    amount: number;
    paidAt: Date;
    status: 'PENDING' | 'SYNCED' | 'FAILED';
    signatureValid: boolean;
  } | null {
    const data = this.parseQRData(qrString);
    if (!data) return null;

    const statusMap: Record<number, 'PENDING' | 'SYNCED' | 'FAILED'> = {
      0: 'PENDING',
      1: 'SYNCED',
      2: 'FAILED'
    };

    return {
      isValid: true,
      uuid: data.id,
      receiptNo: data.rn,
      payerName: data.pn,
      amount: data.am,
      paidAt: new Date(data.pd),
      status: statusMap[data.st] || 'PENDING',
      signatureValid: this.verifyQRSignature(data),
    };
  }

  /**
   * Génère les props pour le composant QRCode de react-native-qrcode-svg
   */
  getQRCodeProps(payment: LocalPaymentQueue, options: QRCodeOptions = {}): {
    value: string;
    size: number;
    backgroundColor: string;
    color: string;
    ecl: 'L' | 'M' | 'Q' | 'H';
  } {
    const {
      size = 150,
      backgroundColor = '#FFFFFF',
      color = '#000000',
      errorCorrectionLevel = 'M',
      includeSignature = true,
    } = options;

    return {
      value: includeSignature 
        ? this.generateQRString(payment) 
        : JSON.stringify(this.paymentToQRData(payment, false)),
      size,
      backgroundColor,
      color,
      ecl: errorCorrectionLevel,
    };
  }

  /**
   * Génère une signature simple pour utilisation immédiate
   * Compatible avec l'ancien format qr_signature
   */
  generateSimpleSignature(payment: {
    local_uuid: string;
    payer_name: string;
    total_amount: number;
    paid_at: string;
    user_id: number;
    terminal_id: number;
  }): string {
    const data = {
      v: 1,
      id: payment.local_uuid,
      pn: payment.payer_name,
      am: payment.total_amount,
      pd: new Date(payment.paid_at).getTime(),
      ag: payment.user_id,
      tm: payment.terminal_id,
    };

    const signature = this.generateSignature(data as Omit<QRPaymentData, 'sg'>);
    
    // Format compact: UUID:SIGNATURE
    return `${payment.local_uuid}:${signature}`;
  }

  /**
   * Valide un format de signature simple
   */
  validateSimpleSignature(signatureString: string, payment: {
    local_uuid: string;
    payer_name: string;
    total_amount: number;
    paid_at: string;
    user_id: number;
    terminal_id: number;
  }): boolean {
    const [uuid, sig] = signatureString.split(':');
    if (uuid !== payment.local_uuid) return false;
    
    const expectedSignature = this.generateSimpleSignature(payment);
    return signatureString === expectedSignature;
  }
}

export const qrCodeService = new QRCodeService();
export default qrCodeService;
