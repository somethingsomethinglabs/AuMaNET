#pragma once
#include "sdkconfig.h"
#if CONFIG_AUMANET_GATEWAY
#include "esp_netif.h"
void aumanet_gateway_boot(void);
void aumanet_gateway_register_commands(void);
void aumanet_gateway_mesh_ready(esp_netif_t *netif);
void aumanet_gateway_field_resume(void);
#else
static inline void aumanet_gateway_boot(void) {}
static inline void aumanet_gateway_register_commands(void) {}
static inline void aumanet_gateway_field_resume(void) {}
#endif
