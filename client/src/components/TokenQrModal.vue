<script setup>
import { ref, watch } from 'vue';
import QRCode from 'qrcode';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { useToastStore } from '../stores/toast';

const props = defineProps({
  value: { type: String, required: true },
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
  copiedText: { type: String, default: '' },
  copyFailedText: { type: String, default: '' },
});

const emit = defineEmits(['close']);

const { t } = useI18n();
const toast = useToastStore();

const dataUrl = ref('');
const error = ref('');

watch(
  () => props.value,
  async (value) => {
    error.value = '';
    dataUrl.value = '';
    try {
      dataUrl.value = await QRCode.toDataURL(value, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0c1513', light: '#ffffff' },
      });
    } catch (err) {
      error.value = err.message;
    }
  },
  { immediate: true }
);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
    toast.success(props.copiedText || t('profile.copied'));
  } catch {
    toast.error(props.copyFailedText || t('profile.copyFailed'));
  }
}
</script>

<template>
  <BaseModal :title="props.title || t('qr.title')" size="sm" @close="emit('close')">
    <div class="qr-box">
      <img v-if="dataUrl" class="qr-box__image" :src="dataUrl" :alt="props.title || t('qr.title')" />
      <p v-else-if="error" class="form-error">{{ error }}</p>
      <p v-else class="muted">{{ t('common.loading') }}</p>

      <p v-if="props.label" class="muted" style="margin: 0">{{ props.label }}</p>
      <div class="token-value qr-box__value">{{ props.value }}</div>
      <p class="form-hint">{{ props.hint || t('qr.hint') }}</p>

      <button class="btn btn--secondary btn--sm" type="button" @click="copy">
        {{ t('common.copy') }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.qr-box__image {
  width: 280px;
  height: 280px;
  max-width: 100%;
  border-radius: 8px;
  background: #ffffff;
  padding: 8px;
}

.qr-box__value {
  text-align: center;
}
</style>
