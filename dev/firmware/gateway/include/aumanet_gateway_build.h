/* SPDX-License-Identifier: Apache-2.0 */
#ifndef AUMANET_GATEWAY_BUILD_H
#define AUMANET_GATEWAY_BUILD_H
#ifndef __ASSEMBLER__
#include <stdint.h>
/* This header is force-included for the entire isolated firmware/host profile.
 * No mixed pbuf ABI: the normal bench never includes it. */
#define LWIP_PBUF_CUSTOM_DATA \
  uint64_t ag_route_generation; \
  uint64_t ag_donor_generation; \
  uint32_t ag_source_ip; \
  uint32_t ag_destination_ip; \
  uint8_t ag_input_slot; \
  uint8_t ag_l2_valid; \
  uint8_t ag_l2_source[6];
#endif
#endif
