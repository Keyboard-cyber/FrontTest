import { Dimensions, PixelRatio, Platform, ScaledSize } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Fixed dimensions for 1280x720 (No responsive scaling)
const FIXED_WIDTH = 1280;
const FIXED_HEIGHT = 720;

// Détection du type d'écran (basé sur tailles fixes)
export const isSmallScreen = false;
export const isMediumScreen = false;
export const isLargeScreen = true;
export const isTablet = true;

// Width percentage (fixed)
export const wp = (widthPercent: number): number => {
  return Math.round((FIXED_WIDTH * widthPercent) / 100);
};

// Height percentage (fixed)
export const hp = (heightPercent: number): number => {
  return Math.round((FIXED_HEIGHT * heightPercent) / 100);
};

// Scale responsive basé sur largeur fixe
export const scale = (size: number): number => {
  return Math.round(size);
};

// Scale vertical basé sur hauteur fixe
export const verticalScale = (size: number): number => {
  return Math.round(size);
};

// Scale modéré (pas de modification pour écran fixe)
export const moderateScale = (size: number, factor = 0.5): number => {
  return Math.round(size);
};

// Font size responsive (pas de scaling)
export const fontScale = (size: number): number => {
  return Math.round(size);
};

// Dimensions de l'écran
export const screen = {
  width: FIXED_WIDTH,
  height: FIXED_HEIGHT,
};

// Spacing fixed (no responsive)
export const rs = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Font sizes fixed (no responsive)
export const rf = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
  hero: 42,
};

// Border radius fixed (no responsive)
export const rr = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
};

// Hook pour écouter les changements de dimensions (rotation)
export const getScreenDimensions = (): ScaledSize => Dimensions.get('window');

// Padding sécurisé pour les écrans avec notch
export const getSafeAreaPadding = () => ({
  top: 0,
  bottom: 0,
});

export default {
  wp,
  hp,
  scale,
  verticalScale,
  moderateScale,
  fontScale,
  screen,
  rs,
  rf,
  rr,
  isSmallScreen,
  isMediumScreen,
  isLargeScreen,
  isTablet,
  getSafeAreaPadding,
};
