/* Explicit host adapter only. Production uses pinned ESP-IDF lwIP. */
#pragma once
#include <stdint.h>
typedef struct {uint32_t addr;} ip4_addr_t;
struct netif {ip4_addr_t ip,gw;unsigned up,link;uint8_t hwaddr[6];};
#define LWIP_ASSERT_CORE_LOCKED() ((void)0)
#define netif_is_up(n) ((n)->up)
#define netif_is_link_up(n) ((n)->link)
#define netif_ip4_addr(n) (&(n)->ip)
#define netif_ip4_gw(n) (&(n)->gw)
#define netif_set_down(n) ((n)->up=0)
#define netif_set_up(n) ((n)->up=1)
#define ip4_addr_isany(n) (!(n)->addr)
#define IPADDR_WORDALIGNED_COPY_TO_IP4_ADDR_T(a,b) ((a)->addr=(b)->addr)
