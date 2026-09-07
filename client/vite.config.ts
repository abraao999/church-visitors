import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { portariaSwPlugin } from './vite.portaria-sw';

export default defineConfig({
  plugins: [react(), portariaSwPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
    },
  },
});
