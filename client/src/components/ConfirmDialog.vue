<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';

const { t } = useI18n();

const props = defineProps({
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  danger: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['confirm', 'close']);

const resolvedTitle = computed(() => props.title || t('common.confirmTitle'));
const resolvedConfirmText = computed(() => props.confirmText || t('common.delete'));
</script>

<template>
  <BaseModal :title="resolvedTitle" size="sm" @close="emit('close')">
    <p>{{ props.message }}</p>
    <template #footer>
      <button class="btn btn--secondary" type="button" :disabled="props.busy" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        class="btn"
        :class="{ 'btn--danger': props.danger }"
        type="button"
        :disabled="props.busy"
        @click="emit('confirm')"
      >
        {{ props.busy ? t('common.busy') : resolvedConfirmText }}
      </button>
    </template>
  </BaseModal>
</template>
