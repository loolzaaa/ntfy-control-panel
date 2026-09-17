import { defineStore } from 'pinia';
import client, { setCsrfToken } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    initialized: false,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAdmin: (state) => Boolean(state.user && state.user.role === 'admin'),
    isLocal: (state) => Boolean(state.user && state.user.source === 'local'),
    role: (state) => (state.user ? state.user.role : null),
    username: (state) => (state.user ? state.user.username : ''),
  },
  actions: {
    async login(username, password) {
      this.loading = true;
      try {
        const { data } = await client.post('/auth/login', { username, password });
        setCsrfToken(data.csrfToken);
        this.user = data.user;
        this.initialized = true;
      } finally {
        this.loading = false;
      }
    },
    async fetchMe() {
      try {
        const { data } = await client.get('/auth/me');
        setCsrfToken(data.csrfToken);
        this.user = data.user;
      } catch {
        this.user = null;
      } finally {
        this.initialized = true;
      }
    },
    async logout() {
      try {
        await client.post('/auth/logout');
      } catch {
        // the session may have already expired; clear the state anyway
      }
      setCsrfToken(null);
      this.user = null;
    },
    async changePassword(currentPassword, newPassword) {
      await client.post('/auth/change-password', { currentPassword, newPassword });
    },
  },
});
