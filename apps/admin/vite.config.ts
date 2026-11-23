import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, las llamadas a /api se reenvían a la API (puerto 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
