<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import ChangePasswordModal from './ChangePasswordModal.vue';
import LanguageSwitcher from './LanguageSwitcher.vue';

const { t } = useI18n();
const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const showPassword = ref(false);

async function logout() {
  await auth.logout();
  toast.info(t('header.loggedOut'));
  router.push({ name: 'login' });
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <div class="app-header__brand"><span class="dot"></span> ntfy Admin</div>
      <nav class="app-nav">
        <router-link :to="{ name: 'users' }">{{ t('nav.users') }}</router-link>
        <router-link :to="{ name: 'audit' }">{{ t('nav.audit') }}</router-link>
      </nav>
      <div class="app-header__user">
        <span class="hide-sm">{{ auth.username }}</span>
        <LanguageSwitcher />
        <button class="btn btn--secondary btn--sm" type="button" @click="showPassword = true">
          {{ t('header.changePassword') }}
        </button>
        <button class="btn btn--ghost btn--sm" type="button" @click="logout">
          {{ t('header.logout') }}
        </button>
      </div>
    </div>
  </header>

  <ChangePasswordModal v-if="showPassword" @close="showPassword = false" />
</template>
