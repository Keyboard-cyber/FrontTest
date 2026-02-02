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

// Callback pour gérer les erreurs 401
type UnauthorizedCallback = () => void;

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;
  private tokenLoaded: boolean = false;
  private onUnauthorizedCallback: UnauthorizedCallback | null = null;

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
        // Charger le token depuis la base de données si pas encore fait
        if (!this.token && !this.tokenLoaded) {
          await this.loadTokenFromStorage();
        }
        
        // Ajouter le token si disponible
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
          console.log('Token ajouté à la requête:', this.token.substring(0, 20) + '...');
        } else {
          console.warn('⚠️ Aucun token disponible pour la requête:', config.url);
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
          console.log('🔒 Unauthorized - Token expired or invalid');
          // Réinitialiser le token
          this.token = null;
          this.tokenLoaded = false;
          // Notifier l'application pour déconnecter l'utilisateur
          if (this.onUnauthorizedCallback) {
            this.onUnauthorizedCallback();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Définir le callback pour les erreurs 401
  onUnauthorized(callback: UnauthorizedCallback): void {
    this.onUnauthorizedCallback = callback;
  }

  // Charger le token depuis le stockage local
  async loadTokenFromStorage(): Promise<void> {
    try {
      const profile = await getLocalProfile();
      if (profile?.token) {
        this.token = profile.token;
        console.log('✅ Token chargé depuis le stockage local');
      }
    } catch (error) {
      console.error('Erreur chargement token:', error);
    }
    this.tokenLoaded = true;
  }

  // Définir le token (utilisé après login)
  setToken(token: string) {
    this.token = token;
    this.tokenLoaded = true;
  }

  clearToken() {
    this.token = null;
    this.tokenLoaded = false;
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
    console.log('Données utilisateur /me:', JSON.stringify(user, null, 2));
    
    // Récupérer tous les services de l'agent
    let services: { id: number; name: string; code: string }[] = (user as any).services || [];
    
    // Si pas de services dans /me, essayer de les récupérer via /agent-services
    if (services.length === 0) {
      console.log('Pas de services dans /me, tentative via /agent-services...');
      try {
        const servicesResponse = await this.api.get<{ data: any[] }>(ENDPOINTS.AGENT_SERVICES);
        const agentServicesData = servicesResponse.data.data || servicesResponse.data || [];
        // Extraire les services de la relation pivot
        services = agentServicesData.map((as: any) => as.service || as).filter((s: any) => s && s.id);
        console.log('Services récupérés via /agent-services:', JSON.stringify(services, null, 2));
      } catch (e) {
        console.log('Endpoint /agent-services non disponible, essai /services...');
        // Essayer l'endpoint /services avec filtre user
        try {
          const servicesResponse = await this.api.get<{ data: any[] }>(`${ENDPOINTS.SERVICES}?user_id=${user.id}`);
          services = servicesResponse.data.data || servicesResponse.data || [];
          console.log('Services récupérés via /services:', JSON.stringify(services, null, 2));
        } catch (e2) {
          console.log('Impossible de récupérer les services, utilisation service_id direct');
        }
      }
    }
    
    console.log('Services de l\'agent:', JSON.stringify(services, null, 2));
    
    // Récupérer les IDs de tous les services
    const serviceIds = services.map(s => s.id);
    
    // Si l'agent a un service_id direct, l'ajouter aussi
    if (user.service_id && !serviceIds.includes(user.service_id)) {
      serviceIds.push(user.service_id);
    }
    
    console.log('Service IDs à récupérer:', serviceIds);

    // Récupérer les catégories de taxes pour TOUS les services de l'agent
    let taxCategories: TaxCategorie[] = [];
    let taxTypes: TaxType[] = [];
    
    if (serviceIds.length > 0) {
      console.log(`🔍 Téléchargement des catégories pour ${serviceIds.length} service(s): [${serviceIds.join(', ')}]`);
      
      // Essayer d'abord avec un paramètre multiple
      try {
        const categoriesResponse = await this.api.get<{ data: TaxCategorie[] }>(
          `${ENDPOINTS.TAX_CATEGORIES}?service_ids=${serviceIds.join(',')}`
        );
        taxCategories = categoriesResponse.data.data || categoriesResponse.data || [];
        console.log(`✅ ${taxCategories.length} catégories récupérées via service_ids`);
      } catch (e) {
        // Si ça ne marche pas, récupérer service par service
        console.log('📥 Récupération des catégories service par service...');
        for (const serviceId of serviceIds) {
          try {
            const response = await this.api.get<{ data: TaxCategorie[] }>(
              `${ENDPOINTS.TAX_CATEGORIES}?service_id=${serviceId}`
            );
            const cats = response.data.data || response.data || [];
            console.log(`  ✅ Service ${serviceId}: ${cats.length} catégorie(s)`);
            taxCategories.push(...cats);
          } catch (err) {
            console.error(`  ❌ Service ${serviceId}: erreur récupération catégories`, err);
          }
        }
      }
      
      // Filtrer pour ne garder que les catégories des services de l'agent
      const beforeFilter = taxCategories.length;
      taxCategories = taxCategories.filter(cat => serviceIds.includes(cat.service_id));
      if (beforeFilter !== taxCategories.length) {
        console.log(`🔒 Filtrage: ${beforeFilter} → ${taxCategories.length} catégories (services autorisés uniquement)`);
      }
      
      // Récupérer les types de taxes pour tous les services
      console.log(`🔍 Téléchargement des types de taxes...`);
      try {
        const typesResponse = await this.api.get<{ data: TaxType[] }>(
          `${ENDPOINTS.TAX_TYPES}?service_ids=${serviceIds.join(',')}`
        );
        taxTypes = typesResponse.data.data || typesResponse.data || [];
        console.log(`✅ ${taxTypes.length} types de taxes récupérés via service_ids`);
      } catch (e) {
        // Si ça ne marche pas, récupérer service par service
        console.log('📥 Récupération des types de taxes service par service...');
        for (const serviceId of serviceIds) {
          try {
            const response = await this.api.get<{ data: TaxType[] }>(
              `${ENDPOINTS.TAX_TYPES}?service_id=${serviceId}`
            );
            const types = response.data.data || response.data || [];
            console.log(`  ✅ Service ${serviceId}: ${types.length} type(s)`);
            taxTypes.push(...types);
          } catch (err) {
            console.error(`  ❌ Service ${serviceId}: erreur récupération types`, err);
          }
        }
      }
      
      // Filtrer les types pour ne garder que ceux des catégories valides
      const validCategoryIds = taxCategories.map(c => c.id);
      const beforeTypeFilter = taxTypes.length;
      taxTypes = taxTypes.filter(type => validCategoryIds.includes(type.tax_categorie_id));
      if (beforeTypeFilter !== taxTypes.length) {
        console.log(`🔒 Filtrage types: ${beforeTypeFilter} → ${taxTypes.length} (catégories autorisées uniquement)`);
      }
    } else {
      console.log('⚠️ Aucun service trouvé pour l\'agent - aucune catégorie téléchargée');
    }
    
    console.log(`📊 Résumé téléchargement: ${taxCategories.length} catégories, ${taxTypes.length} types de taxes pour ${serviceIds.length} service(s)`);

    return {
      user,
      services,
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
