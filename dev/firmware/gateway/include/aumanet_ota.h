/* SPDX-License-Identifier: Apache-2.0. Bounded application-only OTA protocol. */
#pragma once
#include <stdint.h>
#include <stddef.h>
#define AO_PORT 17779
#define AO_MAX_FRAME 1200
#define AO_MANIFEST 384
#define AO_SLOT_BYTES 0x240000u
#define AO_QUERY 136
#define AO_REPORT 1024
#define AO_START 768
#define AO_COMMAND 256
#define AO_CHUNK 1024
#define AO_WINDOW 4
#define AO_CHALLENGE_MS 10000u
#define AO_SESSION_MS 1800000u
#define AO_IDLE_MS 30000u
enum ao_state {AO_IDLE,AO_UPLOADING,AO_VERIFIED,AO_ACTIVATING,AO_PENDING,AO_CONFIRMED,AO_FAILED};
struct ao_port {
 void *context;
 int (*current)(void*);
 uint64_t (*now)(void*);
 uint32_t (*generation)(void*);
 int (*random)(void*,uint8_t*,size_t);
 int (*hash)(void*,const uint8_t*,size_t,uint8_t[32]);
 int (*owner_verify)(void*,const uint8_t*,size_t,const uint8_t*,size_t);
 int (*publisher_verify)(void*,const uint8_t*,size_t,const uint8_t*,size_t);
 int (*sign)(void*,const uint8_t*,size_t,uint8_t[72],size_t*);
 int (*ephemeral)(void*,uint8_t[65]);
 int (*derive)(void*,const uint8_t[65],const uint8_t[32],uint8_t[72]);
 int (*gcm)(void*,int,const uint8_t[32],const uint8_t[12],const uint8_t*,size_t,const uint8_t*,size_t,uint8_t*,uint8_t[16]);
 int (*begin)(void*,const uint8_t[384],const uint8_t*,size_t,const uint8_t[16]);
 int (*write)(void*,uint32_t,const uint8_t*,size_t);
 int (*finish)(void*,const uint8_t[384]);
 void (*abort)(void*);
 int (*activate)(void*,const uint8_t[16],const uint8_t[32]);
 int (*confirm)(void*,const uint8_t[16],const uint8_t[32]);
 void (*status)(void*,uint8_t[1024]);
};
struct ao_chunk {uint8_t data[AO_CHUNK];uint32_t offset;uint16_t bytes;uint8_t used;};
struct ao_context {
 struct ao_port port;
 uint8_t node[16],group[16],owner[32],relay[16],run[16];uint64_t epoch;
 uint8_t role,state,initialized,pending;
 uint32_t authority_generation;
 uint8_t query[AO_QUERY],challenge[32],public_key[65],last_start_hash[32];
 uint64_t query_started,started,last_activity,rx_high,rx_bits,tx_counter;
 uint8_t session[16],keys[72],manifest[AO_MANIFEST],artifact[32];
 uint32_t image_bytes,received;struct ao_chunk chunks[AO_WINDOW];
};
int ao_initialize(struct ao_context*,const struct ao_port*,const uint8_t*,const uint8_t*,uint64_t,const uint8_t*,const uint8_t*,const uint8_t*,unsigned);
/* Strict structural admission only. Signature/AEAD is checked by receive. */
int ao_frame_kind(const uint8_t*,size_t);
int ao_manifest_checked(const uint8_t*,unsigned);
int ao_receive(struct ao_context*,const uint8_t*,size_t,uint64_t,uint8_t*,size_t*);
void ao_tick(struct ao_context*,uint64_t);
