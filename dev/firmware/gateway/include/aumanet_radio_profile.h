/* SPDX-License-Identifier: Apache-2.0. Pinned AU IEEE802.11-2024 operating tuples. */
#ifndef AUMANET_RADIO_PROFILE_H
#define AUMANET_RADIO_PROFILE_H
#include <stdint.h>
#include <stddef.h>
#define AR_CATALOG_VERSION 1
#define AR_OPTION_COUNT 23
#define AR_TRIAL_MS 30000
struct ar_option {uint8_t id,channel,opclass,global_opclass,bandwidth_mhz;uint32_t centre_hz;};
const struct ar_option *ar_option(unsigned id);
unsigned ar_option_match(unsigned channel,unsigned opclass);
#endif
