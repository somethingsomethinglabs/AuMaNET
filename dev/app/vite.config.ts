import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [sveltekit()],
  // The isolated legacy-BLE regression fixture imports this dependency late.
  // Prebundle it before browser checks so a cold optimizer cannot reload a
  // fixture halfway through its native-service observations.
  optimizeDeps: {include: ['@capacitor-community/bluetooth-le']},
  server: { host: '127.0.0.1', proxy: {
  '/api/hardware': {target: 'http://127.0.0.1:8765', changeOrigin: true}
} } });
