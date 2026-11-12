/* SPDX-License-Identifier: Apache-2.0 */
#include "aumanet_gateway.h"
#include "aumanet_ota.h"
#include "lwip/def.h"
#include "lwip/inet_chksum.h"
#include "lwip/prot/ip4.h"
#include "lwip/prot/etharp.h"
#include "lwip/prot/ethernet.h"
#include <string.h>

struct binding {
  uint32_t ip;
  uint8_t owner[16], mac[6], path[AG_PATH_LIMIT][16], path_count;
  uint64_t attachment, deadline, expires_unix;
  uint8_t used, active, conflict;
  uint64_t locator_window;
  uint8_t locator_started, locator_dhcp_used, locator_control_used;
};
static struct {
  struct ag_trust trust;
  uint8_t key[AG_KEY_BYTES_LIMIT];
  struct ag_interface interfaces[AG_INTERFACE_LIMIT];
  uint8_t partitioned[AG_INTERFACE_LIMIT];
  struct binding routes[AG_ROUTE_LIMIT],acquisition;
  uint8_t acquisition_enabled;
  uint64_t monotonic, unix_time, sequence, routes_generation;
  uint64_t clock_anchor_monotonic, clock_anchor_unix, clock_last_provided_unix;
  uint64_t donor_generation, donor_floor, donor_deadline, donor_remaining, donor_expires_unix;
  uint8_t donor_owner[16], donor_path[AG_PATH_LIMIT][16], donor_path_count;
  uint8_t ready, clock_ready, clock_poisoned, donor_active;
  struct ag_counters counters;
} state;
static uint64_t lifetime_generation;

static int zero(const uint8_t *p, size_t n) { size_t i; for(i=0;i<n;i++) if(p[i]) return 0; return 1; }
static uint64_t u64(const uint8_t *p) { uint64_t n=0; unsigned i; for(i=0;i<8;i++) n=(n<<8)|p[i]; return n; }
static uint32_t u32(const uint8_t *p) { return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; }
static int group(uint32_t ip) { return (ip & 0xffffff00UL)==AG_GROUP_PREFIX; }
static int client(uint32_t ip) { return group(ip) && (ip&255)>1 && (ip&255)<255; }
static int unicast_mac(const uint8_t *p) { return !(p[0]&1) && !zero(p,6); }
static int usable(struct netif *n) {
  unsigned i;
  if(!n || !netif_is_up(n) || !netif_is_link_up(n)) return 0;
  for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].netif==n && state.partitioned[i]) return 0;
  return 1;
}
static int slot(struct netif *n) { unsigned i; for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].netif==n && n) return (int)i; return -1; }
static int monotonic_live(void) {
  uint64_t now=0;
  if(!state.ready || state.clock_poisoned)return 0;
  if(!state.trust.monotonic_ms || state.trust.monotonic_ms(&now)!=1 || now<state.monotonic) {state.clock_poisoned=1;return 0;}
  state.monotonic=now;return 1;
}
static int live(void) {
  uint64_t elapsed;
  if(!state.clock_ready || !monotonic_live())return 0;
  if(state.monotonic<state.clock_anchor_monotonic)goto poisoned;
  elapsed=(state.monotonic-state.clock_anchor_monotonic)/1000;
  if(state.clock_anchor_unix>UINT64_MAX-elapsed)goto poisoned;
  state.unix_time=state.clock_anchor_unix+elapsed;return 1;
poisoned:state.clock_poisoned=1;return 0;
}
static int donor_current(void) { return state.donor_active && state.monotonic<state.donor_deadline && state.unix_time<state.donor_expires_unix && state.donor_remaining; }
static int donor_live(void) { return live() && donor_current(); }
static struct binding *find(uint32_t ip) { unsigned i; for(i=0;i<AG_ROUTE_LIMIT;i++) if(state.routes[i].used && state.routes[i].ip==ip) return &state.routes[i]; return NULL; }
static int binding_current(struct binding *b) { return b && b->active && !b->conflict && state.monotonic<b->deadline && state.unix_time<b->expires_unix; }
static int binding_live(struct binding *b) { return live() && binding_current(b); }
static struct binding *local_mac(const uint8_t mac[6]) {
  if(state.acquisition_enabled&&!memcmp(state.acquisition.mac,mac,6))return &state.acquisition;
  unsigned i; for(i=0;i<AG_ROUTE_LIMIT;i++) if(state.routes[i].used && !state.routes[i].path_count &&
    !memcmp(state.routes[i].owner,state.trust.node,16) && !memcmp(state.routes[i].mac,mac,6)) return &state.routes[i];
  return NULL;
}
static struct binding *locator_ip(uint32_t ip) {
  return state.acquisition_enabled&&state.acquisition.ip==ip?&state.acquisition:find(ip);
}
/* Address acquisition is distinct from a route. The protected separate
 * permission may survive reboot/lease expiry without restoring time or grants. */
static int local_locator(struct binding *r) {
  if(r==&state.acquisition)return state.acquisition_enabled&&state.trust.acquisition_permitted&&state.trust.acquisition_permitted()==1&&monotonic_live();
  return live() && r && r->used && r->active && !r->conflict && !r->path_count &&
    !memcmp(r->owner,state.trust.node,16) && client(r->ip) && unicast_mac(r->mac);
}
static int locator_budget(struct binding *r,int dhcp) {
  uint8_t *used;
  if(binding_current(r)) return 1;
  if(!r->locator_started || state.monotonic-r->locator_window>=1000) {
    r->locator_window=state.monotonic;r->locator_started=1;r->locator_dhcp_used=r->locator_control_used=0;
  }
  used=dhcp?&r->locator_dhcp_used:&r->locator_control_used;
  if(*used>=AG_LOCATOR_REQUESTS_PER_SECOND)return 0;
  (*used)++;return 1;
}
/* Bind BOOTP hardware identity and addresses to the authenticated Ethernet
 * source; DHCP's chaddr/relay fields never confer or replace node authority. */
static int locator_dhcp(struct pbuf *p,const struct ip_hdr *h,struct binding *r,int reply) {
  uint8_t bootp[240];unsigned length=lwip_ntohs(IPH_LEN(h));
  if(!local_locator(r)||length<268||length>AG_LOCATOR_DHCP_IP_MAX||
     pbuf_copy_partial(p,bootp,sizeof bootp,28)!=sizeof bootp||
     bootp[0]!=(reply?2:1)||bootp[1]!=1||bootp[2]!=6||bootp[3]||
     memcmp(bootp+28,r->mac,6)||u32(bootp+24)||u32(bootp+236)!=0x63825363UL||
     (u32(bootp+12)&&u32(bootp+12)!=r->ip)||
     (u32(bootp+16)&&u32(bootp+16)!=r->ip))return 0;
  return 1;
}
static int udp_ports(struct pbuf *p, const struct ip_hdr *h, uint16_t *src, uint16_t *dst) {
  uint8_t udp[8]; unsigned length=lwip_ntohs(IPH_LEN(h));
  if(IPH_PROTO(h)!=17 || length<28 || p->tot_len<length || pbuf_copy_partial(p,udp,8,20)!=8 ||
     (((unsigned)udp[4]<<8)|udp[5])!=length-20) return 0;
  *src=(uint16_t)((udp[0]<<8)|udp[1]); *dst=(uint16_t)((udp[2]<<8)|udp[3]); return 1;
}
/* Only a shaped OTA datagram reaches its separately authenticated endpoint.
 * No TCP, arbitrary port or arbitrary underlay payload is admitted. */
static int ota_payload(struct pbuf *p,const struct ip_hdr *h){
  uint8_t b[56],sig;unsigned n=lwip_ntohs(IPH_LEN(h))-28,body=0;
  if(n<56||n>AO_MAX_FRAME||pbuf_copy_partial(p,b,sizeof b,28)!=sizeof b||memcmp(b+16,"AUGWO",5)||b[22]!='1'||b[23])return 0;
  if(memcmp(b,state.trust.node,16)) {unsigned i;for(i=0;i<AG_INTERFACE_LIMIT;i++)if(state.interfaces[i].role==AG_MESH&&!memcmp(b,state.interfaces[i].peer,16))break;if(i==AG_INTERFACE_LIMIT)return 0;}
  unsigned encrypted=(unsigned)b[48]*256+b[49];
  if(b[21]=='E')return n>=88&&n==72u+encrypted&&encrypted>=16&&encrypted<=1040&&zero(b+50,6);
  body=b[21]=='Q'?AO_QUERY:b[21]=='R'?AO_REPORT:b[21]=='S'?AO_START:b[21]=='C'?AO_COMMAND:0;
  return body&&b[24]==1&&zero(b+25,7)&&!memcmp(b,b+32,16)&&n>=body+25&&pbuf_copy_partial(p,&sig,1,(u16_t)(28+16+body))==1&&sig>=8&&sig<=72&&n==17u+body+sig;
}
static int mesh_control(struct pbuf *p,const struct ip_hdr *h) {
  uint16_t src,dst;
  if(!udp_ports(p,h,&src,&dst))return 0;
  if(src==AO_PORT&&dst==AO_PORT)return ota_payload(p,h);
  return p->tot_len<=1024 && (src==17777 || dst==17777 || (src==AG_CONTROL_PORT && dst==AG_CONTROL_PORT));
}
static int path_interface(const uint8_t owner[16], const uint8_t path[AG_PATH_LIMIT][16], uint8_t count) {
  unsigned i;
  if(!count) {
    if(memcmp(owner,state.trust.node,16)) return -1;
    for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_PHONE && usable(state.interfaces[i].netif)) return (int)i;
  } else {
    for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_MESH && usable(state.interfaces[i].netif) && !memcmp(path[0],state.interfaces[i].peer,16)) return (int)i;
  }
  return -1;
}
static int donor_interface(void) {
  unsigned i;
  if(!donor_live()) return -1;
  if(state.donor_path_count) return path_interface(state.donor_owner,state.donor_path,state.donor_path_count);
  if(memcmp(state.donor_owner,state.trust.node,16)) return -1;
  for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_EXTERNAL && usable(state.interfaces[i].netif)) return (int)i;
  return -1;
}

enum ag_result ag_initialize(const struct ag_trust *t) {
  LWIP_ASSERT_CORE_LOCKED();
  /* Saturation deliberately fails closed rather than reusing a ticket epoch. */
  if(lifetime_generation==UINT64_MAX) { memset(&state,0,sizeof state); return AG_UNAVAILABLE; }
  memset(&state,0,sizeof state); state.routes_generation=++lifetime_generation;
  if(!t || !t->monotonic_ms || !t->epoch || zero(t->group,16) || zero(t->node,16) || zero(t->run,16) ||
     !t->public_key_der || !t->public_key_bytes || t->public_key_bytes>AG_KEY_BYTES_LIMIT || zero(t->public_key_sha256,32) ||
     !ag_crypto_key_valid(t->public_key_der,t->public_key_bytes,t->public_key_sha256)) return AG_UNAVAILABLE;
  state.trust=*t; memcpy(state.key,t->public_key_der,t->public_key_bytes); state.trust.public_key_der=state.key;
  state.ready=1; return AG_OK;
}
enum ag_result ag_acquisition_set(const struct ag_acquisition *p) {
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready)return AG_UNAVAILABLE;
  if(p&&!state.trust.acquisition_permitted)return AG_UNAVAILABLE;
  if(p && (memcmp(p->group,state.trust.group,16)||memcmp(p->node,state.trust.node,16)||p->epoch!=state.trust.epoch||memcmp(p->owner_pin,state.trust.public_key_sha256,32)))return AG_SCOPE;
  if(p && (!client(p->ip)||!unicast_mac(p->mac)))return AG_FORMAT;
  memset(&state.acquisition,0,sizeof state.acquisition);state.acquisition_enabled=0;
  if(p){state.acquisition.ip=p->ip;memcpy(state.acquisition.mac,p->mac,6);memcpy(state.acquisition.owner,state.trust.node,16);state.acquisition_enabled=1;}
  return AG_OK;
}
enum ag_result ag_interface_set(unsigned index, const struct ag_interface *interface) {
  unsigned i;
  LWIP_ASSERT_CORE_LOCKED();
  if(index>=AG_INTERFACE_LIMIT || !interface || !interface->netif || interface->role<AG_PHONE || interface->role>AG_EXTERNAL) return AG_INTERFACE;
  /* A later configuration cannot inherit or steal the USB partition owner. */
  if(state.partitioned[index]) return AG_CONFLICT;
  for(i=0;i<AG_INTERFACE_LIMIT;i++) if(i!=index && state.interfaces[i].netif==interface->netif) return AG_INTERFACE;
  /* Only one local phone AP and one external ingress in this bounded profile. */
  for(i=0;i<AG_INTERFACE_LIMIT;i++) if(i!=index && interface->role!=AG_MESH && state.interfaces[i].netif && state.interfaces[i].role==interface->role) return AG_INTERFACE;
  if(interface->role==AG_MESH && (zero(interface->peer,16) || !memcmp(interface->peer,state.trust.node,16) || !unicast_mac(interface->peer_mac) || !interface->next_hop || group(interface->next_hop))) return AG_INTERFACE;
  if(lifetime_generation==UINT64_MAX) return AG_UNAVAILABLE;
  state.interfaces[index]=*interface; state.routes_generation=++lifetime_generation;
  return AG_OK;
}
enum ag_result ag_interface_partition(unsigned index,struct netif *expected,int paused) {
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready) return AG_UNAVAILABLE;
  if(paused!=0 && paused!=1) return AG_FORMAT;
  if(index>=AG_INTERFACE_LIMIT || !expected || state.interfaces[index].netif!=expected || state.interfaces[index].role!=AG_MESH) return AG_INTERFACE;
  if(paused && state.partitioned[index]) {
    /* Idempotent retry; a driver callback cannot reopen the routing guard. */
    netif_set_down(expected);return AG_OK;
  }
  if(!paused && !state.partitioned[index]) return AG_INTERFACE;
  if(!netif_is_link_up(expected) || (paused && !netif_is_up(expected))) return AG_INTERFACE;
  if(lifetime_generation==UINT64_MAX) return AG_UNAVAILABLE;
  state.routes_generation=++lifetime_generation;
  state.partitioned[index]=(uint8_t)paused;
  if(paused) netif_set_down(expected);
  else {
    netif_set_up(expected);
    if(!netif_is_up(expected)) {state.partitioned[index]=1;return AG_UNAVAILABLE;}
  }
  return AG_OK;
}
int ag_interface_partitioned(unsigned index,struct netif *expected) {
  LWIP_ASSERT_CORE_LOCKED();
  return state.ready && index<AG_INTERFACE_LIMIT && expected && state.interfaces[index].netif==expected &&
    state.interfaces[index].role==AG_MESH && state.partitioned[index];
}
void ag_clock(uint64_t mono, uint64_t unix_time) {
  uint64_t elapsed;
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready || state.clock_poisoned) return;
  if(mono<state.monotonic || (state.clock_ready && (unix_time<state.clock_last_provided_unix || unix_time<1767225600ULL))) {state.clock_poisoned=1;return;}
  if(!state.clock_ready) {
    /* Establish one trusted wall/monotonic anchor. Periodic bookkeeping must
     * never restart this phase or become the packet expiry time source. */
    if(unix_time<1767225600ULL) return;
    state.clock_anchor_monotonic=mono;state.clock_anchor_unix=unix_time;state.clock_ready=1;
  }
  elapsed=(mono-state.clock_anchor_monotonic)/1000;
  if(state.clock_anchor_unix>UINT64_MAX-elapsed) {state.clock_poisoned=1;return;}
  /* Explicit forward corrections can only shorten absolute expiry; callbacks
   * with a rounded second cannot move the trusted anchor backwards. */
  if(unix_time>state.clock_anchor_unix+elapsed) state.clock_anchor_unix=unix_time-elapsed;
  state.monotonic=mono;state.unix_time=state.clock_anchor_unix+elapsed;state.clock_last_provided_unix=unix_time;
}
int ag_time_snapshot(uint64_t *milliseconds) {
  uint64_t base,elapsed;
  LWIP_ASSERT_CORE_LOCKED();
  if(!milliseconds||!live()||state.clock_anchor_unix>UINT64_MAX/1000)return 0;
  base=state.clock_anchor_unix*1000;elapsed=state.monotonic-state.clock_anchor_monotonic;
  if(base>UINT64_MAX-elapsed)return 0;
  *milliseconds=base+elapsed;return 1;
}

enum ag_result ag_admit(const uint8_t *b, size_t bytes, const uint8_t *sig, size_t sigbytes) {
  uint8_t kind,count; uint64_t seq,issued,expires,generation,quota,deadline,remaining; uint32_t ip;
  struct binding *r=NULL; unsigned i,j; int egress;
  LWIP_ASSERT_CORE_LOCKED();
  if(!live()) return AG_UNAVAILABLE;
  if(lifetime_generation==UINT64_MAX) return AG_UNAVAILABLE;
  if(!b || bytes!=AG_GRANT_BODY_BYTES || !sig || sigbytes<8 || sigbytes>AG_SIGNATURE_BYTES_LIMIT) return AG_FORMAT;
  if(memcmp(b,"AUGW1\0\0\0",8) || !zero(b+10,6) || !zero(b+106,6)) return AG_FORMAT;
  kind=b[8]; count=b[9];
  if(kind<AG_BIND || kind>AG_WITHDRAW || count>AG_PATH_LIMIT || !zero(b+128+16*count,64-16*count)) return AG_FORMAT;
  if(!ag_crypto_verify(state.key,state.trust.public_key_bytes,state.trust.public_key_sha256,b,bytes,sig,sigbytes)) return AG_SIGNATURE;
  if(memcmp(b+16,state.trust.group,16) || u64(b+32)!=state.trust.epoch || memcmp(b+40,state.trust.run,16)) return AG_SCOPE;
  if(!live()) return AG_UNAVAILABLE; /* verification time is not free lease time */
  seq=u64(b+56); issued=u64(b+64); expires=u64(b+72); generation=u64(b+112); quota=u64(b+120); ip=u32(b+96);
  if(!seq || seq<=state.sequence) return AG_REPLAY;
  if(!generation || !issued || expires<=issued || expires-issued>AG_LEASE_SECONDS || state.unix_time<issued || state.unix_time>=expires) return AG_EXPIRED;
  remaining=(expires-state.unix_time)*1000-(state.monotonic-state.clock_anchor_monotonic)%1000;
  if(state.monotonic>UINT64_MAX-remaining) return AG_EXPIRED;
  deadline=state.monotonic+remaining;
  if(zero(b+80,16)) return AG_FORMAT;
  for(i=0;i<count;i++) {
    if(zero(b+128+16*i,16) || !memcmp(b+128+16*i,state.trust.node,16)) return AG_PATH;
    for(j=0;j<i;j++) if(!memcmp(b+128+16*i,b+128+16*j,16)) return AG_PATH;
  }
  if((count && memcmp(b+128+16*(count-1),b+80,16)) || (!count && memcmp(b+80,state.trust.node,16))) return AG_PATH;
  egress=path_interface(b+80,(const uint8_t (*)[16])(b+128),count);
  if(kind==AG_BIND || kind==AG_UNBIND) {
    if(!client(ip) || !unicast_mac(b+100) || quota) return AG_FORMAT;
    if(egress<0) return AG_INTERFACE;
    r=find(ip);
    if(!r) {
      for(i=0;i<AG_ROUTE_LIMIT;i++) if(!state.routes[i].used) { r=&state.routes[i]; break; }
      if(!r) return AG_CAPACITY;
    }
    /* Conflicting owner/attachment cannot silently take over an active address.
     * A signed unbind followed by a newer attachment is an explicit move. */
    if(kind==AG_BIND && r->used && r->active &&
       (memcmp(r->owner,b+80,16) || memcmp(r->mac,b+100,6) || r->attachment!=generation)) {
      r->conflict=1; state.sequence=seq; state.routes_generation=++lifetime_generation; return AG_CONFLICT;
    }
    if(kind==AG_BIND && r->used && !r->active && generation<=r->attachment) return AG_REPLAY;
    if(kind==AG_UNBIND && r->used && (memcmp(r->owner,b+80,16) || generation<r->attachment)) return AG_CONFLICT;
    if(kind==AG_BIND && r->conflict) return AG_CONFLICT;
    {
      int same=r->used && r->active && kind==AG_BIND && r->path_count==count && !memcmp(r->path,b+128,64);
      memset(r,0,sizeof *r); r->used=1; r->ip=ip; r->attachment=generation;
      memcpy(r->owner,b+80,16); memcpy(r->mac,b+100,6); memcpy(r->path,b+128,64); r->path_count=count;
      r->active=kind==AG_BIND; r->deadline=deadline;r->expires_unix=expires;
      if(!same) state.routes_generation=++lifetime_generation;
    }
  } else {
    if(ip || !zero(b+100,6) || (kind==AG_DONOR && !quota) || (kind==AG_WITHDRAW && quota)) return AG_FORMAT;
    if(kind==AG_DONOR) {
      if(generation<=state.donor_floor) return AG_REPLAY;
      if(!count) {
        egress=-1; for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_EXTERNAL && usable(state.interfaces[i].netif)) egress=(int)i;
      }
      if(egress<0) return AG_INTERFACE;
      if(generation==state.donor_generation && state.donor_active) {
        if(memcmp(state.donor_owner,b+80,16) || state.donor_path_count!=count || memcmp(state.donor_path,b+128,64)) return AG_CONFLICT;
        if(quota<state.donor_remaining) state.donor_remaining=quota;
      } else {
        if(generation<=state.donor_generation) return AG_REPLAY;
        state.donor_remaining=quota;
      }
      state.donor_generation=generation; state.donor_deadline=deadline;state.donor_expires_unix=expires;state.donor_active=1;
      memcpy(state.donor_owner,b+80,16); memcpy(state.donor_path,b+128,64); state.donor_path_count=count;
    } else {
      if(generation<state.donor_generation || generation<state.donor_floor) return AG_REPLAY;
      state.donor_floor=generation; state.donor_active=0; state.donor_remaining=0;
    }
  }
  state.sequence=seq; return AG_OK;
}
void ag_withdraw_now(void) {
  LWIP_ASSERT_CORE_LOCKED();
  if(state.donor_generation>state.donor_floor) state.donor_floor=state.donor_generation;
  state.donor_active=0; state.donor_remaining=0;
}
struct ag_counters ag_counters_read(void) { LWIP_ASSERT_CORE_LOCKED(); return state.counters; }

int ag_route(const ip4_addr_t *source, const ip4_addr_t *dest, struct netif **out) {
  uint32_t ip=lwip_ntohl(dest->addr); struct binding *r; int i;
  LWIP_ASSERT_CORE_LOCKED(); (void)source; *out=NULL;
  if(state.ready) for(i=0;i<AG_INTERFACE_LIMIT;i++) {
    if(state.interfaces[i].role==AG_MESH && usable(state.interfaces[i].netif) && ip==state.interfaces[i].next_hop) {
      *out=state.interfaces[i].netif; return 1; /* final egress limits local underlay to bounded control UDP */
    }
  }
  if(!live()&&!local_locator(&state.acquisition)) return 1;
  if(ip==0xffffffffUL) {
    for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_PHONE && usable(state.interfaces[i].netif)) { *out=state.interfaces[i].netif; break; }
    return 1; /* DHCP only at final output; never a generic Internet fallback */
  }
  if(ip==AG_GATEWAY) {
    for(i=0;i<AG_INTERFACE_LIMIT;i++) if(state.interfaces[i].role==AG_PHONE && usable(state.interfaces[i].netif)) { *out=state.interfaces[i].netif; break; }
    return 1;
  }
  if(group(ip)) {
    r=locator_ip(ip); if((binding_live(r)||local_locator(r)) && (i=path_interface(r->owner,r->path,r->path_count))>=0) *out=state.interfaces[i].netif;
    return 1; /* group miss must NEVER fall through to a connected /24/default */
  }
  /* Only a signed, currently live donor path can become an Internet route. */
  i=donor_interface(); if(i>=0) *out=state.interfaces[i].netif;
  return 1;
}

int ag_ethernet_ingress(struct pbuf *p, struct netif *input) {
  uint8_t h[14]; int i=slot(input);
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready || i<0 || !usable(input) || pbuf_copy_partial(p,h,sizeof h,0)!=sizeof h ||
     !unicast_mac(h+6) || (h[12]!=0x08 || (h[13]!=0x00 && h[13]!=0x06))) goto deny;
  if(state.interfaces[i].role==AG_MESH && memcmp(h+6,state.interfaces[i].peer_mac,6)) goto deny;
  p->ag_route_generation=0;p->ag_donor_generation=0;p->ag_source_ip=0;p->ag_destination_ip=0;
  p->ag_input_slot=(uint8_t)(i+1); p->ag_l2_valid=1; memcpy(p->ag_l2_source,h+6,6); return 1;
deny: state.counters.ingress_dropped++; return 0;
}
int ag_ip4_ingress(struct pbuf *p, struct netif *input) {
  struct ip_hdr h; uint32_t src,dst; struct binding *r; uint16_t sport,dport; int i=slot(input), owner;
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready || i<0 || !p->ag_l2_valid || p->ag_input_slot!=(uint8_t)(i+1) || pbuf_copy_partial(p,&h,sizeof h,0)!=sizeof h) goto deny;
  src=lwip_ntohl(h.src.addr); dst=lwip_ntohl(h.dest.addr);
  /* No unchecked IP options/fragments in this first profile. IPv6 is disabled. */
  if(IPH_V(&h)!=4 || IPH_HL(&h)!=5 || (lwip_ntohs(IPH_OFFSET(&h))&(IP_MF|IP_OFFMASK)) || lwip_ntohs(IPH_LEN(&h))<20) goto deny;
  if(state.interfaces[i].role==AG_MESH && src==state.interfaces[i].next_hop &&
     dst==lwip_ntohl(netif_ip4_addr(input)->addr) && mesh_control(p,&h)) return 1;
  if(state.interfaces[i].role==AG_PHONE && udp_ports(p,&h,&sport,&dport)) {
    r=local_mac(p->ag_l2_source);
    /* DHCP may recover ONLY the exact previously signed same-boot local
     * locator. It grants no peer/application route after the lease expires. */
    if(sport==68 && dport==67 && (dst==0xffffffffUL || dst==AG_GATEWAY) &&
       local_locator(r) && (!src || src==r->ip) && locator_dhcp(p,&h,r,0) && locator_budget(r,1)) return 1;
    /* Expired bindings may deliver only a signed renewal to the local node endpoint.
     * The bounded UDP owner independently verifies every signature/scope/run. */
    if(dport==AG_CONTROL_PORT && dst==AG_GATEWAY && local_locator(r) && src==r->ip &&
       lwip_ntohs(IPH_LEN(&h))<=AG_LOCATOR_CONTROL_IP_MAX && locator_budget(r,0)) return 1;
    if(dport==AO_PORT&&dst==AG_GATEWAY&&live()&&local_locator(r)&&src==r->ip&&ota_payload(p,&h))return 1;
  }
  if(!live()) goto deny;
  if(state.interfaces[i].role==AG_EXTERNAL) {
    if(group(src) || !src || (src>>24)==127 || (src>>28)>=14 || !donor_live() || state.donor_path_count || donor_interface()!=i) goto deny;
    /* External ingress only targets this real uplink address for NAT/local
     * replies. Direct packets addressed to a group client cannot bypass NAT. */
    if(dst!=lwip_ntohl(netif_ip4_addr(input)->addr)) goto deny;
  } else {
    r=find(src); if(!binding_live(r) || (owner=path_interface(r->owner,r->path,r->path_count))!=i) goto deny;
    if(state.interfaces[i].role==AG_PHONE && memcmp(r->mac,p->ag_l2_source,6)) goto deny;
    if(dst==AG_GATEWAY && state.interfaces[i].role!=AG_PHONE) goto deny;
    if(group(dst) && dst!=AG_GATEWAY && !binding_live(find(dst))) goto deny;
    if(!group(dst) && (!donor_live() || donor_interface()==i)) goto deny;
  }
  p->ag_route_generation=state.routes_generation; p->ag_donor_generation=state.donor_generation;
  p->ag_source_ip=src; p->ag_destination_ip=dst; return 1;
deny: state.counters.ingress_dropped++; return 0;
}
int ag_arp_ingress(struct pbuf *p, struct netif *input) {
  struct etharp_hdr h; uint32_t src,dst; struct binding *r; int i=slot(input);
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready || i<0 || !p->ag_l2_valid || p->ag_input_slot!=(uint8_t)(i+1) || pbuf_copy_partial(p,&h,sizeof h,0)!=sizeof h ||
     memcmp(h.shwaddr.addr,p->ag_l2_source,6) || (h.opcode!=PP_HTONS(ARP_REQUEST) && h.opcode!=PP_HTONS(ARP_REPLY))) goto deny;
  { ip4_addr_t a,b; IPADDR_WORDALIGNED_COPY_TO_IP4_ADDR_T(&a,&h.sipaddr); IPADDR_WORDALIGNED_COPY_TO_IP4_ADDR_T(&b,&h.dipaddr); src=lwip_ntohl(a.addr); dst=lwip_ntohl(b.addr); }
  if(state.interfaces[i].role==AG_EXTERNAL) {
    if(group(src) || group(dst) || !src) goto deny;
    return 1;
  }
  /* DAD/probe zero-source requests pass no proxy/cache response. */
  if(!src) return h.opcode==PP_HTONS(ARP_REQUEST) && state.interfaces[i].role==AG_PHONE;
  if(state.interfaces[i].role==AG_MESH) {
    if(src!=state.interfaces[i].next_hop || group(dst)) goto deny;
    return 1;
  }
  r=locator_ip(src);
  if(local_locator(r) &&
     !memcmp(r->mac,h.shwaddr.addr,6) && dst==AG_GATEWAY && h.opcode==PP_HTONS(ARP_REQUEST)) return 1;
  r=find(src);if(!binding_live(r) || r->path_count || memcmp(r->mac,h.shwaddr.addr,6) || !group(dst)) goto deny;
  return 1;
deny: state.counters.arp_dropped++; return 0;
}
int ag_proxy_arp(struct netif *input, const ip4_addr_t *source, const ip4_addr_t *dest, const uint8_t mac[6]) {
  struct binding *s=find(lwip_ntohl(source->addr)), *d=find(lwip_ntohl(dest->addr)); int i=slot(input), egress;
  LWIP_ASSERT_CORE_LOCKED();
  if(i<0 || state.interfaces[i].role!=AG_PHONE || !binding_live(s) || s->path_count || memcmp(s->mac,mac,6) ||
     !binding_live(d) || !d->path_count || (egress=path_interface(d->owner,d->path,d->path_count))<0 || egress==i) return 0;
  state.counters.proxy_replies++; return 1;
}
int ag_next_hop(struct netif *output, const ip4_addr_t *dest, ip4_addr_t *next) {
  int i=slot(output); struct netif *expected=NULL;
  LWIP_ASSERT_CORE_LOCKED();
  if(i<0 || !ag_route(NULL,dest,&expected) || expected!=output) return 0;
  if(state.interfaces[i].role==AG_MESH) { next->addr=lwip_htonl(state.interfaces[i].next_hop); return 1; }
  if(state.interfaces[i].role==AG_PHONE) { *next=*dest; return 1; }
  if(ip4_addr_isany(netif_ip4_gw(output))) return 0;
  *next=*netif_ip4_gw(output); return 1;
}
int ag_ethernet_egress(struct pbuf *p, struct netif *output, uint16_t type) {
  struct ip_hdr h; ip4_addr_t destination; struct netif *expected=NULL;struct binding *s=NULL,*d=NULL;
  uint32_t src,dst; uint16_t sport,dport; int i=slot(output),input,donated=0;uint64_t bytes=0;
  LWIP_ASSERT_CORE_LOCKED();
  if(!state.ready || i<0 || !usable(output)) goto deny;
  if(type==ETHTYPE_ARP) return 1; /* validated requests/proxy replies are generated by lwIP */
  if(type!=ETHTYPE_IP || pbuf_copy_partial(p,&h,sizeof h,0)!=sizeof h || IPH_V(&h)!=4 || IPH_HL(&h)!=5) goto deny;
  src=lwip_ntohl(h.src.addr); dst=lwip_ntohl(h.dest.addr);
  /* This is local stack output only. Forwarded packets always carry their
   * ingress slot and cannot impersonate a DHCP/control service. */
  if(!p->ag_input_slot && !p->ag_route_generation) {
    if(state.interfaces[i].role==AG_MESH && src==lwip_ntohl(netif_ip4_addr(output)->addr) &&
       dst==state.interfaces[i].next_hop && mesh_control(p,&h)) return 1;
    if(state.interfaces[i].role==AG_PHONE && src==AG_GATEWAY && udp_ports(p,&h,&sport,&dport)) {
      if(sport==67 && dport==68) {
        uint8_t mac[6];struct binding *locator;
        if(pbuf_copy_partial(p,mac,6,56)==6 && (locator=local_mac(mac)) &&
           (dst==0xffffffffUL||dst==locator->ip) && locator_dhcp(p,&h,locator,1))return 1;
      }
      if(sport==AG_CONTROL_PORT && local_locator(locator_ip(dst)) && lwip_ntohs(IPH_LEN(&h))<=AG_LOCATOR_CONTROL_IP_MAX) return 1;
      if(sport==AO_PORT&&live()&&local_locator(locator_ip(dst))&&ota_payload(p,&h))return 1;
    }
    goto deny;
  }
  if(!live()) goto deny;
  if(!p->ag_route_generation || p->ag_route_generation!=state.routes_generation || !p->ag_input_slot) goto deny;
  input=p->ag_input_slot-1;
  if(input>=AG_INTERFACE_LIMIT || !state.interfaces[input].netif || input==i) goto deny;
  destination.addr=h.dest.addr;
  if(!ag_route(NULL,&destination,&expected) || expected!=output) goto deny;
  /* Recheck source binding at actual ARP dequeue, not just on arrival. */
  if(state.interfaces[input].role!=AG_EXTERNAL) {
    s=find(p->ag_source_ip);
    if(!binding_live(s) || path_interface(s->owner,s->path,s->path_count)!=input ||
       (state.interfaces[input].role==AG_PHONE && memcmp(s->mac,p->ag_l2_source,6))) goto deny;
  }
  if(group(dst)) {
    d=find(dst);if(dst==AG_GATEWAY || !binding_live(d)) goto deny;
    if(state.interfaces[input].role!=AG_EXTERNAL && src!=p->ag_source_ip) goto deny;
  }
  if(!group(dst) || state.interfaces[input].role==AG_EXTERNAL) {
    if(!donor_live() || p->ag_donor_generation!=state.donor_generation ||
       (state.interfaces[input].role!=AG_EXTERNAL && donor_interface()!=i)) goto deny;
    bytes=lwip_ntohs(IPH_LEN(&h));
    if(bytes<20 || bytes>p->tot_len || bytes>state.donor_remaining) goto deny;
    donated=1;
  }
  /* One final fresh observation authorizes all source/destination/donor
   * deadlines together. Housekeeping starvation cannot extend any of them. */
  if(!live() || (s&&!binding_current(s)) || (d&&!binding_current(d)) || (donated&&!donor_current())) goto deny;
  if(donated){state.donor_remaining-=bytes;state.counters.donated_ip_bytes+=bytes;}
  return 1;
deny: state.counters.egress_dropped++; return 0;
}
