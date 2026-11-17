/** Opt-in routed-node client contract. This does not enable an AP or DHCP server. */
export interface NodeClientScope {
  readonly groupId:string;readonly nodeId:string;readonly ownerSpkiSha256:string;
  readonly epoch:number;readonly allocationRevision:number;
  readonly subnet:string;readonly gateway:string;readonly dhcpFirst:string;readonly dhcpLast:string;
}
export interface NodeClientPrincipal {readonly clientId:string;readonly certificateId:string;}
export interface NodeClientNodePermit extends NodeClientPrincipal {readonly validForMs:number;}
/** Durable address ownership, not a DHCP timer or evidence of association. */
export interface NodeClientLease {
  readonly leaseId:string;readonly revision:number;readonly ipv4:string;readonly mac:string;
  readonly principal:NodeClientPrincipal|null;readonly revoked:boolean;
  readonly membershipRevision:number;readonly permissionRevision:number;
}
export interface NodeClientRegistryRecord {
  readonly schema:'aumanet.node-client-registry.v1';readonly scope:NodeClientScope;
  readonly revision:number;readonly leases:readonly NodeClientLease[];
}
export interface NodeClientEvidence {readonly certificate:string;readonly signature:string;}
export interface NodeClientChallenge {
  readonly schema:'aumanet.node-client-challenge.v1';readonly purpose:'node'|'group'|'admin';
  readonly scope:NodeClientScope;readonly lease:NodeClientLease;readonly nonce:string;
  readonly attachmentGeneration:number;readonly expiresAtMs:number;
}
export interface NodeClientGroupPermit {
  readonly clientId:string;readonly certificateId:string;readonly groupId:string;readonly epoch:number;
  readonly membershipRevision:number;readonly validForMs:number;
}
export interface NodeClientAdminPermit {
  readonly clientId:string;readonly certificateId:string;readonly permissionRevision:number;readonly validForMs:number;
}
export type NodeClientTraffic='dhcp'|'setup'|'diagnostics'|'local-group'|'remote-group'|'admin';
export type NodeClientDenial='invalid-request'|'allocation-unavailable'|'unknown-lease'|'not-associated'|'revoked'|'storage-unavailable'|'clock-unavailable'|'node-authentication-required'|'group-membership-required'|'admin-permission-required'|'remote-route-unavailable';
export type NodeClientPacketDecision=
  |{readonly allowed:true;readonly state:'local-network'|'local-setup'|'authenticated-node'|'authorized-group'|'authorized-admin';readonly leaseId:string;readonly ipv4:string}
  |{readonly allowed:false;readonly reason:NodeClientDenial};
export interface NodeClientObservation {
  readonly lease:NodeClientLease;readonly associated:boolean;readonly nodeAuthenticated:boolean;
  readonly groupMember:boolean;readonly administrator:boolean;
}
