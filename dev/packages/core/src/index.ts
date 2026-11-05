import type { ConnectivitySnapshot } from '@aumanet/protocol';

/** Platform boundary for design spikes; real implementations remain unproven. */
export interface ConnectivityAdapter {
  readonly source: 'simulated' | 'device';
  snapshot(): Promise<ConnectivitySnapshot>;
}

export type { ConnectivitySnapshot } from '@aumanet/protocol';
