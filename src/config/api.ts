// Configuration API
export const API_CONFIG = {
  BASE_URL: 'https://taxe-api.bgbd.org/api',
  TIMEOUT: 30000,
};

export const ENDPOINTS = {
  // Auth
  LOGIN: '/login',
  LOGOUT: '/logout',
  ME: '/me',

  // Services
  SERVICES: '/services',
  AGENT_SERVICES: '/agent-services',

  // Tax Categories
  TAX_CATEGORIES: '/tax-categories',

  // Tax Types
  TAX_TYPES: '/tax-types',

  // Payments
  PAYMENTS: '/payments',
  PAYMENTS_STATS: '/payments-stats',

  // Terminals
  TERMINALS: '/terminals',
  TERMINAL_PING: (id: number) => `/terminals/${id}/ping`,

  // Sync Logs
  SYNC_LOGS: '/sync-logs',
};
