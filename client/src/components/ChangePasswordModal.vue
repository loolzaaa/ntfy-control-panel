<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';

const emit = defineEmits(['close']);

const { t } = useI18n();
const errText = useErrorText();
const auth = useAuthStore();
const toast = useToastStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const localError = ref('');
const apiError = ref(null);
const busy = ref(false);

const errorText = computed(() => localError.value || errText(apiError.value));

async function submit() {
  localError.value = '';
  apiError.value = null;

  if (newPassword.value.length < 8) {
    localError.value = t('changePassword.tooShort');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    localError.value = t('changePassword.mismatch');
    return;
  }

  busy.value = true;
  try {
    await auth.changePassword(currentPassword.value, newPassword.value);
    toast.success(t('changePassword.success'));
    emit('close');
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal :title="t('changePassword.title')" size="sm" @close="emit('close')">
    <form @submit.prevent="submit">
      <div class="field">
        <label for="cur-pass">{{ t('changePassword.current') }}</label>
        <input id="cur-pass" v-model="currentPassword" type="password" autocomplete="current-password" />
      </div>
      <div class="field">
        <label for="new-pass">{{ t('changePassword.new') }}</label>
        <input id="new-pass" v-model="newPassword" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label for="conf-pass">{{ t('changePassword.confirm') }}</label>
        <input id="conf-pass" v-model="confirmPassword" type="password" autocomplete="new-password" />
      </div>
      <p v-if="errorText" class="form-error">{{ errorText }}</p>
    </form>

    <template #footer>
      <button class="btn btn--secondary" type="button" :disabled="busy" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button class="btn" type="button" :disabled="busy" @click="submit">
        {{ busy ? t('common.saving') : t('common.save') }}
      </button>
    </template>
  </BaseModal>
</template>
