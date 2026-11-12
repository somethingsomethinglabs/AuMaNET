/* SPDX-License-Identifier: Apache-2.0 */
#ifndef AUMANET_GATEWAY_H
#define AUMANET_GATEWAY_H
#include <stddef.h>
#include <stdint.h>
#include "lwip/netif.h"
#include "lwip/pbuf.h"

/* Experimental, single TCP/IP-core owner. No radio or DHCP starts here. */
#define AG_INTERFACE_LIMIT 4
#define AG_ROUTE_LIMIT 32
#define AG_PATH_LIMIT 4
#define AG_GRANT_BODY_BYTES 192
#define AG_KEY_BYTES_LIMIT 128
#define AG_SIGNATURE_BYTES_LIMIT 72
#define AG_LEASE_SECONDS 30
#define AG_CONTROL_PORT 17778
#define AG_LOCATOR_DHCP_IP_MAX 1024
#define AG_LOCATOR_CONTROL_IP_MAX 512
#define AG_LOCATOR_REQUESTS_PER_SECOND 8
#define AG_GROUP_PREFIX 0x0a4d0000UL /* 10.77.0.0/24, host byte order */
#define AG_GATEWAY (AG_GROUP_PREFIX | 1)

enum ag_role { AG_PHONE = 1, AG_MESH = 2, AG_EXTERNAL = 3 };
enum ag_grant_kind { AG_BIND = 1, AG_UNBIND = 2, AG_DONOR = 3, AG_WITHDRAW = 4 };
enum ag_result {
  AG_OK = 0, AG_UNAVAILABLE, AG_FORMAT, AG_SIGNATURE, AG_SCOPE, AG_REPLAY,
  AG_EXPIRED, AG_CAPACITY, AG_CONFLICT, AG_PATH, AG_INTERFACE
};
/* Nonblocking TCP/IP-owner callback: exactly 1 and a boot-monotonic millisecond
 * value on success, 0 on failure. No allocation, I/O, waits or re-entry. */
typedef int (*ag_monotonic_fn)(uint64_t *milliseconds);
/* Lock-free protected runtime deny fence; exactly 1 permits the independently
 * installed acquisition record. Missing/false never grants bootstrap access. */
typedef int (*ag_acquisition_fn)(void);

struct ag_trust {
  uint8_t group[16], node[16], run[16];
  uint64_t epoch;
  const uint8_t *public_key_der;
  size_t public_key_bytes;
  uint8_t public_key_sha256[32];
  ag_monotonic_fn monotonic_ms; /* explicit; missing provider never authorizes */
  ag_acquisition_fn acquisition_permitted;
};

struct ag_interface {
  struct netif *netif;
  enum ag_role role;
  /* A provisioned/authenticated next-hop binding, not learned from ARP. */
  uint8_t peer[16], peer_mac[6];
  uint32_t next_hop; /* host order; mesh transport IP, never a group address */
};

/* Independent protected USB acquisition permission, NOT a route/grant/cache.
 * Caller must validate its persisted field/AP/node-key scope before install.
 * The core additionally checks current authority scope. No run/lease/replay state
 * is restored. It permits only exact local DHCP/ARP-to-gateway/control. */
struct ag_acquisition {
  uint8_t group[16],node[16],owner_pin[32],mac[6];
  uint64_t epoch;
  uint32_t ip;
};

struct ag_counters {
  uint64_t ingress_dropped, egress_dropped, arp_dropped, proxy_replies;
  uint64_t donated_ip_bytes; /* accepted at lwIP Ethernet handoff, not RF bytes */
};

/* Reset invalidates every ticket. NULL/missing trust or clock => all grants deny.
 * Caller must obtain node/run/key pin from independent protected provisioning;
 * this component deliberately does not invent that control plane. */
enum ag_result ag_initialize(const struct ag_trust *trust);
enum ag_result ag_acquisition_set(const struct ag_acquisition *permission); /* NULL revokes acquisition only */
enum ag_result ag_interface_set(unsigned slot, const struct ag_interface *interface);
/* Physical USB fault-injection owner only: pauses one exact configured mesh
 * interface. Does not reset authority, replay floors, leases or donation state.
 * Resume requires this owner's existing pause and a physically linked netif. */
enum ag_result ag_interface_partition(unsigned slot, struct netif *expected, int paused);
int ag_interface_partitioned(unsigned slot, struct netif *expected);
void ag_clock(uint64_t monotonic_ms, uint64_t trusted_unix_seconds);
int ag_time_snapshot(uint64_t *unix_milliseconds); /* fresh, read-only, poison-aware */
enum ag_result ag_admit(const uint8_t *body, size_t body_bytes,
                        const uint8_t *signature, size_t signature_bytes);
void ag_withdraw_now(void); /* emergency local Off; only a newer signed lease reopens */
struct ag_counters ag_counters_read(void);

/* Called by generated, SHA-gated copies of the real pinned lwIP sources. */
int ag_route(const ip4_addr_t *source, const ip4_addr_t *destination,
             struct netif **result); /* handled=1 may intentionally return NULL */
int ag_ethernet_ingress(struct pbuf *packet, struct netif *input);
int ag_ip4_ingress(struct pbuf *packet, struct netif *input);
int ag_arp_ingress(struct pbuf *packet, struct netif *input);
int ag_proxy_arp(struct netif *input, const ip4_addr_t *source,
                 const ip4_addr_t *destination, const uint8_t mac[6]);
int ag_next_hop(struct netif *output, const ip4_addr_t *destination,
                ip4_addr_t *next_hop);
int ag_ethernet_egress(struct pbuf *packet, struct netif *output, uint16_t type);

/* Provider is compiled from the SDK mbedTLS on ESP; OpenSSL only in host tests.
 * It must verify DER SPKI's SHA-256 pin, P-256 curve, and SHA256/ECDSA signature. */
int ag_crypto_verify(const uint8_t *key, size_t key_bytes, const uint8_t pin[32],
                     const uint8_t *body, size_t bytes,
                     const uint8_t *signature, size_t signature_bytes);
int ag_crypto_key_valid(const uint8_t *key, size_t key_bytes, const uint8_t pin[32]);
#endif
