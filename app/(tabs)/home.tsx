import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts';
import { useSyncWithPaymentUpdates } from '../../src/hooks';
import { getTodayPaymentsStats } from '../../src/database';
import { Colors, Shadows } from '../../src/theme';
import { scale, fontScale, rs, rf, rr, wp, hp, isSmallScreen } from '../../src/utils/responsive';

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const { isOnline, isSyncing, pendingCount, syncAll } = useSyncWithPaymentUpdates();
  const [stats, setStats] = useState({ count: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Animations basées sur le scroll
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  const headerScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });

  const balanceCardTranslate = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, -20],
    extrapolate: 'clamp',
  });

  const loadStats = async () => {
    if (profile) {
      const todayStats = await getTodayPaymentsStats(profile.user_id);
      setStats(todayStats);
    }
  };

  // Recharger les stats à chaque fois que l'écran reçoit le focus
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [profile])
  );

  useEffect(() => {
    loadStats();
  }, [profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    await loadStats();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FC';
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  return (
    <View style={styles.container}>
      {/* Background decorations */}
      <View style={styles.backgroundGradient} />
      
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ scale: headerScale }] }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Bonjour 👋</Text>
              <Text style={styles.userName}>{profile?.fullname || 'Agent'}</Text>
            </View>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, isOnline ? styles.online : styles.offline]} />
              <Text style={styles.statusText}>
                {isOnline ? 'En ligne' : 'Hors ligne'}
              </Text>
            </View>
          </View>
          
          <Text style={styles.userId}>ID: {profile?.user_uid}</Text>
          
          {pendingCount > 0 && (
            <View style={styles.pendingBanner}>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.warning} />
              <Text style={styles.pendingText}>{pendingCount} paiement(s) en attente de sync</Text>
            </View>
          )}
        </Animated.View>

        {/* Balance Card */}
        <Animated.View style={[styles.balanceCard, { transform: [{ translateY: balanceCardTranslate }] }]}>
          <LinearGradient
            colors={[Colors.primary, Colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceGradient}
          >
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Collecte du jour</Text>
              <View style={styles.todayBadge}>
                <Text style={styles.todayText}>Aujourd'hui</Text>
              </View>
            </View>
            <Text style={styles.balanceAmount}>{formatCurrency(stats.total)}</Text>
            <View style={styles.balanceFooter}>
              <View style={styles.balanceStat}>
                <Ionicons name="receipt-outline" size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.balanceStatText}>{stats.count} paiements</Text>
              </View>
            </View>
            
            {/* Decorative circles */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
          </LinearGradient>
        </Animated.View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        
        <View style={styles.quickActionsGrid}>
          <Link href="/payment/new" asChild>
            <TouchableOpacity style={styles.quickActionCard} activeOpacity={0.7}>
              <LinearGradient
                colors={['rgba(0, 245, 160, 0.15)', 'rgba(0, 217, 255, 0.05)']}
                style={styles.quickActionGradient}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(0, 245, 160, 0.2)' }]}>
                  <Ionicons name="add-circle" size={28} color={Colors.accentGreen} />
                </View>
                <Text style={styles.quickActionTitle}>Nouveau</Text>
                <Text style={styles.quickActionSubtitle}>Paiement</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Link>

          <Link href="/(tabs)/history" asChild>
            <TouchableOpacity style={styles.quickActionCard} activeOpacity={0.7}>
              <LinearGradient
                colors={['rgba(123, 97, 255, 0.15)', 'rgba(123, 97, 255, 0.05)']}
                style={styles.quickActionGradient}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(123, 97, 255, 0.2)' }]}>
                  <Ionicons name="time" size={28} color={Colors.primary} />
                </View>
                <Text style={styles.quickActionTitle}>Historique</Text>
                <Text style={styles.quickActionSubtitle}>Paiements</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Sync Card */}
        <TouchableOpacity
          style={styles.syncCard}
          onPress={syncAll}
          disabled={isSyncing}
          activeOpacity={0.7}
        >
          <View style={styles.syncContent}>
            <View style={[styles.syncIcon, isSyncing && styles.syncIconActive]}>
              <Ionicons 
                name={isSyncing ? 'sync' : 'cloud-upload'} 
                size={24} 
                color={isSyncing ? Colors.accent : Colors.primary} 
              />
            </View>
            <View style={styles.syncText}>
              <Text style={styles.syncTitle}>Synchronisation</Text>
              <Text style={styles.syncSubtitle}>
                {isSyncing ? 'En cours...' : `${pendingCount} en attente`}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 100 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: hp(35),
    backgroundColor: Colors.backgroundSecondary,
    borderBottomLeftRadius: rr.xxl,
    borderBottomRightRadius: rr.xxl,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: rs.lg,
  },
  header: {
    paddingTop: hp(7),
    marginBottom: rs.lg,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: rf.lg,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: rf.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: rs.xs,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCardLight,
    paddingHorizontal: rs.md,
    paddingVertical: rs.sm,
    borderRadius: rr.full,
  },
  statusDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    marginRight: rs.sm,
  },
  online: {
    backgroundColor: Colors.success,
  },
  offline: {
    backgroundColor: Colors.error,
  },
  statusText: {
    fontSize: rf.sm,
    color: Colors.textSecondary,
  },
  userId: {
    fontSize: rf.sm,
    color: Colors.textMuted,
    marginTop: rs.sm,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    paddingHorizontal: rs.md,
    paddingVertical: rs.sm,
    borderRadius: rr.md,
    marginTop: rs.md,
    gap: rs.sm,
  },
  pendingText: {
    fontSize: rf.sm,
    color: Colors.warning,
    fontWeight: '500',
  },
  balanceCard: {
    marginBottom: rs.xl,
    borderRadius: rr.xxl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  balanceGradient: {
    padding: rs.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs.md,
  },
  balanceLabel: {
    fontSize: rf.md,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  todayBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: rs.md,
    paddingVertical: rs.xs,
    borderRadius: rr.full,
  },
  todayText: {
    fontSize: rf.xs,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: rf.hero,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  balanceFooter: {
    marginTop: rs.lg,
  },
  balanceStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs.sm,
  },
  balanceStatText: {
    fontSize: rf.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  decorCircle1: {
    position: 'absolute',
    top: scale(-30),
    right: scale(-30),
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: scale(-40),
    right: scale(60),
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  sectionTitle: {
    fontSize: rf.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: rs.lg,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: rs.md,
    marginBottom: rs.xl,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: rr.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickActionGradient: {
    padding: rs.lg,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: scale(56),
    height: scale(56),
    borderRadius: rr.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rs.md,
  },
  quickActionTitle: {
    fontSize: rf.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  quickActionSubtitle: {
    fontSize: rf.sm,
    color: Colors.textSecondary,
    marginTop: rs.xs,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xl,
    padding: rs.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs.md,
  },
  syncIcon: {
    width: scale(48),
    height: scale(48),
    borderRadius: rr.lg,
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncIconActive: {
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
  },
  syncText: {
    gap: rs.xs,
  },
  syncTitle: {
    fontSize: rf.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  syncSubtitle: {
    fontSize: rf.sm,
    color: Colors.textSecondary,
  },
});
