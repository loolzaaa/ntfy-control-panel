import { defineStore } from 'pinia';

let counter = 0;

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [],
  }),
  actions: {
    push(message, type = 'info', timeout = 5000) {
      const id = ++counter;
      this.items.push({ id, message, type });
      if (timeout > 0) {
        setTimeout(() => this.dismiss(id), timeout);
      }
      return id;
    },
    success(message) {
      return this.push(message, 'success');
    },
    error(message) {
      return this.push(message, 'error', 8000);
    },
    info(message) {
      return this.push(message, 'info');
    },
    dismiss(id) {
      this.items = this.items.filter((item) => item.id !== id);
    },
  },
});
