import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import LoginView from '../views/LoginView.vue';
import UsersView from '../views/UsersView.vue';
import AdminsView from '../views/AdminsView.vue';
import AuditView from '../views/AuditView.vue';
import ProfileView from '../views/ProfileView.vue';

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { guest: true } },
  { path: '/', name: 'users', component: UsersView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admins', name: 'admins', component: AdminsView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/audit', name: 'audit', component: AuditView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

function homeFor(auth) {
  return auth.isAdmin ? { name: 'users' } : { name: 'profile' };
}

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.initialized) {
    await auth.fetchMe();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return homeFor(auth);
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'profile' };
  }
  if (to.name === 'profile' && auth.isAdmin) {
    return { name: 'users' };
  }
  return true;
});

export default router;
