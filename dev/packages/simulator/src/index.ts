import type { ConnectivityAdapter, ConnectivitySnapshot } from '@aumanet/core';

/** Fixed design fixture. Does not simulate radio routing or prove feasibility. */
export function createConnectivityFixture(state: ConnectivitySnapshot): ConnectivityAdapter {
  const snapshot = Object.freeze({ ...state });
  return {
    source: 'simulated',
    snapshot: async () => snapshot
  };
}
