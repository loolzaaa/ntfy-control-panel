import { defineStore } from 'pinia';
import client, { setCsrfToken } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    admin: null,
    initialized: false,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.admin),
    username: (state) => (state.admin ? state.admin.username : ''),
  },
  actions: {
    async login(username, password) {
      this.loading = true;
      try {
        const { data } = await client.post('/auth/login', { username, password });
        setCsrfToken(data.csrfToken);
        this.admin = data.admin;
      } finally {
        this.loading = false;
      }
    },
    async fetchMe() {
      try {
        const { data } = await client.get('/auth/me');
        setCsrfToken(data.csrfToken);
        this.admin = data.admin;
      } catch {
        this.admin = null;
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
      this.admin = null;
    },
    async changePassword(currentPassword, newPassword) {
      await client.post('/auth/change-password', { currentPassword, newPassword });
    },
  },
});
