import { LocalPaymentQueue } from '../types';

// Configuration pour imprimante 58mm - 31 caractères par ligne
const LINE_WIDTH = 31;
const SEPARATOR = '─'.repeat(LINE_WIDTH);

interface ReceiptData {
  payment: LocalPaymentQueue;
  agentName: string;
  agentZone: string;
  categoryLabel: string;
  typeLabel: string;
  serviceLabel?: string;
  terminalUid?: string;
  agentUid?: string;
  cityName?: string;
}

class ReceiptService {
  // Centrer un texte
  private center(text: string): string {
    if (text.length >= LINE_WIDTH) return text.substring(0, LINE_WIDTH);
    const padding = Math.floor((LINE_WIDTH - text.length) / 2);
    return ' '.repeat(padding) + text;
  }

  // Formater le montant
  private formatAmount(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' FC';
  }

  // Formater la date
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // Générer un numéro de reçu formaté
  private formatReceiptNo(payment: LocalPaymentQueue): string {
    if (payment.server_receipt_no) {
      return payment.server_receipt_no;
    }
    // Générer un numéro temporaire basé sur l'UUID
    const year = new Date(payment.paid_at).getFullYear();
    const shortId = payment.local_uuid.substring(0, 6).toUpperCase();
    return `RC-${year}-${shortId}`;
  }

  // Générer le reçu complet
  generateReceipt(data: ReceiptData): string[] {
    const { 
      payment, 
      agentName, 
      categoryLabel, 
      typeLabel,
      terminalUid,
      agentUid,
      cityName = 'KOLWEZI'
    } = data;
    
    const lines: string[] = [];

    // En-tête République
    lines.push('');
    lines.push(this.center('REPUBLIQUE DEMOCRATIQUE'));
    lines.push(this.center('DU CONGO'));
    lines.push(this.center('PROVINCE DU LUALABA'));
    lines.push(this.center(`VILLE DE ${cityName}`));
    lines.push('');

    // Titre du reçu
    lines.push(SEPARATOR);
    lines.push(this.center('RECU DE PAIEMENT OFFICIEL'));
    lines.push(this.center(`N° : ${this.formatReceiptNo(payment)}`));
    lines.push(SEPARATOR);
    lines.push('');

    // Nom du payeur
    lines.push('Nom du payeur :');
    lines.push(payment.payer_name);
    lines.push('');

    // Taxe (type de taxe)
    lines.push('Taxe :');
    lines.push(typeLabel);
    lines.push('');

    // Catégorie
    lines.push('Categorie :');
    lines.push(categoryLabel);
    lines.push('');

    // Montant et Date
    lines.push(`Montant : ${this.formatAmount(payment.total_amount)}`);
    lines.push(`Date    : ${this.formatDate(payment.paid_at)}`);
    lines.push('');

    // Informations agent
    lines.push(`Percepteur : ${agentName}`);
    lines.push(`Terminal   : ${terminalUid || `T-${payment.terminal_id}`}`);
    lines.push(`Agent ID   : ${agentUid || `A-${String(payment.user_id).padStart(3, '0')}`}`);
    lines.push('');

    // Section QR Code (le QR sera affiché visuellement)
    lines.push(SEPARATOR);
    lines.push(this.center('SCANNEZ LE QR CODE'));
    lines.push(SEPARATOR);

    return lines;
  }

  // Générer le texte brut pour impression
  generateReceiptText(data: ReceiptData): string {
    return this.generateReceipt(data).join('\n');
  }

  // Générer les données pour QR Code
  generateQrData(payment: LocalPaymentQueue): string {
    return JSON.stringify({
      uuid: payment.local_uuid,
      amount: payment.total_amount,
      date: payment.paid_at,
      receipt: payment.server_receipt_no,
    });
  }

  // Générer les commandes ESC/POS pour imprimante thermique
  generateEscPosCommands(data: ReceiptData): Uint8Array {
    const text = this.generateReceiptText(data);
    
    // Commandes ESC/POS basiques
    const ESC = 0x1B;
    const GS = 0x1D;
    
    const commands: number[] = [
      ESC, 0x40,          // Initialize printer
      ESC, 0x61, 0x01,    // Center alignment
      ESC, 0x21, 0x00,    // Normal text
    ];
    
    // Convertir le texte en bytes
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);
    commands.push(...textBytes);
    
    // Cut paper (si supporté)
    commands.push(GS, 0x56, 0x00);
    
    return new Uint8Array(commands);
  }
}

export const receiptService = new ReceiptService();
export default receiptService;
