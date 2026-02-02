# Taxe Mobile Agent

Application mobile React Native pour les agents de collecte de taxes. Fonctionne en mode hors-ligne avec synchronisation vers l'API backend.

## 🚀 Fonctionnalités

- **Authentification** : Connexion sécurisée avec token
- **Mode hors-ligne** : Base de données SQLite locale
- **Enregistrement de paiements** : Formulaire multi-étapes
- **Historique** : Liste des paiements avec filtres et recherche
- **Reçus** : Génération de reçus avec QR Code
- **Synchronisation** : Sync automatique et manuelle avec le serveur

## 📁 Structure du projet

```
taxe-mobile-agent/
├── App.tsx                     # Point d'entrée
├── src/
│   ├── config/
│   │   └── api.ts              # Configuration API
│   ├── contexts/
│   │   ├── AuthContext.tsx     # Contexte authentification
│   │   └── SyncContext.tsx     # Contexte synchronisation
│   ├── database/
│   │   ├── database.ts         # Connexion SQLite
│   │   ├── repositories.ts     # Opérations CRUD
│   │   └── schema.ts           # Schéma des tables
│   ├── navigation/
│   │   └── AppNavigator.tsx    # Navigation React Navigation
│   ├── screens/
│   │   ├── auth/
│   │   │   └── LoginScreen.tsx
│   │   ├── home/
│   │   │   └── HomeScreen.tsx
│   │   ├── payment/
│   │   │   └── NewPaymentScreen.tsx
│   │   ├── history/
│   │   │   └── HistoryScreen.tsx
│   │   ├── receipt/
│   │   │   └── ReceiptScreen.tsx
│   │   └── profile/
│   │       └── ProfileScreen.tsx
│   ├── services/
│   │   ├── api.service.ts      # Client API
│   │   └── sync.service.ts     # Service de synchronisation
│   └── types/
│       └── index.ts            # Types TypeScript
```

## 🔧 Installation

```bash
# Installer les dépendances
npm install

# Démarrer en mode développement
npx expo start

# Démarrer pour Android
npx expo start --android

# Démarrer pour iOS
npx expo start --ios

# Démarrer en mode web
npx expo start --web
```

## ⚙️ Configuration

1. Modifier l'URL de l'API dans `src/config/api.ts` :

```typescript
export const API_CONFIG = {
  BASE_URL: 'http://VOTRE_IP:8000/api',
  TIMEOUT: 30000,
};
```

2. S'assurer que le backend Laravel est en cours d'exécution

## 📱 Fonctionnement

### Authentification
- Seuls les utilisateurs avec le rôle `agent` peuvent se connecter
- Le token est stocké localement pour les requêtes authentifiées

### Mode hors-ligne
- Les paiements sont enregistrés dans SQLite en statut `PENDING`
- La synchronisation se fait automatiquement quand la connexion est disponible
- Les données de référence (catégories, types de taxes) sont mises en cache localement

### Synchronisation
- **Automatique** : Quand l'appareil retrouve la connexion
- **Manuelle** : Via le bouton "Synchroniser" dans l'accueil ou le profil

## 📊 Base de données SQLite

Tables locales :
- `local_profile` : Profil de l'agent connecté
- `local_terminal` : Informations du terminal
- `local_tax_categorie` : Catégories de taxes (cache)
- `local_tax_types` : Types de taxes (cache)
- `local_payments_queue` : File d'attente des paiements
- `sync_state` : État de synchronisation

## 🔄 API Endpoints utilisés

```
POST /login              # Authentification
POST /logout             # Déconnexion
GET  /me                 # Profil utilisateur
GET  /tax-categories     # Liste des catégories
GET  /tax-types          # Liste des types de taxes
POST /payments           # Créer un paiement
GET  /payments/uuid/:uuid # Récupérer un paiement par UUID
```

## 📦 Dépendances principales

- `expo` - Framework React Native
- `expo-sqlite` - Base de données SQLite
- `@react-navigation/native` - Navigation
- `axios` - Client HTTP
- `react-native-qrcode-svg` - Génération de QR codes
- `expo-network` - Vérification de la connectivité
- `uuid` - Génération d'identifiants uniques

## 🛠️ Développement

### Ajouter un nouvel écran

1. Créer le composant dans `src/screens/`
2. L'exporter depuis `src/screens/index.ts`
3. L'ajouter dans `src/navigation/AppNavigator.tsx`

### Ajouter une nouvelle table SQLite

1. Ajouter le CREATE TABLE dans `src/database/schema.ts`
2. Ajouter les fonctions CRUD dans `src/database/repositories.ts`
3. Exporter depuis `src/database/index.ts`

## 📝 Licence

Projet privé - Tous droits réservés
