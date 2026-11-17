/** Production contracts remain provisional. The bench export is a development slice. */
export * from './bench.js';
export * from './bluetooth.js';
export * from './companion-messages.js';
export * from './voice-lab.js';
export * from './location.js';
export * from './group.js';
export * from './group-messages.js';
export * from './radio-signal.js';
export type LinkState = 'disconnected' | 'connecting' | 'connected';
export type Reachability = 'unknown' | 'unavailable' | 'available';

/** These states are independent: internet loss does not imply mesh loss. */
export interface ConnectivitySnapshot {
  readonly phoneToNode: LinkState;
  readonly group: Reachability;
  readonly internet: Reachability;
}
export * from './link-benchmark.js';
export * from './gateway-radio-settings.js';
export * from './node-updates.js';
export * from './node-client-registry.js';
export * from './routed-node-profile.js';
export * from './relay-recovery-policy.js';
