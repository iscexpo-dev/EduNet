/**
 * Internationalisation for EduNet.
 *
 * - Bengali and English are both complete catalogues (see translations.ts).
 * - Formatting goes through Intl so dates, numbers and plurals are correct for
 *   each locale rather than hand-rolled string replacement.
 * - `normalizeForSearch` folds Bengali and Latin text for consistent matching.
 */

import {
  catalogues,
  defaultLocale,
  isMessageKey,
  localeDirection,
  localeNames,
  locales,
  type Locale,
  type MessageKey,
} from './translations';

export {
  catalogues,
  defaultLocale,
  isMessageKey,
  localeDirection,
  localeNames,
  locales,
};
export type { Locale, MessageKey };

export const localeTags: Record<Locale, string> = {
  en: 'en-GB',
  bn: 'bn-BD',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Picks the best supported locale from an `Accept-Language` header. */
export function detectLocale(acceptLanguage: string | undefined | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

export type InterpolationValues = Record<string, string | number>;

/**
 * Replaces `{name}` placeholders. Unknown placeholders are left intact so a
 * missing value is visible in QA instead of silently rendering "undefined".
 */
export function interpolate(template: string, values: InterpolationValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Looks up a key in the requested locale, falling back to English, then to the
 * key itself. This keeps a missing Bengali string from blanking the UI.
 */
export function translate(
  locale: Locale,
  key: MessageKey | string,
  values?: InterpolationValues,
): string {
  const catalogue = catalogues[locale] ?? catalogues[defaultLocale];
  const fallback = catalogues[defaultLocale];

  let template: string | undefined;
  if (isMessageKey(key)) {
    template = catalogue[key] ?? fallback[key];
  } else {
    template = (catalogue as Record<string, string>)[key] ?? (fallback as Record<string, string>)[key];
  }

  return interpolate(template ?? key, values);
}

export interface Translator {
  locale: Locale;
  t: (key: MessageKey | string, values?: InterpolationValues) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatRelativeTime: (value: Date | number, now?: Date) => string;
  direction: 'ltr' | 'rtl';
}

export function createTranslator(locale: Locale = defaultLocale): Translator {
  return {
    locale,
    t: (key, values) => translate(locale, key, values),
    formatDate: (date, options) => formatDate(date, locale, options),
    formatNumber: (value, options) => formatNumber(value, locale, options),
    formatRelativeTime: (value, now) => formatRelativeTime(value, locale, now),
    direction: localeDirection[locale],
  };
}

export function formatDate(
  date: Date | string | number,
  locale: Locale = defaultLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';

  // Intl forbids mixing `dateStyle` with individual fields; callers that pass
  // fields get them applied exactly, everyone else gets the medium style.
  const hasExplicitFields = Object.keys(options).some(
    (key) => key !== 'timeZone' && key !== 'calendar' && key !== 'numberingSystem',
  );
  const formatOptions: Intl.DateTimeFormatOptions = hasExplicitFields
    ? { timeZone: 'UTC', ...options }
    : { dateStyle: 'medium', timeZone: 'UTC', ...options };

  const formatted = new Intl.DateTimeFormat(localeTags[locale], formatOptions).format(value);
  return locale === 'bn' ? toBengaliDigits(formatted) : formatted;
}

export function formatDateTime(
  date: Date | string | number,
  locale: Locale = defaultLocale,
): string {
  return formatDate(date, locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
}

export function formatNumber(
  value: number,
  locale: Locale = defaultLocale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return '';
  const formatted = new Intl.NumberFormat(localeTags[locale], options).format(value);
  return locale === 'bn' ? toBengaliDigits(formatted) : formatted;
}

export function formatPercent(
  fraction: number,
  locale: Locale = defaultLocale,
  maximumFractionDigits = 0,
): string {
  const formatted = new Intl.NumberFormat(localeTags[locale], {
    style: 'percent',
    maximumFractionDigits,
  }).format(Number.isFinite(fraction) ? fraction : 0);
  return locale === 'bn' ? toBengaliDigits(formatted) : formatted;
}

type RelativeUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';

const RELATIVE_UNITS: RelativeUnit[] = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
];

const UNIT_MS: Record<RelativeUnit, number> = {
  year: 365 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
  second: 1000,
};

export function formatRelativeTime(
  value: Date | number,
  locale: Locale = defaultLocale,
  now: Date = new Date(),
): string {
  const target = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(target.getTime())) return '';

  const deltaMs = target.getTime() - now.getTime();
  const absolute = Math.abs(deltaMs);

  for (const unit of RELATIVE_UNITS) {
    if (absolute >= UNIT_MS[unit] || unit === 'second') {
      const amount = Math.round(deltaMs / UNIT_MS[unit]);
      const formatted = new Intl.RelativeTimeFormat(localeTags[locale], {
        numeric: 'auto',
      }).format(amount, unit as Intl.RelativeTimeFormatUnit);
      return locale === 'bn' ? toBengaliDigits(formatted) : formatted;
    }
  }

  return new Intl.RelativeTimeFormat(localeTags[locale], { numeric: 'auto' }).format(0, 'second');
}

/**
 * Restrictive, locale-aware search normalisation: NFC first, then case folding
 * and whitespace collapsing. Bengali combining marks are preserved because
 * stripping them changes meaning. Latin diacritics are folded too.
 */
export function normalizeForSearch(input: string): string {
  return input
    .normalize('NFC')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toBengaliDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]!);
}

export function fromBengaliDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
}

const cardinalRules: Record<Locale, Intl.PluralRules> = {
  en: new Intl.PluralRules('en-GB'),
  bn: new Intl.PluralRules('bn-BD'),
};

export function pluralCategory(count: number, locale: Locale = defaultLocale): Intl.LDMLPluralRule {
  return cardinalRules[locale].select(count);
}
