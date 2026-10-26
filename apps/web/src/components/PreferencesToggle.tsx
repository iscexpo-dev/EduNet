'use client';

import { useEffect, useState } from 'react';
import { Button } from '@edunet/ui';
import { isLocale, localeDirection, type Locale } from '@edunet/ui';

/** Preference toggles for theme and language (English/Bengali).
 *  Writes localStorage and document attributes; a reload-free class switch. */
export function PreferencesToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted preferences after hydration
    setDark(document.documentElement.classList.contains('dark'));
    const storedLang = localStorage.getItem('edunet-lang');
    if (storedLang && isLocale(storedLang)) setLocale(storedLang);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('edunet-theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable (private mode) — session-only preference */
    }
  }

  function toggleLanguage() {
    const next: Locale = locale === 'en' ? 'bn' : 'en';
    setLocale(next);
    document.documentElement.lang = next;
    document.documentElement.dir = localeDirection[next];
    try {
      localStorage.setItem('edunet-lang', next);
    } catch {
      /* session-only preference */
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={toggleTheme} aria-pressed={dark ?? false}>
        {dark === null ? '☾' : dark ? '☀' : '☾'}
      </Button>
      <Button variant="outline" size="sm" onClick={toggleLanguage} aria-pressed={locale === 'bn'}>
        {locale === 'en' ? 'বাংলা' : 'EN'}
      </Button>
    </div>
  );
}
