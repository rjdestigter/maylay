import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project site path: https://<user>.github.io/maylay/
  base: '/maylay/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
      },
    },
  },
});
