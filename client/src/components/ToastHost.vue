<script setup>
import { useI18n } from 'vue-i18n';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const toast = useToastStore();
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div v-for="item in toast.items" :key="item.id" class="toast" :class="`toast--${item.type}`">
      <span>{{ item.message }}</span>
      <button
        class="toast__close"
        type="button"
        :aria-label="t('common.close')"
        @click="toast.dismiss(item.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
