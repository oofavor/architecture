import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В режиме разработки (npm run dev) Vite проксирует /api к микросервисам так же, как nginx в Docker
const AUTH = 'http://localhost:3001';
const CLIENTS = 'http://localhost:3002';
const PARKING = 'http://localhost:3003';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth': AUTH,
      '/api/users': AUTH,
      '^/api/clients/\\d+/debt$': PARKING,
      '/api/clients': CLIENTS,
      '/api/cars': CLIENTS,
      '/api/discounts': CLIENTS,
      '/api/spots': PARKING,
      '/api/tariffs': PARKING,
      '/api/sessions': PARKING,
      '/api/payments': PARKING,
      '/api/my': PARKING,
    },
  },
});
