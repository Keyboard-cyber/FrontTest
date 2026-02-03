/**
 * Service d'impression de reçus
 * Génère des PDF avec QR code pour l'impression thermique
 */

import { Platform, PermissionsAndroid } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { qrCodeService } from './qrcode.service';


interface SignatureInfo {
  uuid: string;
  amount: string;
  date: string;
  agentId: string;
}

class PrinterService {
  private initialized = false;
  private isPrinting = false;

  /**
   * Initialise le service (demande les permissions si nécessaire)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        ] as any);
      } catch (e) {
        console.warn('Permissions Bluetooth non accordées');
      }
    }

    this.initialized = true;
    return true;
  }

  /**
   * Parse les données de signature QR
   */
  private parseSignature(qrData: string): SignatureInfo | null {
    if (!qrData || !qrData.includes('|')) {
      return null;
    }

    const parts = qrData.split('|');
    if (parts.length < 4) {
      return null;
    }

    return {
      uuid: parts[0],
      amount: parts[1],
      date: parts[2],
      agentId: parts[3],
    };
  }

  /**
   * Formate la date pour l'affichage
   */
  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate.substring(0, 10);
    }
  }

  /**
   * Génère le HTML du reçu avec QR code
   */
  private async generateHTML(receiptText: string, qrData?: string): Promise<string> {
    const qrSize = 150;
    let qrHtml = '';

    // Générer le QR code si données présentes
    if (qrData && qrData.trim()) {
      console.log('=== Génération QR Code ===');
      console.log('Données:', qrData);

      // Utiliser le service QR professionnel
      qrHtml = await qrCodeService.toHtml(qrData, qrSize);

      if (qrHtml) {
        console.log('QR Code HTML généré avec succès');
      } else {
        console.warn('Échec génération QR Code');
      }
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      line-height: 1.4;
      padding: 4mm;
      width: 58mm;
      background: white;
    }
    
    .receipt-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      margin-bottom: 10px;
    }
    
    .qr-section {
      text-align: center;
      margin: 15px 0;
      padding: 10px;
      border: 1px dashed #333;
      background: #fafafa;
    }
    
    .qr-code {
      display: flex;
      justify-content: center;
      margin: 10px 0;
    }
    
    .qr-code img {
      width: ${qrSize}px;
      height: ${qrSize}px;
    }
    
    .footer {
      text-align: center;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #333;
      font-size: 9pt;
    }
    
    .footer-thanks {
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="receipt-content">${receiptText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  
  ${qrData ? `
  <div class="qr-section">
    ${qrHtml ? `<div class="qr-code">${qrHtml}</div>` : '<p style="color:red;">QR non disponible</p>'}
  </div>
  ` : ''}
  
  <div class="footer">
    <div class="footer-thanks">Merci</div>
  </div>
</body>
</html>`;
  }

  /**
   * Imprime le reçu
   */
  async print(receiptText: string, qrData?: string): Promise<boolean> {
    // Éviter les appels multiples simultanés
    if (this.isPrinting) {
      console.log('Impression déjà en cours, ignoré');
      return false;
    }

    this.isPrinting = true;
    await this.initialize();

    console.log('=== IMPRESSION ===');
    console.log('QR Data:', qrData);

    try {
      const html = await this.generateHTML(receiptText, qrData);

      if (!html) {
        console.error('HTML vide');
        this.isPrinting = false;
        return false;
      }

      await Print.printAsync({ html });
      console.log('Impression terminée');
      this.isPrinting = false;
      return true;
    } catch (error: any) {
      this.isPrinting = false;
      const msg = error?.message || String(error);

      // Gestion des annulations (normal)
      if (
        msg.includes('cancel') ||
        msg.includes('did not complete') ||
        msg.includes('User canceled') ||
        msg.includes('already in progress')
      ) {
        console.log('Impression annulée par utilisateur');
        return false;
      }

      console.error('Erreur impression:', msg);
      return false;
    }
  }

  /**
   * Génère un PDF du reçu
   */
  async generatePDF(receiptText: string, qrData?: string): Promise<string | null> {
    console.log('=== GÉNÉRATION PDF ===');
    console.log('QR Data:', qrData);

    try {
      const html = await this.generateHTML(receiptText, qrData);

      if (!html) {
        throw new Error('HTML vide');
      }

      const result = await Print.printToFileAsync({ html });

      if (!result?.uri) {
        throw new Error('Génération PDF échouée');
      }

      console.log('PDF généré:', result.uri);
      return result.uri;
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      return null;
    }
  }

  /**
   * Partage le reçu en PDF
   */
  async shareReceipt(receiptText: string, qrData?: string): Promise<boolean> {
    try {
      const uri = await this.generatePDF(receiptText, qrData);

      if (!uri) {
        console.error('Impossible de générer le PDF');
        return false;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        console.warn('Partage non disponible');
        return false;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Partager le reçu',
      });

      return true;
    } catch (error) {
      console.error('Erreur partage:', error);
      return false;
    }
  }

  /**
   * Alias pour print
   */
  async printReceipt(receiptText: string, qrData?: string): Promise<boolean> {
    return this.print(receiptText, qrData);
  }
}

export const printerService = new PrinterService();
export default printerService;
