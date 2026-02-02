import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { getLocalProfile } from '../database';
import { AuthResponse, LoginCredentials, TaxCategorie, TaxType, Payment, User, Terminal } from '../types';

// Interface pour les données initiales de l'agent
export interface AgentInitialData {
  user: User;
  services: { id: number; name: string; code: string }[];
  terminals: Terminal[];
  taxCategories: TaxCategorie[];
  taxTypes: TaxType[];
}

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Intercepteur pour ajouter le token
    this.api.interceptors.request.use(
      async (config) => {
        // Utiliser le token en mémoire d'abord (pour le login)
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        } else {
          const profile = await getLocalProfile();
          if (profile?.token) {
            config.headers.Authorization = `Bearer ${profile.token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Intercepteur pour gérer les erreurs
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expiré ou invalide
          console.log('Unauthorized - Token expired or invalid');
        }
        return Promise.reject(error);
      }
    );
  }

  // Définir le token temporairement (utilisé après login)
  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // ==================== AUTH ====================

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    console.log('Tentative de connexion avec:', { user_uid: credentials.user_uid });
    console.log('URL:', API_CONFIG.BASE_URL + ENDPOINTS.LOGIN);
    console.log('Config:', {
      baseURL: this.api.defaults.baseURL,
      timeout: this.api.defaults.timeout,
    });
    
    try {
      const response = await this.api.post<AuthResponse>(ENDPOINTS.LOGIN, credentials);
      console.log('Réponse login:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Erreur login API:', error.response?.status, error.response?.data);
      console.error('Message erreur:', error.message);
      console.error('Code erreur:', error.code);
      throw error;
    }
  }

  async logout(): Promise<void> {
    await this.api.post(ENDPOINTS.LOGOUT);
    this.clearToken();
  }

  async getMe(): Promise<User> {
    const response = await this.api.get<{ data: User }>(ENDPOINTS.ME);
    return response.data.data;
  }

  // ==================== DONNÉES INITIALES AGENT ====================

  /**
   * Récupère toutes les données nécessaires pour l'agent lors de la première connexion
   */
  async getAgentInitialData(): Promise<AgentInitialData> {
    // Récupérer le profil utilisateur avec ses relations
    const userResponse = await this.api.get<{ data: User }>(ENDPOINTS.ME);
    const user = userResponse.data.data || userResponse.data;

    // Récupérer les catégories de taxes (filtrées par service de l'agent)
    const serviceId = user.service_id;
    const categoriesResponse = await this.api.get<{ data: TaxCategorie[] }>(
      `${ENDPOINTS.TAX_CATEGORIES}?service_id=${serviceId}`
    );
    const taxCategories = categoriesResponse.data.data || categoriesResponse.data;

    // Récupérer les types de taxes liés aux catégories du service
    const typesResponse = await this.api.get<{ data: TaxType[] }>(
      `${ENDPOINTS.TAX_TYPES}?service_id=${serviceId}`
    );
    const taxTypes = typesResponse.data.data || typesResponse.data;

    return {
      user,
      services: (user as any).services || [],
      terminals: (user as any).terminals || [],
      taxCategories,
      taxTypes,
    };
  }

  // ==================== TAX CATEGORIES ====================

  async getTaxCategories(): Promise<TaxCategorie[]> {
    const response = await this.api.get<{ data: TaxCategorie[] }>(ENDPOINTS.TAX_CATEGORIES);
    return response.data.data;
  }

  // ==================== TAX TYPES ====================

  async getTaxTypes(): Promise<TaxType[]> {
    const response = await this.api.get<{ data: TaxType[] }>(ENDPOINTS.TAX_TYPES);
    return response.data.data;
  }

  // ==================== PAYMENTS ====================

  async createPayment(payment: Omit<Payment, 'id'>): Promise<Payment> {
    const response = await this.api.post<{ data: Payment }>(ENDPOINTS.PAYMENTS, payment);
    return response.data.data;
  }

  async getPayments(): Promise<Payment[]> {
    const response = await this.api.get<{ data: Payment[] }>(ENDPOINTS.PAYMENTS);
    return response.data.data;
  }

  async getPaymentByUuid(uuid: string): Promise<Payment | null> {
    try {
      const response = await this.api.get<{ data: Payment }>(`${ENDPOINTS.PAYMENTS}/uuid/${uuid}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  // ==================== TERMINALS ====================

  async pingTerminal(terminalId: number): Promise<void> {
    await this.api.post(ENDPOINTS.TERMINAL_PING(terminalId));
  }

  // ==================== SYNC LOGS ====================

  async createSyncLog(log: { terminal_id: number; action: string; payload?: object; status: string; error_message?: string }): Promise<void> {
    await this.api.post(ENDPOINTS.SYNC_LOGS, log);
  }

  // ==================== UTILITIES ====================

  setBaseUrl(url: string): void {
    this.api.defaults.baseURL = url;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.api.get(ENDPOINTS.ME);
      return true;
    } catch {
      return false;
    }
  }
}

export const apiService = new ApiService();
export default apiService;
