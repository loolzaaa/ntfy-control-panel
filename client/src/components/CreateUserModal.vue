<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import client from '../api/client';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';

const emit = defineEmits(['close', 'created']);

const { t } = useI18n();
const errText = useErrorText();
const toast = useToastStore();

const username = ref('');
const role = ref('user');
const createToken = ref(true);
const tokenLabel = ref('');
const labelTouched = ref(false);
const apiError = ref(null);
const busy = ref(false);
const result = ref(null);

const errorText = computed(() => errText(apiError.value));

watch(username, (value) => {
  if (!labelTouched.value) {
    tokenLabel.value = value;
  }
});

function onLabelInput() {
  labelTouched.value = true;
}

async function submit() {
  apiError.value = null;
  busy.value = true;
  try {
    const payload = {
      username: username.value.trim(),
      role: role.value,
      createToken: createToken.value,
      tokenLabel: createToken.value ? tokenLabel.value.trim() || username.value.trim() : '',
    };
    const { data } = await client.post('/users', payload);
    result.value = data;
    toast.success(t('createUser.created', { name: data.user.name }));
    emit('created', data);
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(result.value.token.value);
    toast.success(t('userCard.tokens.copied'));
  } catch {
    toast.error(t('userCard.tokens.copyFailed'));
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

        <label class="checkbox">
          <input v-model="createToken" type="checkbox" />
          <span>{{ t('createUser.createToken') }}</span>
        </label>

        <div v-if="createToken" class="inline-form" style="margin-top: 12px">
          <div class="field">
            <label for="token-label">{{ t('createUser.tokenLabel') }}</label>
            <input
              id="token-label"
              v-model="tokenLabel"
              type="text"
              autocomplete="off"
              @input="onLabelInput"
            />
          </div>
        </div>

        <p v-if="errorText" class="form-error">{{ errorText }}</p>
      </form>
    </template>

    <template v-else>
      <p>{{ t('createUser.created', { name: result.user.name }) }}</p>

      <div v-if="result.token" class="card" style="padding: 16px; margin-top: 12px">
        <p class="muted" style="margin-top: 0">{{ t('createUser.tokenWarning') }}</p>
        <div class="token-value">{{ result.token.value }}</div>
        <button class="btn btn--secondary btn--sm" type="button" style="margin-top: 12px" @click="copyToken">
          {{ t('createUser.copyToken') }}
        </button>
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
</template>
