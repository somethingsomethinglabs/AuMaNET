#pragma once
#include <stdint.h>
#include <string.h>
typedef uint16_t u16_t;
struct pbuf {void *payload;uint16_t len,tot_len;uint64_t ag_route_generation,ag_donor_generation;uint32_t ag_source_ip,ag_destination_ip;uint8_t ag_input_slot,ag_l2_valid,ag_l2_source[6];};
static inline uint16_t pbuf_copy_partial(const struct pbuf*p,void*out,uint16_t bytes,uint16_t offset){if(offset>p->tot_len)return 0;if(bytes>p->tot_len-offset)bytes=p->tot_len-offset;memcpy(out,(const uint8_t*)p->payload+offset,bytes);return bytes;}
