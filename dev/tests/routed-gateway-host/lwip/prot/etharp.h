#pragma once
#include "lwip/netif.h"
struct eth_addr {uint8_t addr[6];};
#pragma pack(push,1)
struct etharp_hdr {uint16_t hwtype,proto;uint8_t hwlen,protolen;uint16_t opcode;struct eth_addr shwaddr;ip4_addr_t sipaddr;struct eth_addr dhwaddr;ip4_addr_t dipaddr;};
#pragma pack(pop)
#define ARP_REQUEST 1
#define ARP_REPLY 2
