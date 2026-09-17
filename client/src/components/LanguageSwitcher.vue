<script setup>
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale } from '../i18n';

const { locale, t } = useI18n();

function onChange(event) {
  setLocale(event.target.value);
}
</script>

<template>
  <select
    class="lang-select"
    :value="locale"
    :aria-label="t('language.label')"
    :title="t('language.label')"
    @change="onChange"
  >
    <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">
      {{ t(`language.${code}`) }}
    </option>
  </select>
</template>

<style scoped>
.lang-select {
  width: auto;
  padding: 6px 32px 6px 12px;
  font-size: 13px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-color: var(--color-input-bg);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238ba59d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
}
</style>
