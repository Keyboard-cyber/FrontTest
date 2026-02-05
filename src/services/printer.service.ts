/**
 * Service d'impression simple
 * Utilise expo-print pour imprimer des reçus
 */

import * as Print from 'expo-print';
import { LocalPaymentQueue } from '../types';

interface ReceiptData {
  payment: LocalPaymentQueue;
  agentName: string;
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
   * Génère le HTML du reçu
   */
  private generateHtml(data: ReceiptData): string {
    const { payment, agentName, categoryLabel, typeLabel } = data;
    const qrData = payment.qr_signature || `${payment.local_uuid}|${payment.total_amount}|${payment.paid_at}|${payment.user_id}`;

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
  </style>
</head>
<body>
  <div class="center">
    <h1>REPUBLIQUE DEMOCRATIQUE DU CONGO</h1>
    <h2>PROVINCE DU LUALABA</h2>
    <h2>VILLE DE KOLWEZI</h2>
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
  <div class="row"><span>Quantité:</span><span>${payment.quantity}</span></div>
  <div class="row"><span>Prix unit.:</span><span>${this.formatAmount(payment.unit_price)}</span></div>
  
  ${payment.chassis_number ? `<div class="row"><span>Châssis:</span><span>${payment.chassis_number}</span></div>` : ''}
  
  <div class="line"></div>
  
  <div class="center total">
    TOTAL: ${this.formatAmount(payment.total_amount)}
  </div>
  
  <div class="line"></div>
  
  <div class="row"><span>Date:</span><span>${this.formatDate(payment.paid_at)}</span></div>
  <div class="row"><span>Agent:</span><span>${agentName}</span></div>
  
  <div class="line"></div>
  
  <div class="center" style="margin-top: 10px;">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrData)}" width="100" height="100" />
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
      const html = this.generateHtml(data);
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
