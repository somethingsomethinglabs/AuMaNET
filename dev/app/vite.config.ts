import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [sveltekit()],
  // Prebundle lazy imports that otherwise reload browser fixtures mid-test.
  optimizeDeps: {include: [
    '@capacitor-community/bluetooth-le',
    'core-js/actual/array/at',
    'core-js/actual/object/has-own',
    'core-js/actual/structured-clone',
    'maplibre-contour',
  ]},
  server: { host: '127.0.0.1', proxy: {
  '/api/hardware': {target: 'http://127.0.0.1:8765', changeOrigin: true}
} } });
