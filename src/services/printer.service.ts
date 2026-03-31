/**
 * Service d'impression simple
 * Utilise expo-print pour imprimer des reçus
 * QR Code généré localement avec signature
 */

import * as Print from 'expo-print';
import { LocalPaymentQueue } from '../types';
import { qrCodeService } from './qrcode.service';

interface ReceiptData {
  payment: LocalPaymentQueue;
  agentName: string;
  agentZone?: string | null;
  categoryLabel: string;
  typeLabel: string;
}

class PrinterService {
  
  private formatAmount(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' FC';
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatReceiptNo(payment: LocalPaymentQueue): string {
    if (payment.server_receipt_no) {
      return payment.server_receipt_no;
    }
    return payment.local_uuid.substring(0, 8).toUpperCase();
  }

  /**
   * Génère une signature pour le QR code
   * Format: uuid|montant|date|agent_id|checksum
   */
  private generateSignature(payment: LocalPaymentQueue): string {
    const data = `${payment.local_uuid}|${payment.total_amount}|${payment.paid_at}|${payment.user_id}`;
    
    // Générer un checksum simple (hash basique)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const checksum = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    
    return `${data}|${checksum}`;
  }

  /**
   * Génère le HTML du reçu avec QR code local
   */
  private async generateHtml(data: ReceiptData): Promise<string> {
    const { payment, agentName, agentZone, categoryLabel, typeLabel } = data;
    
    // Générer la signature sécurisée
    const signature = payment.qr_signature || this.generateSignature(payment);
    
    // Générer le QR code en SVG localement
    let qrSvg = '';
    try {
      qrSvg = await qrCodeService.toSvg(signature, 100);
    } catch (e) {
      console.warn('Erreur génération QR:', e);
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      max-width: 300px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .total { font-size: 16px; font-weight: bold; margin: 10px 0; }
    h1 { font-size: 14px; margin: 5px 0; }
    h2 { font-size: 12px; margin: 5px 0; }
    .qr-container { margin: 10px auto; width: 100px; height: 100px; }
    .signature { font-size: 8px; color: #666; word-break: break-all; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="center">
    <h1>REPUBLIQUE DEMOCRATIQUE DU CONGO</h1>
    <h2>PROVINCE DU LUALABA</h2>
    <h2>SECTEUR LUILU</h2>
  </div>
  
  <div class="line"></div>
  
  <div class="center">
    <div class="bold">RECU DE PAIEMENT</div>
    <div>N° ${this.formatReceiptNo(payment)}</div>
  </div>
  
  <div class="line"></div>
  
  <div class="row"><span>Payeur:</span><span>${payment.payer_name}</span></div>
  ${payment.payer_phone ? `<div class="row"><span>Tél:</span><span>${payment.payer_phone}</span></div>` : ''}
  
  <div class="line"></div>
  
  <div class="row"><span>Catégorie:</span><span>${categoryLabel}</span></div>
  <div class="row"><span>Type:</span><span>${typeLabel}</span></div>
  
  ${payment.chassis_number ? `<div class="row"><span>Châssis:</span><span>${payment.chassis_number}</span></div>` : ''}
  ${payment.vehicle_color ? `<div class="row"><span>Couleur:</span><span>${payment.vehicle_color}</span></div>` : ''}
  
  ${payment.installment_number ? `
  <div class="line"></div>
  <div class="row"><span>Tranche:</span><span class="bold">${payment.installment_number} / ${payment.installment_total}</span></div>
  ` : ''}
  
  <div class="line"></div>
  
  <div class="center total">
    ${payment.installment_number ? `TRANCHE ${payment.installment_number}/${payment.installment_total} : ` : 'TOTAL: '}${this.formatAmount(payment.total_amount)}
  </div>
  
  <div class="line"></div>
  
  <div class="row"><span>Date:</span><span>${this.formatDate(payment.paid_at)}</span></div>
  <div class="row"><span>Agent:</span><span>${agentName}</span></div>
  ${agentZone ? `<div class="row"><span>Zone:</span><span>${agentZone}</span></div>` : ''}
  
  <div class="line"></div>
  
  <div class="center">
    <div class="qr-container">${qrSvg}</div>
    <div class="signature">Sig: ${signature.split('|').pop()}</div>
  </div>
  
  <div class="center" style="margin-top: 10px; font-size: 10px;">
    Ce reçu fait foi de paiement
  </div>
</body>
</html>`;
  }

  /**
   * Imprime un reçu
   */
  async print(data: ReceiptData): Promise<boolean> {
    try {
      const html = await this.generateHtml(data);
      await Print.printAsync({ html });
      return true;
    } catch (error: any) {
      // Annulation par l'utilisateur
      if (error?.message?.includes('cancel')) {
        return false;
      }
      console.error('Erreur impression:', error);
      return false;
    }
  }
}

export const printerService = new PrinterService();
