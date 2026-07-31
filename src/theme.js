import { Platform } from 'react-native';

const palette = {
  orange: '#FF5A00',
  orangeLight: '#FF7A33',
  orangeDark: '#D94700',
  black: '#000000',
  ink: '#090B0F',
  charcoal: '#11151B',
  graphite: '#1A2028',
  white: '#FFFFFF',
  gray100: '#F4F6F8',
  gray300: '#C8CDD4',
  gray500: '#8B939E',
  success: '#39D98A',
  warning: '#FFB020',
  danger: '#FF5C5C',
};

// Keep the original keys so existing screens remain fully compatible.
export const colors = {
  black: palette.black,
  white: palette.white,
  orange: palette.orange,
  gray: palette.gray300,
  background: palette.ink,
  surface: palette.charcoal,
  surfaceElevated: palette.graphite,
  text: palette.white,
  textMuted: palette.gray300,
  textSubtle: palette.gray500,
  border: 'rgba(255, 255, 255, 0.10)',
  overlay: 'rgba(5, 7, 10, 0.72)',
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
};

export const gradients = {
  brand: [palette.orangeLight, palette.orangeDark],
  screen: ['rgba(8, 10, 14, 0.76)', 'rgba(8, 10, 14, 0.96)'],
  card: ['rgba(8, 10, 14, 0.30)', 'rgba(8, 10, 14, 0.94)'],
};

export const spacing = (n = 1) => n * 8;

export const radii = {
  small: 8,
  medium: 14,
  large: 22,
  xlarge: 30,
  pill: 999,
};

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '900' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  overline: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.2 },
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
    },
    android: { elevation: 7 },
    default: {},
  }),
};

export const layout = {
  screenPadding: spacing(2),
  maxContentWidth: 980,
  minTouchTarget: 48,
};
