/**
 * Utilitaires pour la gestion et validation des tokens JWT
 */

export interface JWTPayload {
  exp?: number; // Timestamp d'expiration (en secondes)
  iat?: number; // Timestamp de création
  sub?: string; // Subject (souvent l'ID utilisateur)
  [key: string]: any;
}

/**
 * Décode un token JWT et retourne le payload
 * @param token Le token JWT à décoder
 * @returns Le payload décodé ou null si invalide
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Un JWT a 3 parties séparées par des points
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('⚠️ Token JWT invalide: format incorrect');
      return null;
    }

    // Le payload est la 2ème partie (index 1)
    const payload = parts[1];
    
    // Décoder le base64 (attention: base64url vs base64 standard)
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('❌ Erreur décodage JWT:', error);
    return null;
  }
}

/**
 * Vérifie si un token JWT est expiré
 * @param token Le token JWT à vérifier
 * @param bufferSeconds Marge de sécurité en secondes avant expiration (défaut: 60)
 * @returns true si le token est expiré ou invalide, false sinon
 */
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
  const payload = decodeJWT(token);
  
  if (!payload) {
    console.warn('⚠️ Token invalide - considéré comme expiré');
    return true;
  }

  // Si pas de champ exp, le token n'expire pas (peu probable mais possible)
  if (typeof payload.exp !== 'number') {
    console.warn('⚠️ Token sans date d\'expiration');
    return false;
  }

  // Le champ exp est en secondes, Date.now() est en millisecondes
  const currentTime = Math.floor(Date.now() / 1000);
  const expirationTime = payload.exp - bufferSeconds; // Ajouter une marge de sécurité

  const isExpired = currentTime >= expirationTime;
  
  if (isExpired) {
    const expiredSince = currentTime - payload.exp;
    console.log(`🔒 Token expiré depuis ${expiredSince} secondes`);
  } else {
    const remainingTime = payload.exp - currentTime;
    console.log(`✅ Token valide, expire dans ${remainingTime} secondes (${Math.floor(remainingTime / 60)} minutes)`);
  }

  return isExpired;
}

/**
 * Obtient le temps restant avant expiration du token en secondes
 * @param token Le token JWT
 * @returns Le temps restant en secondes, ou -1 si expiré/invalide
 */
export function getTokenRemainingTime(token: string): number {
  const payload = decodeJWT(token);
  
  if (!payload || typeof payload.exp !== 'number') {
    return -1;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - currentTime;
  
  return remaining > 0 ? remaining : -1;
}

/**
 * Obtient des informations détaillées sur le token
 * @param token Le token JWT
 * @returns Objet avec les informations du token
 */
export function getTokenInfo(token: string): {
  isValid: boolean;
  isExpired: boolean;
  expiresAt: Date | null;
  remainingSeconds: number;
  payload: JWTPayload | null;
} {
  const payload = decodeJWT(token);
  
  if (!payload) {
    return {
      isValid: false,
      isExpired: true,
      expiresAt: null,
      remainingSeconds: -1,
      payload: null,
    };
  }

  const isExpired = isTokenExpired(token, 0); // Sans buffer pour l'info
  const remainingSeconds = getTokenRemainingTime(token);
  const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;

  return {
    isValid: true,
    isExpired,
    expiresAt,
    remainingSeconds,
    payload,
  };
}
