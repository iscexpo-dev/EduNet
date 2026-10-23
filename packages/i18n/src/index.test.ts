import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  detectLocale,
  formatDate,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  fromBengaliDigits,
  interpolate,
  isLocale,
  normalizeForSearch,
  pluralCategory,
  toBengaliDigits,
  translate,
} from './index';
import { bn, en } from './translations';

describe('catalogue parity', () => {
  it('has the same key set in English and Bengali', () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries({ ...en, ...bn })) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });
});

describe('locale detection', () => {
  it('recognises supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('bn')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('picks the first supported language from Accept-Language', () => {
    expect(detectLocale('bn-BD,bn;q=0.9,en;q=0.8')).toBe('bn');
    expect(detectLocale('fr-FR,fr;q=0.9,en-GB;q=0.5')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
    expect(detectLocale('')).toBe('en');
  });
});

describe('translate', () => {
  it('translates in both locales', () => {
    expect(translate('en', 'nav.courses')).toBe('Courses');
    expect(translate('bn', 'nav.courses')).toBe('কোর্স');
  });

  it('interpolates values', () => {
    expect(translate('en', 'dashboard.welcome', { name: 'Ayesha' })).toBe(
      'Welcome back, Ayesha',
    );
    expect(translate('bn', 'courses.progress', { percent: 40 })).toBe('40% সম্পন্ন');
  });

  it('leaves unknown placeholders visible instead of printing undefined', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });

  it('falls back to English then the key for unknown keys', () => {
    expect(translate('bn', 'this.key.does.not.exist')).toBe('this.key.does.not.exist');
    expect(translate('en', 'this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});

describe('formatting', () => {
  it('formats numbers per locale', () => {
    expect(formatNumber(1234.5, 'en-GB', { maximumFractionDigits: 1 })).toBe('1,234.5');
    expect(formatNumber(1234.5, 'bn', { maximumFractionDigits: 1 })).toMatch(/১/);
  });

  it('formats percentages', () => {
    expect(formatPercent(0.42, 'en-GB')).toBe('42%');
  });

  it('formats dates deterministically in UTC', () => {
    expect(formatDate('2026-03-01T12:00:00Z', 'en-GB')).toContain('Mar');
    expect(formatDate('2026-03-01T12:00:00Z', 'bn', { year: 'numeric', month: 'long', day: 'numeric' })).toMatch(/২০২৬/);
    expect(formatDate('not-a-date', 'en')).toBe('');
  });

  it('formats relative times', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(formatRelativeTime(new Date('2026-01-12T12:00:00Z'), 'en', now)).toContain('2 days');
    expect(formatRelativeTime(new Date('2026-01-09T12:00:00Z'), 'en', now)).toMatch(/yesterday|1 day/);
    expect(formatRelativeTime(new Date('2026-01-10T11:59:30Z'), 'bn', now)).not.toBe('');
  });

  it('exposes a translator bound to a locale', () => {
    const tr = createTranslator('bn');
    expect(tr.locale).toBe('bn');
    expect(tr.direction).toBe('ltr');
    expect(tr.t('common.loading')).toBe('লোড হচ্ছে…');
    expect(tr.formatNumber(10)).toMatch(/১০/);
    expect(tr.formatDate('2026-01-01T00:00:00Z', { year: 'numeric' })).toMatch(/২০২৬/);
  });
});

describe('search normalisation', () => {
  it('folds case, diacritics and whitespace for Latin text', () => {
    expect(normalizeForSearch('  ÉCOLE   Primaire ')).toBe('ecole primaire');
  });

  it('preserves Bengali combining marks', () => {
    expect(normalizeForSearch('বাংলা')).toBe('বাংলা');
    expect(normalizeForSearch('  বাংলা   পাঠ ')).toBe('বাংলা পাঠ');
  });
});

describe('numerals and plurals', () => {
  it('converts between Bengali and Latin digits in both directions', () => {
    expect(toBengaliDigits('2026')).toBe('২০২৬');
    expect(fromBengaliDigits('২০২৬')).toBe('2026');
    expect(toBengaliDigits(12.5)).toBe('১২.৫');
  });

  it('selects plural categories', () => {
    expect(pluralCategory(1, 'en')).toBe('one');
    expect(pluralCategory(2, 'en')).toBe('other');
    expect(pluralCategory(1, 'bn')).toBe('one');
    expect(pluralCategory(5, 'bn')).toBe('other');
  });
});
