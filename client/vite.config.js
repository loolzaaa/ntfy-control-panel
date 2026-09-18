import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeBase(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') {
    return '/';
  }
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const base = normalizeBase(env.BASE_PATH || process.env.BASE_PATH);

  return {
    base,
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        [`${base}api`]: { target: 'http://localhost:8080', changeOrigin: true },
        [`${base}healthz`]: { target: 'http://localhost:8080', changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
