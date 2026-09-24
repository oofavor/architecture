import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev: те же правила прокси, что и в nginx.conf (сервисы на портах 3001–3003)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': 'http://localhost:3001',
      '/api/users': 'http://localhost:3001',
      '^/api/clients/\\d+/debt$': 'http://localhost:3003',
      '/api/clients': 'http://localhost:3002',
      '/api/cars': 'http://localhost:3002',
      '/api': 'http://localhost:3003',
    },
  },
});
