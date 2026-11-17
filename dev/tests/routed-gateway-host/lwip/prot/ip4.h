#pragma once
#include "lwip/netif.h"
struct ip_hdr {uint8_t vhl,tos;uint16_t len,id,offset;uint8_t ttl,proto;uint16_t checksum;ip4_addr_t src,dest;};
#define IPH_V(h) ((h)->vhl>>4)
#define IPH_HL(h) ((h)->vhl&15)
#define IPH_LEN(h) ((h)->len)
#define IPH_PROTO(h) ((h)->proto)
#define IPH_OFFSET(h) ((h)->offset)
#define IP_MF 0x2000
#define IP_OFFMASK 0x1fff
