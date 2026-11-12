/* SPDX-License-Identifier: Apache-2.0. Fixed two-node control relay, no sockets. */
#ifndef AUMANET_BOOT_TRANSPORT_H
#define AUMANET_BOOT_TRANSPORT_H
#include "aumanet_boot_recovery.h"
enum ab_lane {AB_LANE_GRANT=0,AB_LANE_REQUEST=1,AB_LANE_RESPONSE=2,AB_LANE_SIGNAL=3};
struct ab_budget {uint64_t started,last_now;unsigned used[4];uint8_t initialized,poisoned;};
int ab_budget_take(struct ab_budget *,enum ab_lane,uint64_t);
struct ab_transport_config {struct ab_config local;uint8_t peer[16],is_node_b;uint32_t owner_ip,peer_ip;};
struct ab_transport {
    struct ab_transport_config config;struct ab_context local;
    uint8_t ready,poisoned,have_now,reserved;uint64_t last_now,deadline;
    uint8_t owner_challenge[32];uint16_t owner_port;
};
enum ab_result ab_transport_initialize(struct ab_transport *,const struct ab_transport_config *);
void ab_transport_permit(struct ab_transport *,int);
/* 1 = bounded reply/relay, 0 = no packet. All addresses are host order.
 * Caller must already enforce the L3/source-MAC policies and separate budgets. */
int ab_transport_receive(struct ab_transport *,const uint8_t *,size_t,uint32_t,uint16_t,
                         uint8_t[321],size_t *,uint32_t *,uint16_t *);
#endif
