import {BENCH_SCHEMA, parseBenchMessage, parseBenchSnapshot, validateBenchText,
  type BenchMessage, type BenchRole, type BenchSnapshot} from '@aumanet/protocol';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bench API response');
  return value as Record<string, unknown>;
}
class BenchRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Loopback USB development adapter. It never relays messages between the two nodes. */
export class UsbBenchAdapter {
  private token: string | undefined;
  constructor(private readonly base = '/api/hardware', private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(this.base + path, {...options, signal: AbortSignal.timeout(12000)});
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local hardware adapter is unavailable');
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = record(value).error;
      throw new BenchRequestError(typeof error === 'string' ? error : `Hardware request failed (${response.status})`, response.status);
    }
    return value;
  }

  async snapshot(role: BenchRole): Promise<BenchSnapshot> {
    const snapshot = parseBenchSnapshot(await this.request(`/nodes/${role}`));
    if (snapshot.role !== role) throw new Error('Connected node does not match the requested role');
    return snapshot;
  }

  async send(role: BenchRole, id: string, text: string): Promise<BenchMessage> {
    validateBenchText(text);
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('Invalid message ID');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.token) {
        const session = record(await this.request('/session'));
        if (session.schema !== BENCH_SCHEMA || typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(session.token))
          throw new Error('Invalid hardware session');
        this.token = session.token;
      }
      let value: unknown;
      try { value = await this.request(`/nodes/${role}/messages`, {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-AuMaNET-Bench-Token': this.token},
        body: JSON.stringify({id, text})
      }); } catch (error) {
        // A restarted local server has a new token. A rejected write has not
        // executed; reacquire once and retain the exact same message ID.
        if (attempt === 0 && error instanceof BenchRequestError && error.status === 403 && error.message === 'Bench session token required') {
          this.token = undefined; continue;
        }
        throw error;
      }
      const result = record(value);
      if (result.schema !== BENCH_SCHEMA) throw new Error('Unsupported hardware response');
      const message = parseBenchMessage(result.message);
      if (message.id !== id || message.from !== role || message.text !== text) throw new Error('Mismatched board message response');
      return message;
    }
    throw new Error('Local bench session could not be renewed');
  }
}
