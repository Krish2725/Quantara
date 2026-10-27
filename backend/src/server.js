import { createApp } from './app.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './persistence.js';

const environmentFile = new URL('../.env', import.meta.url);
if (existsSync(environmentFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(fileURLToPath(environmentFile));
}

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV === 'production' && (!process.env.MONGODB_URI || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || !process.env.FRONTEND_ORIGIN)) {
  throw new Error('Production requires MONGODB_URI, an explicit FRONTEND_ORIGIN, and a SESSION_SECRET of at least 32 characters.');
}
connectDatabase().then((state) => {
  if (state.configured && !state.connected) console.error('MongoDB connection unavailable; portfolio persistence will return a service error.');
  if (!state.configured) console.warn('MONGODB_URI is not configured; portfolio persistence is unavailable.');
  createApp().listen(port, '0.0.0.0', () => console.log(`Quantara API listening on port ${port}`));
});
