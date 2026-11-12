/* SPDX-License-Identifier: Apache-2.0. Pure bounded boot policy; no I/O or keys. */
#ifndef AUMANET_BOOT_RECOVERY_H
#define AUMANET_BOOT_RECOVERY_H
#include <stddef.h>
#include <stdint.h>
#define AB_QUERY_BYTES 136
#define AB_PROOF_BYTES 232
#define AB_TIME_BYTES 224
#define AB_ACK_BYTES 224
#define AB_SIGNATURE_MAX 72
#define AB_FRAME_MAX 321
#define AB_WINDOW_MS 5000
#define AB_UPPER_MARGIN_MS 10000
#define AB_MAX_SAFE 9007199254740991ULL
#define AB_OWNER_TIME_MAX (AB_MAX_SAFE-11000)
enum ab_kind {AB_QUERY=1,AB_PROOF,AB_TIME,AB_ACK,AB_SIGNAL_QUERY,AB_SIGNAL_REPORT};
enum ab_clock {AB_CLOCK_UNSET=0,AB_CLOCK_SIGNED=1,AB_CLOCK_USB=2};
enum ab_result {AB_OK=0,AB_FORMAT,AB_UNAVAILABLE,AB_SIGNATURE,AB_SCOPE,AB_EXPIRED,AB_INITIALIZED};
struct ab_view {enum ab_kind kind;const uint8_t *body,*signature;size_t body_bytes,signature_bytes;};
struct ab_signal {uint8_t peer[16],status,role;int32_t rssi;};
struct ab_config {
    uint8_t group[16],node[16],relay[16],run[16],owner_pin[32],node_pin[32];
    uint64_t epoch;
    void *context;
    int (*now)(void *,uint64_t *);
    int (*random)(void *,uint8_t *,size_t);
    int (*hash)(void *,const uint8_t *,size_t,uint8_t[32]);
    int (*verify_owner)(void *,const uint8_t *,size_t,const uint8_t *,size_t);
    int (*sign_node)(void *,const uint8_t *,size_t,uint8_t[72],size_t *);
    int (*read_clock)(void *,enum ab_clock *,uint64_t *);
    /* Exactly-once local clock initialization; never reset trust/counters.
     * Failure is an unknown outcome and poisons this policy owner. */
    int (*install_clock)(void *,uint64_t);
    int (*read_signal)(void *,struct ab_signal *); /* optional; no scan or authority mutation */
    uint8_t field_permitted;
};
struct ab_context {
    struct ab_config config;
    struct ab_signal signal;uint64_t signal_at;uint8_t have_signal;
    uint8_t ready,enabled,poisoned,have_now,pending,accepted,have_clock;
    uint64_t last_now,pending_deadline,applied_upper,last_clock;
    uint8_t query[136],proof[232],proof_signature[72];size_t proof_signature_bytes;
    uint8_t accepted_time[224],accepted_digest[32],ack[224],ack_signature[72];size_t ack_signature_bytes;
};
int ab_signature_der(const uint8_t *,size_t);
int ab_frame_read(const uint8_t *,size_t,struct ab_view *);
int ab_frame_write(const uint8_t *,size_t,const uint8_t *,size_t,uint8_t[321],size_t *);
enum ab_result ab_initialize(struct ab_context *,const struct ab_config *);
void ab_permit(struct ab_context *,int);
enum ab_result ab_handle(struct ab_context *,const uint8_t *,size_t,uint8_t[321],size_t *);
#endif
