/** Real two-node development adapter. This is not the production management API. */
export const BENCH_SCHEMA = 'aumanet.usb-bench.v1' as const;
export const BENCH_TEXT_BYTES = 240;
export type BenchRole = 'A' | 'B';
export type BenchMessageState = 'received' | 'delivered_to_peer' | 'unconfirmed';
export interface BenchMessage {
  readonly id: string;
  readonly from: BenchRole;
  readonly text: string;
  readonly state: BenchMessageState;
  readonly uptime_ms: number;
}
export interface BenchRadio {
  readonly started: boolean;
  readonly interface_up: boolean;
  readonly station_state: number;
  readonly ap_peer_state: number;
  readonly country: string;
  readonly centre_hz: number;
  readonly max_tx_dbm: number;
}
export interface BenchSnapshot {
  readonly schema: typeof BENCH_SCHEMA;
  readonly role: BenchRole;
  readonly node: string;
  readonly firmware: string;
  readonly uptime_ms: number;
  readonly radio: BenchRadio;
  readonly messages: readonly BenchMessage[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function uint(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function role(value: unknown): value is BenchRole { return value === 'A' || value === 'B'; }
export function validateBenchText(text: unknown): asserts text is string {
  if (typeof text !== 'string' || !text.trim() || text.includes('\0') || new TextEncoder().encode(text).length > BENCH_TEXT_BYTES ||
      new TextDecoder().decode(new TextEncoder().encode(text)) !== text)
    throw new Error(`Message must contain 1–${BENCH_TEXT_BYTES} UTF-8 bytes and no NUL`);
}
export function parseBenchMessage(value: unknown): BenchMessage {
  const message = object(value);
  validateBenchText(message.text);
  if (typeof message.id !== 'string' || !/^[a-f0-9]{16}$/.test(message.id) ||
      !role(message.from) ||
      (message.state !== 'received' && message.state !== 'delivered_to_peer' && message.state !== 'unconfirmed') || !uint(message.uptime_ms))
    throw new Error('Invalid hardware message');
  return {id: message.id, from: message.from, text: message.text,
    state: message.state, uptime_ms: message.uptime_ms};
}
export function parseBenchSnapshot(value: unknown): BenchSnapshot {
  const snapshot = object(value), radio = object(snapshot.radio);
  if (snapshot.schema !== BENCH_SCHEMA || !role(snapshot.role) ||
      typeof snapshot.node !== 'string' || !/^[a-f0-9]{12}$/.test(snapshot.node) ||
      typeof snapshot.firmware !== 'string' || !uint(snapshot.uptime_ms) ||
      typeof radio.started !== 'boolean' || typeof radio.interface_up !== 'boolean' ||
      !Number.isInteger(radio.station_state) || !Number.isInteger(radio.ap_peer_state) ||
      radio.country !== 'AU' || !uint(radio.centre_hz) || !uint(radio.max_tx_dbm) ||
      !Array.isArray(snapshot.messages) || snapshot.messages.length > 8)
    throw new Error('Invalid hardware snapshot');
  return {...snapshot, messages: snapshot.messages.map(parseBenchMessage)} as unknown as BenchSnapshot;
}
