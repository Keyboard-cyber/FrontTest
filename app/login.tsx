import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts';
import { Colors, Shadows } from '../src/theme';
import { scale, rs, rf, rr, wp, hp } from '../src/utils/responsive';

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [userUid, setUserUid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!userUid.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    const result = await login({ user_uid: userUid.trim(), password });

    if (result.success) {
      // Rediriger selon le rôle
      if (result.role === 'controleur') {
        router.replace('/(controller)/scan' as any);
      } else {
        router.replace('/(tabs)/home');
      }
    } else {
      Alert.alert('Erreur de connexion', result.error || 'Une erreur est survenue');
    }
  };

  return (
    <View style={styles.container}>
      {/* Background gradient circles */}
      <View style={styles.backgroundCircle1} />
      <View style={styles.backgroundCircle2} />
      
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Logo/Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/logo.png')} 
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Taxe Mobile</Text>
            <Text style={styles.subtitle}>Collecte Simplifiée</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.welcomeText}>Bienvenue</Text>
            <Text style={styles.instructionText}>Connectez-vous pour continuer</Text>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={userUid}
                  onChangeText={setUserUid}
                  placeholder="Identifiant Agent"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mot de passe"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons 
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
                    size={20} 
                    color={Colors.textMuted} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Se connecter</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Version 1.0.0</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundCircle1: {
    position: 'absolute',
    top: hp(-18),
    right: wp(-25),
    width: scale(300),
    height: scale(300),
    borderRadius: scale(150),
    backgroundColor: Colors.primary,
    opacity: 0.1,
  },
  backgroundCircle2: {
    position: 'absolute',
    bottom: hp(-12),
    left: wp(-25),
    width: scale(250),
    height: scale(250),
    borderRadius: scale(125),
    backgroundColor: Colors.accent,
    opacity: 0.08,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: rs.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: rs.xxl,
  },
  logoContainer: {
    marginBottom: rs.lg,
  },
  logo: {
    width: scale(120),
    height: scale(120),
    borderRadius: rr.xl,
  },
  title: {
    fontSize: rf.xxxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: rf.lg,
    color: Colors.textSecondary,
    marginTop: rs.xs,
  },
  formCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: rr.xxl,
    padding: rs.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.lg,
  },
  welcomeText: {
    fontSize: rf.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: rs.xs,
  },
  instructionText: {
    fontSize: rf.md,
    color: Colors.textSecondary,
    marginBottom: rs.xl,
  },
  inputContainer: {
    marginBottom: rs.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCardLight,
    borderRadius: rr.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: {
    paddingLeft: rs.md,
  },
  input: {
    flex: 1,
    padding: rs.md,
    fontSize: rf.lg,
    color: Colors.textPrimary,
  },
  eyeIcon: {
    padding: rs.md,
  },
  button: {
    marginTop: rs.md,
    borderRadius: rr.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs.md + 2,
    paddingHorizontal: rs.xl,
    gap: rs.sm,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontSize: rf.lg,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: rs.xxl,
    fontSize: rf.sm,
  },
});
