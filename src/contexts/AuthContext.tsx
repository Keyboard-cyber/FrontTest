import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LocalProfile, User, LoginCredentials, LocalTaxCategorie, LocalTaxType, LocalTerminal } from '../types';
import { 
  initializeDatabase, 
  getLocalProfile, 
  saveLocalProfile, 
  clearLocalProfile,
  clearAllData,
  saveTaxCategories,
  saveTaxTypes,
  saveLocalTerminal,
} from '../database';
import { apiService, syncService } from '../services';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: LocalProfile | null;
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Initialiser l'application
  useEffect(() => {
    const init = async () => {
      try {
        // Initialiser la base de données
        await initializeDatabase();
        
        // Vérifier s'il y a un profil local
        const localProfile = await getLocalProfile();
        
        if (localProfile) {
          setProfile(localProfile);
          setIsAuthenticated(true);
          
          // Essayer de récupérer les infos utilisateur à jour
          try {
            const userData = await apiService.getMe();
            setUser(userData);
          } catch (error) {
            // Mode hors ligne - utiliser les données locales
            setUser({
              id: localProfile.user_id,
              uid: localProfile.user_uid,
              fullname: localProfile.fullname,
              email: '',
              phone: '',
              role: 'agent',
              service_id: localProfile.service_id,
              zone: localProfile.zone,
              is_active: true,
            });
          }
        }
      } catch (error) {
        console.error('Erreur initialisation:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      
      // 1. Authentification
      const response = await apiService.login(credentials);
      
      // Debug: voir la structure de la réponse
      console.log('Réponse login complète:', JSON.stringify(response, null, 2));
      
      // Extraire le token - l'API retourne { token: "..." }
      const token = response.token || (response as any).access_token || (response as any).data?.token;
      
      if (!token) {
        console.error('Token manquant dans la réponse');
        return { success: false, error: 'Token manquant dans la réponse API' };
      }
      
      console.log('Token extrait:', token);

      // 2. Définir le token pour les requêtes suivantes
      apiService.setToken(token);
      
      // 3. Récupérer les informations de l'utilisateur via /me
      console.log('Récupération des informations utilisateur...');
      let userData: any;
      try {
        userData = await apiService.getMe();
        console.log('User data depuis /me:', JSON.stringify(userData, null, 2));
      } catch (meError: any) {
        console.error('Erreur récupération /me:', meError);
        apiService.clearToken();
        return { success: false, error: 'Impossible de récupérer les informations utilisateur' };
      }
      
      if (!userData || !userData.id) {
        console.error('Structure user invalide depuis /me');
        apiService.clearToken();
        return { success: false, error: 'Données utilisateur invalides' };
      }
      
      // Debug: afficher le rôle exact
      console.log('Rôle utilisateur:', userData.role, '| Type:', typeof userData.role);
      
      // Vérifier que c'est bien un agent (accepter 'agent', 'Agent', ou absence de rôle)
      const userRole = (userData.role || '').toLowerCase().trim();
      if (userRole && userRole !== 'agent') {
        console.error('Rôle non autorisé:', userRole);
        apiService.clearToken();
        return { success: false, error: `Seuls les agents peuvent utiliser cette application (votre rôle: ${userData.role})` };
      }
      
      // 4. Récupérer toutes les données initiales de l'agent
      console.log('Récupération des données initiales de l\'agent...');
      let initialData;
      try {
        initialData = await apiService.getAgentInitialData();
        console.log('Données initiales reçues:', JSON.stringify(initialData, null, 2));
      } catch (initError: any) {
        console.error('Erreur récupération données initiales:', initError);
        // Continuer sans les données initiales - on les récupérera plus tard
        initialData = { terminals: [], taxCategories: [], taxTypes: [], services: [] };
      }
      
      // Récupérer le service_id depuis le tableau services si pas de service_id direct
      let serviceId = userData.service_id || 0;
      if (!serviceId && userData.services && userData.services.length > 0) {
        serviceId = userData.services[0].id;
        console.log('Service ID récupéré depuis le tableau services:', serviceId);
      }
      
      // 5. Sauvegarder le profil local
      const localProfile: LocalProfile = {
        user_id: userData.id,
        user_uid: userData.uid || userData.user_uid || '',
        fullname: userData.fullname || userData.name || userData.full_name || '',
        service_id: serviceId,
        zone: userData.zone || null,
        token: token,
        saved_at: new Date().toISOString(),
      };
      
      console.log('Profil local à sauvegarder:', JSON.stringify(localProfile, null, 2));
      
      await saveLocalProfile(localProfile);
      console.log('Profil local sauvegardé');

      // 5. Sauvegarder les terminaux de l'agent
      if (initialData.terminals && initialData.terminals.length > 0) {
        for (const terminal of initialData.terminals) {
          console.log('Terminal brut:', JSON.stringify(terminal, null, 2));
          const localTerminal: LocalTerminal = {
            terminal_id: (terminal as any).id || 0,
            terminal_uid: terminal.terminal_uid || (terminal as any).uid || '',
            user_id: terminal.user_id || userData.id,
            user_uid: (terminal as any).user_uid || userData.uid || localProfile.user_uid || String(userData.id),
            is_blocked: terminal.is_blocked ? 1 : 0,
            last_sync_at: terminal.last_sync_at || null,
          };
          console.log('Terminal à sauvegarder:', JSON.stringify(localTerminal, null, 2));
          await saveLocalTerminal(localTerminal);
        }
        console.log(`${initialData.terminals.length} terminal(s) sauvegardé(s)`);
      }

      // 6. Sauvegarder les catégories de taxes
      if (initialData.taxCategories && initialData.taxCategories.length > 0) {
        console.log('Catégories brutes:', JSON.stringify(initialData.taxCategories[0], null, 2));
        const localCategories: LocalTaxCategorie[] = initialData.taxCategories.map(cat => ({
          tax_categorie_id: cat.id,
          service_id: cat.service_id,
          label: cat.label || (cat as any).name || (cat as any).title || '',
          is_active: cat.is_active ? 1 : 0,
          created_at: cat.created_at || new Date().toISOString(),
          updated_at: cat.updated_at || new Date().toISOString(),
        }));
        console.log('Catégorie transformée exemple:', JSON.stringify(localCategories[0], null, 2));
        await saveTaxCategories(localCategories);
        console.log(`${localCategories.length} catégorie(s) de taxes sauvegardée(s)`);
      }

      // 7. Sauvegarder les types de taxes
      if (initialData.taxTypes && initialData.taxTypes.length > 0) {
        console.log('Types de taxes bruts:', JSON.stringify(initialData.taxTypes[0], null, 2));
        const localTypes: LocalTaxType[] = initialData.taxTypes.map(type => ({
          tax_type_id: type.id,
          tax_categorie_id: type.tax_categorie_id || (type as any).categorie_id || (type as any).category_id,
          label: type.label || (type as any).name || (type as any).title || '',
          amount: type.amount || (type as any).price || (type as any).default_amount || 0,
          min_amount: type.min_amount || (type as any).minimum_amount || null,
          max_amount: type.max_amount || (type as any).maximum_amount || null,
          require_chassis_number: type.require_chassis_number ? 1 : 0,
          require_color: type.require_color ? 1 : 0,
          sort_order: type.sort_order || (type as any).order || 0,
          is_active: type.is_active ? 1 : 0,
          created_at: type.created_at || new Date().toISOString(),
          updated_at: type.updated_at || new Date().toISOString(),
        }));
        console.log('Type transformé exemple:', JSON.stringify(localTypes[0], null, 2));
        await saveTaxTypes(localTypes);
        console.log(`${localTypes.length} type(s) de taxes sauvegardé(s)`);
      }

      // Effacer le token temporaire (sera lu depuis le profil local)
      apiService.clearToken();
      
      setProfile(localProfile);
      setUser(userData);
      setIsAuthenticated(true);

      console.log('Connexion et synchronisation initiale réussies !');

      return { success: true };
    } catch (error: any) {
      console.error('Erreur login:', error);
      apiService.clearToken();
      const message = error.response?.data?.message || error.message || 'Erreur de connexion';
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      
      // Essayer de déconnecter côté serveur
      try {
        await apiService.logout();
      } catch (error) {
        // Ignorer les erreurs de déconnexion serveur
      }
      
      // Nettoyer les données locales
      await clearAllData();
      
      setProfile(null);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    const localProfile = await getLocalProfile();
    if (localProfile) {
      setProfile(localProfile);
      try {
        const userData = await apiService.getMe();
        setUser(userData);
      } catch (error) {
        // Mode hors ligne
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        profile,
        user,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
