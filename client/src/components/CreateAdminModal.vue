<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import TokenQrModal from './TokenQrModal.vue';
import client from '../api/client';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';

const emit = defineEmits(['close', 'created']);

const { t } = useI18n();
const errText = useErrorText();
const toast = useToastStore();

const username = ref('');
const password = ref('');
const apiError = ref(null);
const busy = ref(false);
const result = ref(null);
const showQr = ref(false);

const errorText = computed(() => errText(apiError.value));

async function submit() {
  apiError.value = null;
  busy.value = true;
  try {
    const payload = { username: username.value.trim() };
    if (password.value) {
      payload.password = password.value;
    }
    const { data } = await client.post('/admins', payload);
    toast.success(t('admins.created', { name: data.admin.username }));
    emit('created', data);
    if (data.password) {
      result.value = data;
    } else {
      emit('close');
    }
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(result.value.password);
    toast.success(t('admins.passwordCopied'));
  } catch {
    toast.error(t('admins.passwordCopyFailed'));
  }
}
</script>

<template>
  <BaseModal :title="t('admins.createTitle')" @close="emit('close')">
    <template v-if="!result">
      <form @submit.prevent="submit">
        <div class="field">
          <label for="admin-username">{{ t('admins.username') }}</label>
          <input
            id="admin-username"
            v-model="username"
            type="text"
            autocomplete="off"
            :placeholder="t('admins.usernamePlaceholder')"
          />
        </div>

        <div class="field">
          <label for="admin-password">{{ t('admins.password') }}</label>
          <input
            id="admin-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('admins.passwordPlaceholder')"
          />
          <span class="form-hint">{{ t('admins.passwordHint') }}</span>
        </div>

        <p v-if="errorText" class="form-error">{{ errorText }}</p>
      </form>
    </template>

    <template v-else>
      <p>{{ t('admins.created', { name: result.admin.username }) }}</p>
      <p class="muted">{{ t('admins.passwordWarning') }}</p>

      <div class="card" style="padding: 16px; margin-top: 12px">
        <div class="form-hint" style="margin-bottom: 6px">{{ t('admins.generatedPassword') }}</div>
        <div class="token-value">{{ result.password }}</div>
        <div style="display: flex; gap: 8px; margin-top: 12px">
          <button class="btn btn--secondary btn--sm" type="button" @click="copyPassword">
            {{ t('admins.copyPassword') }}
          </button>
          <button class="btn btn--secondary btn--sm" type="button" @click="showQr = true">
            {{ t('qr.button') }}
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="!result">
        <button class="btn btn--secondary" type="button" :disabled="busy" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button class="btn" type="button" :disabled="busy || !username.trim()" @click="submit">
          {{ busy ? t('admins.submitting') : t('admins.submit') }}
        </button>
      </template>
      <button v-else class="btn" type="button" @click="emit('close')">{{ t('common.close') }}</button>
    </template>
  </BaseModal>

  <TokenQrModal
    v-if="showQr && result && result.password"
    :value="result.password"
    :label="result.admin.username"
    :title="t('admins.qrTitle')"
    :hint="t('admins.qrHint')"
    :copied-text="t('admins.passwordCopied')"
    :copy-failed-text="t('admins.passwordCopyFailed')"
    @close="showQr = false"
  />
</template>
