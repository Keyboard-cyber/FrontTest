import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useSync } from '../../src/contexts';
import { getCategoriesCountByService, getTotalCategoriesCount, getTotalTaxTypesCount } from '../../src/database';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../../src/theme';

export default function ProfileScreen() {
  const { profile, user, logout } = useAuth();
  const { isOnline, isSyncing, pendingCount, lastSyncTime, syncAll } = useSync();
  
  // État pour les stats des données locales
  const [dataStats, setDataStats] = useState<{
    serviceIds: number[];
    categoriesPerService: { service_id: number; count: number }[];
    totalCategories: number;
    totalTaxTypes: number;
  }>({
    serviceIds: [],
    categoriesPerService: [],
    totalCategories: 0,
    totalTaxTypes: 0,
  });

  // Charger les stats au montage
  useEffect(() => {
    const loadStats = async () => {
      try {
        // Récupérer les IDs des services depuis le profil
        let serviceIds: number[] = [];
        if (profile?.service_ids) {
          try {
            serviceIds = JSON.parse(profile.service_ids);
          } catch (e) {
            if (profile.service_id) serviceIds = [profile.service_id];
          }
        } else if (profile?.service_id) {
          serviceIds = [profile.service_id];
        }

        // Récupérer les comptages
        const categoriesPerService = await getCategoriesCountByService();
        const totalCategories = await getTotalCategoriesCount();
        const totalTaxTypes = await getTotalTaxTypesCount();

        setDataStats({
          serviceIds,
          categoriesPerService,
          totalCategories,
          totalTaxTypes,
        });
      } catch (error) {
        console.error('Erreur chargement stats:', error);
      }
    };

    loadStats();
  }, [profile]);

  const handleLogout = () => {
    if (pendingCount > 0) {
      Alert.alert(
        'Paiements en attente',
        `Vous avez ${pendingCount} paiement(s) non synchronisé(s). Ils seront perdus si vous vous déconnectez sans synchroniser.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Synchroniser d\'abord', onPress: syncAll },
          {
            text: 'Déconnecter quand même',
            style: 'destructive',
            onPress: async () => {
              await logout();
              router.replace('/login');
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Déconnexion',
        'Êtes-vous sûr de vouloir vous déconnecter ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Déconnecter', 
            style: 'destructive', 
            onPress: async () => {
              await logout();
              router.replace('/login');
            }
          },
        ]
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <LinearGradient
          colors={[Colors.backgroundSecondary, Colors.background]}
          style={styles.header}
        >
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {profile?.fullname?.charAt(0).toUpperCase() || 'A'}
              </Text>
            </LinearGradient>
          </View>
          <Text style={styles.name}>{profile?.fullname}</Text>
          <Text style={styles.uid}>ID: {profile?.user_uid}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
            <Text style={styles.roleText}>Agent</Text>
          </View>
        </LinearGradient>

        {/* Info cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="call-outline" size={18} color={Colors.accentGreen} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Téléphone</Text>
                <Text style={styles.infoValue}>{user?.phone || 'N/A'}</Text>
              </View>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="location-outline" size={18} color={Colors.accent} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Zone</Text>
                <Text style={styles.infoValue}>{profile?.zone || 'Non définie'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Services section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services & Données</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: 'rgba(123, 97, 255, 0.15)' }]}>
                <Ionicons name="briefcase-outline" size={18} color={Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Services liés</Text>
                <Text style={styles.infoValue}>
                  {dataStats.serviceIds.length} service(s)
                </Text>
              </View>
            </View>
            
            {/* Liste des services avec leurs catégories */}
            {dataStats.categoriesPerService.map((item, index) => (
              <View 
                key={item.service_id}
                style={[
                  styles.infoRow,
                  index === dataStats.categoriesPerService.length - 1 && { borderBottomWidth: 0 }
                ]}
              >
                <View style={[styles.infoIconContainer, { backgroundColor: 'rgba(0, 200, 150, 0.15)' }]}>
                  <Ionicons name="grid-outline" size={18} color={Colors.accentGreen} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Service #{item.service_id}</Text>
                  <Text style={styles.infoValue}>
                    {item.count} catégorie(s)
                  </Text>
                </View>
              </View>
            ))}
            
            {dataStats.categoriesPerService.length === 0 && (
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.infoIconContainer, { backgroundColor: 'rgba(255, 184, 0, 0.15)' }]}>
                  <Ionicons name="alert-outline" size={18} color={Colors.warning} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Aucune catégorie</Text>
                  <Text style={styles.infoValue}>Synchronisez pour télécharger</Text>
                </View>
              </View>
            )}
          </View>

          {/* Stats globales */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(123, 97, 255, 0.15)', 'rgba(123, 97, 255, 0.05)']}
                style={styles.statCardGradient}
              >
                <Ionicons name="layers-outline" size={24} color={Colors.primary} />
                <Text style={styles.statValue}>{dataStats.totalCategories}</Text>
                <Text style={styles.statLabel}>Catégories</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(0, 200, 150, 0.15)', 'rgba(0, 200, 150, 0.05)']}
                style={styles.statCardGradient}
              >
                <Ionicons name="pricetags-outline" size={24} color={Colors.accentGreen} />
                <Text style={styles.statValue}>{dataStats.totalTaxTypes}</Text>
                <Text style={styles.statLabel}>Types de taxes</Text>
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* Sync status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synchronisation</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIconContainer, { backgroundColor: isOnline ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 71, 87, 0.15)' }]}>
                <Ionicons 
                  name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'} 
                  size={18} 
                  color={isOnline ? Colors.success : Colors.error} 
                />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Statut</Text>
                <Text style={[styles.infoValue, { color: isOnline ? Colors.success : Colors.error }]}>
                  {isOnline ? 'En ligne' : 'Hors ligne'}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Dernière sync</Text>
                <Text style={styles.infoValue}>{formatDate(lastSyncTime)}</Text>
              </View>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <View style={[styles.infoIconContainer, { backgroundColor: pendingCount > 0 ? 'rgba(255, 184, 0, 0.15)' : 'rgba(123, 97, 255, 0.15)' }]}>
                <Ionicons name="hourglass-outline" size={18} color={pendingCount > 0 ? Colors.warning : Colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>En attente</Text>
                <Text style={[styles.infoValue, pendingCount > 0 && { color: Colors.warning }]}>
                  {pendingCount} paiement(s)
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
            onPress={syncAll}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.syncButtonGradient}
            >
              <Ionicons name="sync" size={20} color="#FFFFFF" />
              <Text style={styles.syncButtonText}>
                {isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application</Text>
          
          <View style={styles.infoCard}>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Version</Text>
                <Text style={styles.infoValue}>1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    padding: Spacing.xl,
    paddingTop: 70,
    paddingBottom: Spacing.xxl,
  },
  avatarContainer: {
    marginBottom: Spacing.lg,
    ...Shadows.glow,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  name: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  uid: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  roleText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  section: {
    padding: Spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  infoLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  infoValue: {
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  statCardGradient: {
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  syncButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  syncButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
    gap: Spacing.sm,
  },
  logoutText: {
    color: Colors.error,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
  },
});
