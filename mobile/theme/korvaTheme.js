// Korva Design System
// Fuente de verdad visual para la app móvil.
// El naranja evita deliberadamente el #FC4C02 usado durante prototipos.

export const colors = {
  background: '#0D1B2A',
  backgroundDeep: '#091725',

  surface: '#152F4A',
  surfaceStrong: '#1E3A5F',
  surfaceSoft: '#14283B',
  surfaceRaised: '#183553',

  text: '#FFFFFF',
  textSoft: '#A8CFFF',
  textMuted: '#7897B7',
  textDim: '#58748F',

  brandOrange: '#F36B0A',
  brandOrangeSoft: '#FFB078',

  actionBlue: '#67A9FF',
  actionBlueStrong: '#1E6FD9',

  border: '#2A4A6A',
  borderSoft: '#244766',
  borderStrong: '#31506B',

  success: '#4CAF50',
  danger: '#FF5555',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const type = {
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    fontSize: 13,
    fontWeight: '400',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
  },
  metric: {
    fontSize: 62,
    lineHeight: 66,
    fontWeight: '900',
    letterSpacing: -2.5,
  },
};

export const korvaTheme = {
  colors,
  spacing,
  radius,
  type,
};

export default korvaTheme;
