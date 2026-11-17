import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'au.aumanet.app',
  appName: 'AuMaNET',
  webDir: '../app/build',
  // Bridge calls include private messages and checked setup credentials.
  loggingBehavior: 'none',
  android: { backgroundColor: '#fbf8ef' },
  plugins: { SystemBars: { insetsHandling: 'native' } }
};
export default config;
