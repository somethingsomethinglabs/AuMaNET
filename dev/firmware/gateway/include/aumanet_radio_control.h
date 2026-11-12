/* SPDX-License-Identifier: Apache-2.0. Dedicated authenticated radio purpose. */
#ifndef AUMANET_RADIO_CONTROL_H
#define AUMANET_RADIO_CONTROL_H
#include "aumanet_boot_recovery.h"
#include "aumanet_radio_profile.h"
#define AR_QUERY_BYTES 136
#define AR_REPORT_BYTES 232
#define AR_COMMAND_BYTES 224
enum ar_kind {AR_QUERY=7,AR_REPORT=8,AR_COMMAND=9};
struct ar_snapshot {uint8_t transaction[16],current,persisted,target,state,actual,associated,station,flags,power;uint16_t error;uint64_t generation;uint32_t remaining;};
struct ar_config {struct ab_config trust;uint8_t peer[16],station;uint32_t owner_ip,peer_ip;int (*read)(void *,struct ar_snapshot *);int (*command)(void *,unsigned,unsigned,const uint8_t[16],uint64_t);};
struct ar_context {struct ar_config config;uint8_t ready,enabled,poisoned,have_now,pending,consumed,reserved;uint64_t last_now,deadline,relay_deadline;uint16_t relay_port;uint8_t nonce[32],query[136],command[224],relay_challenge[32],reply[321];size_t reply_bytes;};
int ar_frame_read(const uint8_t *,size_t,struct ab_view *);
int ar_frame_write(const uint8_t *,size_t,const uint8_t *,size_t,uint8_t[321],size_t *);
enum ab_result ar_initialize(struct ar_context *,const struct ar_config *);
void ar_permit(struct ar_context *,int);
enum ab_result ar_handle(struct ar_context *,const uint8_t *,size_t,uint8_t[321],size_t *);
int ar_transport_receive(struct ar_context *,const uint8_t *,size_t,uint32_t,uint16_t,uint8_t[321],size_t *,uint32_t *,uint16_t *);
#endif
