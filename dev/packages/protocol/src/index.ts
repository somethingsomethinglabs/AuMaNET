/** Design contracts only. No wire encoding or authentication scheme is selected. */
export type LinkState = 'disconnected' | 'connecting' | 'connected';
export type Reachability = 'unknown' | 'unavailable' | 'available';

/** These states are independent: internet loss does not imply mesh loss. */
export interface ConnectivitySnapshot {
  readonly phoneToNode: LinkState;
  readonly group: Reachability;
  readonly internet: Reachability;
}
