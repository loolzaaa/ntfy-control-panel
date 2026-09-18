<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import TokenQrModal from './TokenQrModal.vue';
import client from '../api/client';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';

const props = defineProps({
  admin: { type: Object, required: true },
});

const emit = defineEmits(['close', 'changed']);

const { t } = useI18n();
const errText = useErrorText();
const toast = useToastStore();

const newPassword = ref('');
const apiError = ref(null);
const busy = ref(false);
const generated = ref(null);
const showQr = ref(false);

const errorText = computed(() => errText(apiError.value));

async function run(payload) {
  apiError.value = null;
  busy.value = true;
  try {
    const { data } = await client.put(`/admins/${props.admin.id}/password`, payload);
    if (data.password) {
      generated.value = data.password;
      toast.success(t('admins.passwordGenerated'));
    } else {
      toast.success(t('admins.passwordUpdated'));
      emit('changed');
      emit('close');
    }
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}

function setCustom() {
  run({ password: newPassword.value });
}

function generate() {
  run({});
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(generated.value);
    toast.success(t('admins.passwordCopied'));
  } catch {
    toast.error(t('admins.passwordCopyFailed'));
  }
}
</script>

<template>
  <BaseModal :title="t('admins.passwordTitle', { name: admin.username })" size="sm" @close="emit('close')">
    <template v-if="!generated">
      <div class="field">
        <label for="admin-new-password">{{ t('admins.newPassword') }}</label>
        <input
          id="admin-new-password"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          :placeholder="t('admins.newPasswordPlaceholder')"
        />
      </div>
      <p v-if="errorText" class="form-error">{{ errorText }}</p>
    </template>

    <template v-else>
      <p class="muted" style="margin-top: 0">{{ t('admins.passwordWarning') }}</p>
      <div class="token-value">{{ generated }}</div>
      <div style="display: flex; gap: 8px; margin-top: 12px">
        <button class="btn btn--secondary btn--sm" type="button" @click="copyPassword">
          {{ t('common.copy') }}
        </button>
        <button class="btn btn--secondary btn--sm" type="button" @click="showQr = true">
          {{ t('qr.button') }}
        </button>
      </div>
    </template>

    <template #footer>
      <template v-if="!generated">
        <button class="btn btn--secondary" type="button" :disabled="busy" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy || newPassword.length < 8"
          @click="setCustom"
        >
          {{ busy ? t('common.saving') : t('admins.setPassword') }}
        </button>
        <button class="btn btn--secondary" type="button" :disabled="busy" @click="generate">
          {{ t('admins.generate') }}
        </button>
      </template>
      <button v-else class="btn" type="button" @click="emit('close')">{{ t('common.close') }}</button>
    </template>
  </BaseModal>

  <TokenQrModal
    v-if="showQr && generated"
    :value="generated"
    :label="admin.username"
    :title="t('admins.qrTitle')"
    :hint="t('admins.qrHint')"
    :copied-text="t('admins.passwordCopied')"
    :copy-failed-text="t('admins.passwordCopyFailed')"
    @close="showQr = false"
  />
</template>
