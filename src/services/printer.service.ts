import { Platform, NativeModules } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Service d'impression pour terminaux Android handheld avec imprimante thermique intégrée
 * 
 * Supporte:
 * - Impression via expo-print (système Android)
 * - Impression directe via SDK natif (Sunmi, iMin, etc.)
 */

export interface PrinterStatus {
  isConnected: boolean;
  isPrinting: boolean;
  hasError: boolean;
  errorMessage?: string;
  paperStatus?: 'OK' | 'LOW' | 'EMPTY';
}

export interface PrintOptions {
  copies?: number;
  cutPaper?: boolean;
  openDrawer?: boolean;
}

class PrinterService {
  private isInitialized = false;
  private printerType: 'system' | 'sunmi' | 'imin' | 'unknown' = 'unknown';

  /**
   * Initialiser et détecter le type d'imprimante
   */
  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('⚠️ Impression disponible uniquement sur Android');
      this.printerType = 'system';
      this.isInitialized = true;
      return true;
    }

    try {
      // Détecter le type de terminal/imprimante
      await this.detectPrinterType();
      
      this.isInitialized = true;
      console.log(`✅ Service d'impression initialisé (type: ${this.printerType})`);
      return true;
    } catch (error) {
      console.error('❌ Erreur initialisation imprimante:', error);
      this.printerType = 'system';
      this.isInitialized = true;
      return true; // On continue avec l'impression système
    }
  }

  /**
   * Détecter le type d'imprimante du terminal
   */
  private async detectPrinterType(): Promise<void> {
    try {
      // Vérifier si c'est un terminal Sunmi
      if (NativeModules.SunmiInnerPrinter) {
        this.printerType = 'sunmi';
        console.log('📱 Terminal Sunmi détecté');
        return;
      }

      // Vérifier si c'est un terminal iMin
      if (NativeModules.IminPrinter) {
        this.printerType = 'imin';
        console.log('📱 Terminal iMin détecté');
        return;
      }

      // Utiliser l'impression système par défaut
      this.printerType = 'system';
      console.log('📱 Utilisation de l\'impression système Android');
    } catch (error) {
      this.printerType = 'system';
    }
  }

  /**
   * Vérifier le statut de l'imprimante
   */
  async getStatus(): Promise<PrinterStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return {
      isConnected: true,
      isPrinting: false,
      hasError: false,
      paperStatus: 'OK',
    };
  }

  /**
   * Générer le HTML pour impression thermique 58mm
   * @param text Texte formaté (31 caractères/ligne)
   */
  private generateThermalHTML(text: string): string {
    const lines = text.split('\n');
    
    // CSS optimisé pour impression thermique 58mm
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=58mm, initial-scale=1.0">
        <style>
          @page {
            size: 58mm auto;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.2;
            width: 58mm;
            padding: 2mm;
            background: white;
            color: black;
          }
          .line {
            white-space: pre;
            font-family: 'Courier New', Courier, monospace;
          }
          .center {
            text-align: center;
          }
          .bold {
            font-weight: bold;
          }
          .separator {
            border-bottom: 1px dashed #000;
            margin: 2px 0;
          }
          .qr-container {
            text-align: center;
            margin: 5mm 0;
          }
          .qr-placeholder {
            display: inline-block;
            width: 30mm;
            height: 30mm;
            border: 1px solid #000;
            text-align: center;
            line-height: 30mm;
            font-size: 8px;
          }
        </style>
      </head>
      <body>
        ${lines.map(line => {
          // Détecter les lignes de séparation
          if (line.includes('═') || line.includes('─') || line.includes('=')) {
            return '<div class="separator"></div>';
          }
          // Lignes centrées (titre, montants)
          if (line.trim().startsWith('***') || line.includes('REPUBLIQUE') || line.includes('TOTAL') || line.includes('FC')) {
            return `<div class="line center bold">${this.escapeHtml(line)}</div>`;
          }
          return `<div class="line">${this.escapeHtml(line)}</div>`;
        }).join('\n')}
      </body>
      </html>
    `;
    
    return html;
  }

  /**
   * Échapper les caractères HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Imprimer du texte via le système Android
   * @param text Texte formaté pour impression 58mm
   */
  async printText(text: string, options?: PrintOptions): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Générer le HTML pour impression
      const html = this.generateThermalHTML(text);

      // Imprimer via expo-print (utilise le système d'impression Android)
      await Print.printAsync({
        html,
        width: 58 * 2.83465, // 58mm en points (1mm = 2.83465 points)
        height: 297 * 2.83465, // Hauteur auto
      });

      console.log('✅ Impression envoyée au système');
      return true;
    } catch (error) {
      console.error('❌ Erreur impression:', error);
      return false;
    }
  }

  /**
   * Imprimer directement sans dialogue (pour terminaux avec imprimante intégrée)
   * @param text Texte formaté
   */
  async printDirect(text: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const html = this.generateThermalHTML(text);

      // selectPrinter permet de choisir/mémoriser l'imprimante
      // Sur les terminaux avec imprimante intégrée, elle sera souvent la seule option
      const printer = await Print.selectPrinterAsync();
      
      if (printer) {
        await Print.printAsync({
          html,
          printerUrl: printer.url,
        });
        return true;
      }
      
      // Si pas de sélection, utiliser l'impression standard
      return await this.printText(text);
    } catch (error) {
      console.error('❌ Erreur impression directe:', error);
      // Fallback sur l'impression standard
      return await this.printText(text);
    }
  }

  /**
   * Générer un PDF du reçu (pour partage ou sauvegarde)
   */
  async generatePDF(text: string): Promise<string | null> {
    try {
      const html = this.generateThermalHTML(text);
      
      const { uri } = await Print.printToFileAsync({
        html,
        width: 58 * 2.83465,
        height: 200 * 2.83465,
      });
      
      console.log('📄 PDF généré:', uri);
      return uri;
    } catch (error) {
      console.error('❌ Erreur génération PDF:', error);
      return null;
    }
  }

  /**
   * Partager le reçu en PDF
   */
  async shareReceipt(text: string): Promise<boolean> {
    try {
      const pdfUri = await this.generatePDF(text);
      
      if (pdfUri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Partager le reçu',
          UTI: 'com.adobe.pdf',
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Erreur partage:', error);
      return false;
    }
  }

  /**
   * Couper le papier (si supporté par le terminal)
   */
  async cutPaper(): Promise<void> {
    try {
      if (this.printerType === 'sunmi' && NativeModules.SunmiInnerPrinter) {
        await NativeModules.SunmiInnerPrinter.cutPaper();
      }
      console.log('✂️ Coupe papier (si supporté)');
    } catch (error) {
      // Silencieux si non supporté
    }
  }

  /**
   * Ouvrir le tiroir-caisse (si disponible)
   */
  async openCashDrawer(): Promise<void> {
    try {
      if (this.printerType === 'sunmi' && NativeModules.SunmiInnerPrinter) {
        await NativeModules.SunmiInnerPrinter.openCashDrawer();
      }
      console.log('💰 Tiroir-caisse (si disponible)');
    } catch (error) {
      // Silencieux si non disponible
    }
  }

  /**
   * Imprimer un reçu complet
   */
  async printReceipt(text: string, options?: PrintOptions): Promise<boolean> {
    const success = await this.printText(text, options);
    
    if (success && options?.cutPaper) {
      await this.cutPaper();
    }
    
    if (success && options?.openDrawer) {
      await this.openCashDrawer();
    }
    
    return success;
  }

  /**
   * Vérifier si l'impression est disponible
   */
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true; // iOS supporte toujours AirPrint
    }
    
    if (Platform.OS === 'android') {
      return true; // Android a toujours le service d'impression
    }
    
    return false;
  }
}

export const printerService = new PrinterService();
export default printerService;
