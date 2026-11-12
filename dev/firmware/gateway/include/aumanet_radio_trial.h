/* SPDX-License-Identifier: Apache-2.0. Serialized RF worker transaction policy. */
#ifndef AUMANET_RADIO_TRIAL_H
#define AUMANET_RADIO_TRIAL_H
#include "aumanet_radio_control.h"
struct ar_trial {
    struct ar_snapshot view;
    uint8_t original,action,poisoned,have_now,committed_transaction[16];
    uint64_t now,deadline;
    void *context;
    int (*apply)(void *,unsigned);
    int (*persist)(void *,unsigned,uint64_t,const uint8_t[16]);
};
int ar_trial_initialize(struct ar_trial *,unsigned,uint64_t,const uint8_t[16],void *,int (*)(void *,unsigned),int (*)(void *,unsigned,uint64_t,const uint8_t[16]));
int ar_trial_command(struct ar_trial *,unsigned,unsigned,const uint8_t[16],uint64_t,uint64_t);
void ar_trial_tick(struct ar_trial *,uint64_t,int);
#endif
