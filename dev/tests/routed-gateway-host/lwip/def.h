#pragma once
#include <stdint.h>
#define lwip_htons(x) __builtin_bswap16((uint16_t)(x))
#define lwip_ntohs(x) lwip_htons(x)
#define lwip_htonl(x) __builtin_bswap32((uint32_t)(x))
#define lwip_ntohl(x) lwip_htonl(x)
#define PP_HTONS(x) lwip_htons(x)
