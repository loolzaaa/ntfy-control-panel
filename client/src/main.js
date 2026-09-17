import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n, { applyDocumentLocale } from './i18n';
import { useAuthStore } from './stores/auth';
import { setUnauthorizedHandler } from './api/client';
import './assets/styles.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(i18n);
app.use(router);

applyDocumentLocale();

setUnauthorizedHandler(() => {
  const auth = useAuthStore(pinia);
  auth.user = null;
  const current = router.currentRoute.value;
  if (current.meta && current.meta.requiresAuth) {
    router.push({ name: 'login', query: { redirect: current.fullPath } });
  }
});

app.mount('#app');
