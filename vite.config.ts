import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project site path: https://<user>.github.io/maylay/
  base: '/maylay/',
  server: {
    port: 5173,
    strictPort: true,
  },
});
