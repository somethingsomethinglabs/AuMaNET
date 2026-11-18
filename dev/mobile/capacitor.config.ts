import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'au.aumanet.app',
  appName: 'AuMaNET',
  webDir: '../app/build',
  // Bridge calls include private messages and checked setup credentials.
  loggingBehavior: 'none',
  android: { backgroundColor: '#f4f3ec' },
  plugins: { SystemBars: { insetsHandling: 'native' } }
};
export default config;
