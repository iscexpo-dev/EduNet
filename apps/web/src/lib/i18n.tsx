'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createTranslator,
  defaultLocale,
  isLocale,
  localeDirection,
  translate,
  type Locale,
  type MessageKey,
} from '@edunet/i18n';

const STORAGE_KEY = 'edunet-lang';

interface I18nContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey | string, values?: Record<string, string | number>) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isLocale(stored)) setLocaleState(stored);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection[locale];
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* session-only preference */
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'en' ? 'bn' : 'en');
  }, [locale, setLocale]);

  const value = useMemo<I18nContextValue>(() => {
    const translator = createTranslator(locale);
    return {
      locale,
      direction: translator.direction,
      setLocale,
      toggleLocale,
      t: (key, values) => translate(locale, key, values),
      formatDate: translator.formatDate,
      formatNumber: translator.formatNumber,
    };
  }, [locale, setLocale, toggleLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside LocaleProvider');
  }
  return context;
}
