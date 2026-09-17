<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';

const { t } = useI18n();
const errText = useErrorText();
const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const apiError = ref(null);
const busy = ref(false);

const errorText = computed(() => errText(apiError.value));

async function submit() {
  apiError.value = null;
  busy.value = true;
  try {
    await auth.login(username.value.trim(), password.value);
    toast.success(t('login.success'));
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    router.push(redirect || (auth.isAdmin ? { name: 'users' } : { name: 'profile' }));
  } catch (err) {
    apiError.value = err;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="card login__card">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
        <LanguageSwitcher />
      </div>
      <div class="login__brand">
        <h1>{{ t('login.heading') }}</h1>
        <p>{{ t('login.subtitle') }}</p>
      </div>

      <form @submit.prevent="submit">
        <div class="field">
          <label for="login-username">{{ t('login.username') }}</label>
          <input
            id="login-username"
            v-model="username"
            type="text"
            autocomplete="username"
            autofocus
          />
        </div>
        <div class="field">
          <label for="login-password">{{ t('login.password') }}</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
          />
        </div>

        <p v-if="errorText" class="form-error">{{ errorText }}</p>

        <button
          class="btn"
          type="submit"
          style="width: 100%; margin-top: 8px"
          :disabled="busy || !username.trim() || !password"
        >
          {{ busy ? t('login.submitting') : t('login.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>
