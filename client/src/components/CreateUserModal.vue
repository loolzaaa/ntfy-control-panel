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
const role = ref('user');
const apiError = ref(null);
const busy = ref(false);
const result = ref(null);
const showQr = ref(false);

const errorText = computed(() => errText(apiError.value));

async function submit() {
  apiError.value = null;
  busy.value = true;
  try {
    const payload = {
      username: username.value.trim(),
      role: role.value,
    };
    const { data } = await client.post('/users', payload);
    toast.success(t('createUser.created', { name: data.user.name }));
    emit('created', data);
    result.value = data;
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(result.value.password);
    toast.success(t('createUser.passwordCopied'));
  } catch {
    toast.error(t('createUser.passwordCopyFailed'));
  }
}
</script>

<template>
  <BaseModal :title="t('createUser.title')" @close="emit('close')">
    <template v-if="!result">
      <form @submit.prevent="submit">
        <div class="field">
          <label for="new-username">{{ t('createUser.username') }}</label>
          <input
            id="new-username"
            v-model="username"
            type="text"
            autocomplete="off"
            :placeholder="t('createUser.usernamePlaceholder')"
          />
          <span class="form-hint">{{ t('createUser.usernameHint') }}</span>
        </div>

        <div class="field">
          <label for="new-role">{{ t('createUser.role') }}</label>
          <select id="new-role" v-model="role">
            <option value="user">{{ t('roles.user') }}</option>
            <option value="admin">{{ t('roles.admin') }}</option>
          </select>
          <span class="form-hint">{{ t('createUser.roleHint') }}</span>
        </div>

        <p v-if="errorText" class="form-error">{{ errorText }}</p>
      </form>
    </template>

    <template v-else>
      <p>{{ t('createUser.created', { name: result.user.name }) }}</p>
      <p class="muted">{{ t('createUser.passwordWarning') }}</p>

      <div class="card" style="padding: 16px; margin-top: 12px">
        <div class="form-hint" style="margin-bottom: 6px">{{ t('createUser.password') }}</div>
        <div class="token-value">{{ result.password }}</div>
        <div style="display: flex; gap: 8px; margin-top: 12px">
          <button class="btn btn--secondary btn--sm" type="button" @click="copyPassword">
            {{ t('createUser.copyPassword') }}
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
          {{ busy ? t('createUser.submitting') : t('createUser.submit') }}
        </button>
      </template>
      <button v-else class="btn" type="button" @click="emit('close')">{{ t('createUser.done') }}</button>
    </template>
  </BaseModal>

  <TokenQrModal
    v-if="showQr && result && result.password"
    :value="result.password"
    :label="result.user.name"
    :title="t('createUser.qrTitle')"
    :hint="t('createUser.qrHint')"
    :copied-text="t('createUser.passwordCopied')"
    :copy-failed-text="t('createUser.passwordCopyFailed')"
    @close="showQr = false"
  />
</template>
