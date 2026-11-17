import {parseBenchMessage, type BenchMessage, type BenchRole} from './bench.js';
export const BLE_SERVICE = '6ba10001-15a8-461f-9fa8-5dcae273eafd';
export const BLE_REQUEST = '6ba10002-15a8-461f-9fa8-5dcae273eafd';
export const BLE_RESPONSE = '6ba10003-15a8-461f-9fa8-5dcae273eafd';
export interface BluetoothSnapshot {
  schema: 'aumanet.ble.v1'; node: string; name: string; firmware: string;
  role: BenchRole; uptime_ms: number; radio_started: boolean; storage_ready: boolean;
  messages: readonly BenchMessage[];
}
export function parseBluetoothSnapshot(value: unknown): BluetoothSnapshot {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid Bluetooth snapshot');
  const s=value as Record<string, unknown>;
  if (s.schema!=='aumanet.ble.v1' || typeof s.node!=='string' || !/^[a-f0-9]{12}$/.test(s.node) ||
      typeof s.name!=='string' || s.name.length>40 || typeof s.firmware!=='string' ||
      (s.role!=='A' && s.role!=='B') || typeof s.uptime_ms!=='number' || !Number.isSafeInteger(s.uptime_ms) || s.uptime_ms<0 ||
      typeof s.radio_started!=='boolean' || typeof s.storage_ready!=='boolean' || !Array.isArray(s.messages) || s.messages.length>8)
    throw new Error('Invalid Bluetooth snapshot');
  const messages=s.messages.map(parseBenchMessage);
  if (new Set(messages.map(m=>m.from+m.id)).size!==messages.length) throw new Error('Duplicate Bluetooth history');
  return {...s,messages} as unknown as BluetoothSnapshot;
}
