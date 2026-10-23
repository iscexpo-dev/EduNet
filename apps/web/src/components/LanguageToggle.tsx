'use client';

import { useI18n } from '@/lib/i18n';

/** Language switch that updates `<html lang>` and persists the preference. */
export function LanguageToggle() {
  const { locale, toggleLocale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={t('common.language')}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      {locale === 'en' ? 'বাংলা' : 'English'}
    </button>
  );
}
