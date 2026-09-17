<script setup>
import { useAuthStore } from './stores/auth';
import AppHeader from './components/AppHeader.vue';
import ToastHost from './components/ToastHost.vue';

const auth = useAuthStore();
</script>

<template>
  <div class="app">
    <AppHeader v-if="auth.isAuthenticated" />
    <main class="content" :class="{ 'content--auth': !auth.isAuthenticated }">
      <router-view />
    </main>
    <ToastHost />
  </div>
</template>
