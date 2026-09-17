import { useI18n } from 'vue-i18n';

/**
 * Returns a function that converts an API error into a localized message.
 * Known machine-readable error codes are translated; otherwise the server
 * message is used as a fallback.
 */
export function useErrorText() {
  const { t, te } = useI18n();

  return (error) => {
    if (!error) {
      return '';
    }
    if (error.code && te(`errors.${error.code}`)) {
      return t(`errors.${error.code}`);
    }
    return error.message || t('errors.generic');
  };
}
