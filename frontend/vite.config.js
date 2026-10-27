import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.QUANTARA_API_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
