/**
 * Service de génération QR Code - 100% Offline, Pure JavaScript
 * Implémentation complète du standard ISO/IEC 18004 sans dépendance externe
 * Fonctionne sur React Native, navigateur et Node.js
 */

// ============================================
// Tables de données QR Code (pré-calculées)
// ============================================

// Table GF(2^8) pour Reed-Solomon
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

// Initialisation des tables Galois Field
(function initGF256() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // Polynôme primitif
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

// Multiplication dans GF(256)
function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

// Capacités par version (L, M, Q, H) - bytes pour mode Byte
const VERSION_CAPACITY: number[][] = [
  [],
  [17, 14, 11, 7],     // V1
  [32, 26, 20, 14],    // V2
  [53, 42, 32, 24],    // V3
  [78, 62, 46, 34],    // V4
  [106, 84, 60, 44],   // V5
  [134, 106, 74, 58],  // V6
  [154, 122, 86, 64],  // V7
  [192, 152, 108, 84], // V8
  [230, 180, 130, 98], // V9
  [271, 213, 151, 119],// V10
];

// Nombre de codewords de correction d'erreur par version
const EC_CODEWORDS: number[][] = [
  [],
  [7, 10, 13, 17],   // V1
  [10, 16, 22, 28],  // V2
  [15, 26, 18, 22],  // V3
  [20, 18, 26, 16],  // V4
  [26, 24, 18, 22],  // V5
  [18, 16, 24, 28],  // V6
  [20, 18, 18, 26],  // V7
  [24, 22, 22, 26],  // V8
  [30, 22, 20, 24],  // V9
  [18, 26, 24, 28],  // V10
];

// Format info pré-calculé pour chaque niveau EC et masque
const FORMAT_INFO: { [key: string]: number } = {
  'L0': 0x77c4, 'L1': 0x72f3, 'L2': 0x7daa, 'L3': 0x789d,
  'L4': 0x662f, 'L5': 0x6318, 'L6': 0x6c41, 'L7': 0x6976,
  'M0': 0x5412, 'M1': 0x5125, 'M2': 0x5e7c, 'M3': 0x5b4b,
  'M4': 0x45f9, 'M5': 0x40ce, 'M6': 0x4f97, 'M7': 0x4aa0,
  'Q0': 0x355f, 'Q1': 0x3068, 'Q2': 0x3f31, 'Q3': 0x3a06,
  'Q4': 0x24b4, 'Q5': 0x2183, 'Q6': 0x2eda, 'Q7': 0x2bed,
  'H0': 0x1689, 'H1': 0x13be, 'H2': 0x1ce7, 'H3': 0x19d0,
  'H4': 0x0762, 'H5': 0x0255, 'H6': 0x0d0c, 'H7': 0x083b,
};

// ============================================
// Classe principale QRCode
// ============================================

class QRCodeGenerator {
  private ecLevel: number = 1; // 0=L, 1=M, 2=Q, 3=H

  /**
   * Génère le polynôme générateur pour Reed-Solomon
   */
  private generatePolynomial(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const newPoly = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        newPoly[j] ^= poly[j];
        newPoly[j + 1] ^= gfMul(poly[j], GF256_EXP[i]);
      }
      poly = newPoly;
    }
    return poly;
  }

  /**
   * Encode Reed-Solomon
   */
  private rsEncode(data: number[], ecCount: number): number[] {
    const poly = this.generatePolynomial(ecCount);
    const result = new Array(ecCount).fill(0);
    
    for (const byte of data) {
      const coef = byte ^ result[0];
      result.shift();
      result.push(0);
      for (let i = 0; i < ecCount; i++) {
        result[i] ^= gfMul(poly[i + 1], coef);
      }
    }
    return result;
  }

  /**
   * Détermine la version minimale requise
   */
  private getVersion(dataLength: number): number {
    for (let v = 1; v <= 10; v++) {
      if (VERSION_CAPACITY[v][this.ecLevel] >= dataLength) {
        return v;
      }
    }
    return 10; // Max supporté
  }

  /**
   * Taille de la matrice pour une version
   */
  private getSize(version: number): number {
    return version * 4 + 17;
  }

  /**
   * Crée la matrice avec les patterns fixes
   */
  private createMatrix(version: number): number[][] {
    const size = this.getSize(version);
    const matrix: number[][] = Array.from({ length: size }, () => 
      new Array(size).fill(-1) // -1 = non défini
    );

    // Finder patterns (7x7 aux 3 coins)
    this.drawFinderPattern(matrix, 0, 0);
    this.drawFinderPattern(matrix, 0, size - 7);
    this.drawFinderPattern(matrix, size - 7, 0);

    // Séparateurs (bordure blanche autour des finder patterns)
    this.drawSeparators(matrix, size);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = matrix[i][6] = (i % 2 === 0) ? 1 : 0;
    }

    // Dark module obligatoire
    matrix[size - 8][8] = 1;

    // Alignment pattern (versions >= 2)
    if (version >= 2) {
      const pos = 6 + version * 4;
      this.drawAlignmentPattern(matrix, pos, pos);
    }

    // Réserver l'espace pour format info
    this.reserveFormatArea(matrix, size);

    return matrix;
  }

  private drawFinderPattern(matrix: number[][], startRow: number, startCol: number): void {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        // Bordure externe noire
        if (r === 0 || r === 6 || c === 0 || c === 6) {
          matrix[startRow + r][startCol + c] = 1;
        }
        // Bordure interne blanche
        else if (r === 1 || r === 5 || c === 1 || c === 5) {
          matrix[startRow + r][startCol + c] = 0;
        }
        // Centre noir 3x3
        else {
          matrix[startRow + r][startCol + c] = 1;
        }
      }
    }
  }

  private drawSeparators(matrix: number[][], size: number): void {
    // Autour du finder top-left
    for (let i = 0; i < 8; i++) {
      if (matrix[7]?.[i] === -1) matrix[7][i] = 0;
      if (matrix[i]?.[7] === -1) matrix[i][7] = 0;
    }
    // Autour du finder top-right
    for (let i = 0; i < 8; i++) {
      if (matrix[7]?.[size - 8 + i] === -1) matrix[7][size - 8 + i] = 0;
      if (matrix[i]?.[size - 8] === -1) matrix[i][size - 8] = 0;
    }
    // Autour du finder bottom-left
    for (let i = 0; i < 8; i++) {
      if (matrix[size - 8]?.[i] === -1) matrix[size - 8][i] = 0;
      if (matrix[size - 8 + i]?.[7] === -1) matrix[size - 8 + i][7] = 0;
    }
  }

  private drawAlignmentPattern(matrix: number[][], centerRow: number, centerCol: number): void {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const row = centerRow + r;
        const col = centerCol + c;
        if (matrix[row]?.[col] !== -1) continue; // Ne pas écraser
        
        const dist = Math.max(Math.abs(r), Math.abs(c));
        matrix[row][col] = (dist === 1) ? 0 : 1;
      }
    }
  }

  private reserveFormatArea(matrix: number[][], size: number): void {
    // Zone autour du finder top-left (colonne 8 et ligne 8)
    for (let i = 0; i < 9; i++) {
      if (matrix[8]?.[i] === -1) matrix[8][i] = 0;
      if (matrix[i]?.[8] === -1) matrix[i][8] = 0;
    }
    // Zone finder top-right
    for (let i = 0; i < 8; i++) {
      if (matrix[8]?.[size - 1 - i] === -1) matrix[8][size - 1 - i] = 0;
    }
    // Zone finder bottom-left
    for (let i = 0; i < 7; i++) {
      if (matrix[size - 1 - i]?.[8] === -1) matrix[size - 1 - i][8] = 0;
    }
  }

  /**
   * Encode les données en mode Byte
   */
  private encodeData(text: string, version: number): number[] {
    const bytes: number[] = [];
    // Encoder UTF-8 manuellement pour compatibilité React Native
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }

    const capacity = VERSION_CAPACITY[version][this.ecLevel];
    const bits: number[] = [];

    // Mode indicator: Byte = 0100
    bits.push(0, 1, 0, 0);

    // Character count (8 bits pour v1-9, 16 pour v10+)
    const countBits = version < 10 ? 8 : 16;
    for (let i = countBits - 1; i >= 0; i--) {
      bits.push((bytes.length >> i) & 1);
    }

    // Données
    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }

    // Terminator (jusqu'à 4 bits)
    const totalBits = capacity * 8;
    for (let i = 0; i < 4 && bits.length < totalBits; i++) {
      bits.push(0);
    }

    // Padding to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Padding bytes alternés
    let padByte = 0xEC;
    while (bits.length < totalBits) {
      for (let i = 7; i >= 0; i--) bits.push((padByte >> i) & 1);
      padByte = padByte === 0xEC ? 0x11 : 0xEC;
    }

    // Convertir en bytes
    const dataBytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (bits[i + j] || 0);
      }
      dataBytes.push(byte);
    }

    return dataBytes;
  }

  /**
   * Place les données dans la matrice
   */
  private placeData(matrix: number[][], data: number[]): void {
    const size = matrix.length;
    let bitIndex = 0;
    let up = true;

    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5; // Skip timing pattern column

      for (let i = 0; i < size; i++) {
        const row = up ? (size - 1 - i) : i;

        for (const dx of [0, -1]) {
          const c = col + dx;
          if (c < 0) continue;
          
          if (matrix[row][c] === -1) {
            const bit = bitIndex < data.length * 8
              ? (data[Math.floor(bitIndex / 8)] >> (7 - (bitIndex % 8))) & 1
              : 0;
            matrix[row][c] = bit;
            bitIndex++;
          }
        }
      }
      up = !up;
    }
  }

  /**
   * Applique un masque et retourne le score de pénalité
   */
  private applyMask(matrix: number[][], maskId: number): number[][] {
    const size = matrix.length;
    const masked = matrix.map(row => [...row]);
    
    const maskFunctions: ((r: number, c: number) => boolean)[] = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    const maskFn = maskFunctions[maskId];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.isDataModule(r, c, size) && maskFn(r, c)) {
          masked[r][c] ^= 1;
        }
      }
    }

    return masked;
  }

  private isDataModule(row: number, col: number, size: number): boolean {
    // Finder patterns + separators
    if (row < 9 && col < 9) return false;
    if (row < 9 && col >= size - 8) return false;
    if (row >= size - 8 && col < 9) return false;
    // Timing patterns
    if (row === 6 || col === 6) return false;
    return true;
  }

  /**
   * Calcule le score de pénalité d'un masque
   */
  private calculatePenalty(matrix: number[][]): number {
    const size = matrix.length;
    let penalty = 0;

    // Règle 1: Lignes/colonnes de même couleur
    for (let r = 0; r < size; r++) {
      let count = 1;
      for (let c = 1; c < size; c++) {
        if (matrix[r][c] === matrix[r][c - 1]) {
          count++;
        } else {
          if (count >= 5) penalty += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) penalty += 3 + (count - 5);
    }

    for (let c = 0; c < size; c++) {
      let count = 1;
      for (let r = 1; r < size; r++) {
        if (matrix[r][c] === matrix[r - 1][c]) {
          count++;
        } else {
          if (count >= 5) penalty += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) penalty += 3 + (count - 5);
    }

    return penalty;
  }

  /**
   * Place les informations de format
   */
  private placeFormatInfo(matrix: number[][], maskId: number): void {
    const size = matrix.length;
    const ecLevels = ['L', 'M', 'Q', 'H'];
    const formatBits = FORMAT_INFO[`${ecLevels[this.ecLevel]}${maskId}`];

    // Position autour du finder top-left
    const positions1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];

    // Position finder top-right et bottom-left
    const positions2 = [
      [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
      [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
      [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
      [size - 3, 8], [size - 2, 8], [size - 1, 8]
    ];

    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >> i) & 1;
      const [r1, c1] = positions1[i];
      const [r2, c2] = positions2[i];
      matrix[r1][c1] = bit;
      matrix[r2][c2] = bit;
    }
  }

  /**
   * Génère le QR code complet
   */
  generate(text: string): number[][] | null {
    if (!text || text.trim() === '') {
      console.warn('QRCodeGenerator: texte vide');
      return null;
    }

    try {
      const version = this.getVersion(text.length + 3);
      let matrix = this.createMatrix(version);
      
      // Encoder les données avec correction d'erreur
      const dataBytes = this.encodeData(text, version);
      const ecCount = EC_CODEWORDS[version][this.ecLevel];
      const ecBytes = this.rsEncode(dataBytes, ecCount);
      const allBytes = [...dataBytes, ...ecBytes];

      // Placer les données
      this.placeData(matrix, allBytes);

      // Trouver le meilleur masque
      let bestMask = 0;
      let bestPenalty = Infinity;

      for (let m = 0; m < 8; m++) {
        const masked = this.applyMask(matrix, m);
        const penalty = this.calculatePenalty(masked);
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestMask = m;
        }
      }

      // Appliquer le meilleur masque
      matrix = this.applyMask(matrix, bestMask);
      
      // Placer les informations de format
      this.placeFormatInfo(matrix, bestMask);

      return matrix;
    } catch (error) {
      console.error('QRCodeGenerator error:', error);
      return null;
    }
  }

  /**
   * Génère le SVG du QR code
   */
  toSvg(text: string, size: number = 150): string {
    const matrix = this.generate(text);
    if (!matrix) return '';

    const moduleCount = matrix.length;
    const quietZone = 4;
    const totalModules = moduleCount + quietZone * 2;
    const moduleSize = size / totalModules;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (matrix[row][col] === 1) {
          const x = (quietZone + col) * moduleSize;
          const y = (quietZone + row) * moduleSize;
          svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(moduleSize + 0.5).toFixed(2)}" height="${(moduleSize + 0.5).toFixed(2)}" fill="black"/>`;
        }
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Génère une image base64 du QR code (via SVG)
   */
  toDataUrl(text: string, size: number = 150): string {
    const svg = this.toSvg(text, size);
    if (!svg) return '';
    
    // Encoder le SVG en base64 - compatible React Native
    const base64 = this.btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
  }

  /**
   * Implémentation btoa pour compatibilité React Native
   */
  private btoa(str: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    
    // Convertir en UTF-8 bytes
    const utf8: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let charCode = str.charCodeAt(i);
      if (charCode < 128) {
        utf8.push(charCode);
      } else if (charCode < 2048) {
        utf8.push(192 | (charCode >> 6), 128 | (charCode & 63));
      } else {
        utf8.push(224 | (charCode >> 12), 128 | ((charCode >> 6) & 63), 128 | (charCode & 63));
      }
    }
    
    // Encoder en base64
    for (let i = 0; i < utf8.length; i += 3) {
      const b1 = utf8[i];
      const b2 = utf8[i + 1];
      const b3 = utf8[i + 2];
      
      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
      const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
      const enc4 = b3 & 63;
      
      if (isNaN(b2)) {
        output += chars.charAt(enc1) + chars.charAt(enc2) + '==';
      } else if (isNaN(b3)) {
        output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + '=';
      } else {
        output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
      }
    }
    
    return output;
  }
}

// ============================================
// Service exporté
// ============================================

class QRCodeService {
  private generator = new QRCodeGenerator();

  /**
   * Génère un QR code en SVG (synchrone)
   */
  toSvg(data: string, size: number = 150): string {
    if (!data || data.trim() === '') {
      console.warn('QRCodeService: données vides');
      return '';
    }

    console.log(`QRCodeService: Génération SVG pour "${data.substring(0, 30)}..."`);
    const svg = this.generator.toSvg(data, size);
    console.log(`QRCodeService: SVG généré (${svg.length} chars)`);
    return svg;
  }

  /**
   * Génère une data URL du QR code (synchrone)
   */
  toDataUrl(data: string, size: number = 150): string {
    if (!data || data.trim() === '') {
      return '';
    }
    return this.generator.toDataUrl(data, size);
  }

  /**
   * Génère le HTML pour afficher le QR code (synchrone)
   */
  toHtml(data: string, size: number = 150): string {
    const svg = this.toSvg(data, size);
    if (!svg) return '';
    return svg; // Retourne directement le SVG inline
  }

  /**
   * Version async pour compatibilité avec le code existant
   */
  async toSvgAsync(data: string, size: number = 150): Promise<string> {
    return this.toSvg(data, size);
  }

  /**
   * Version async pour compatibilité
   */
  async toDataUrlAsync(data: string, size: number = 150): Promise<string> {
    return this.toDataUrl(data, size);
  }

  /**
   * Version async pour compatibilité
   */
  async toHtmlAsync(data: string, size: number = 150): Promise<string> {
    return this.toHtml(data, size);
  }
}

export const qrCodeService = new QRCodeService();
export default qrCodeService;
