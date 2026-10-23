// Design tokens for EduNet
export const colors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  secondary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },
};

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
};

export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px',
};

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
};

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
};

/**
 * Dark-mode surface palette.
 *
 * Components reference Tailwind's `dark:` variants (class strategy), which are
 * toggled by the `.dark` class on `<html>`. These tokens document the palette
 * and let non-Tailwind renderers (emails, future native shells) stay aligned.
 */
export const darkTokens = {
  surfaces: {
    base: '#0b1220',
    raised: '#101827',
    border: '#374151',
  },
  text: {
    primary: '#f3f4f6',
    secondary: '#d1d5db',
    muted: '#9ca3af',
  },
};

/**
 * Bengali (বাংলা) typography.
 *
 * Bengali script needs looser line-height than Latin and explicit font
 * fallbacks:'Noto Sans Bengali' for UI text with system Bengali fonts as
 * fallback. The numeric scale maps Western digits to Bengali numerals for
 * locales where digits-as-words are preferred (bn-BD convention).
 */
export const bengaliTypography = {
  fontFamily:
    "'Noto Sans Bengali', 'Hind Siliguri', 'Kalpurush', 'SolaimanLipi', system-ui, sans-serif",
  lineHeight: { tight: 1.45, base: 1.75, relaxed: 1.9 },
};

export const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

/** Converts Latin digit strings (e.g. "12.5") to Bengali numerals. */
export function toBengaliNumerals(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => bengaliDigits[Number(digit)]);
}

export const locales = ['en', 'bn'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

/** Document-language direction map; both EduNet languages are LTR, kept for RTL readiness. */
export const localeDirection: Record<Locale, 'ltr' | 'rtl'> = { en: 'ltr', bn: 'ltr' };
