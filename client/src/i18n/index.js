import { createI18n } from 'vue-i18n';
import en from './locales/en';
import ru from './locales/ru';

export const SUPPORTED_LOCALES = ['en', 'ru'];

const STORAGE_KEY = 'ntfy_panel_locale';

function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      return saved;
    }
  } catch {
    // localStorage may be unavailable
  }
  const browser = (navigator.language || 'en').toLowerCase();
  return browser.startsWith('ru') ? 'ru' : 'en';
}

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, ru },
});

/**
 * Applies the current locale to the document (lang attribute and title).
 */
export function applyDocumentLocale() {
  const locale = i18n.global.locale.value;
  document.documentElement.setAttribute('lang', locale);
  document.title = i18n.global.t('app.title');
}

/**
 * Switches the active locale and persists the choice.
 * @param {string} locale
 */
export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return;
  }
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore persistence errors
  }
  applyDocumentLocale();
}

export default i18n;
