/* Application-only update runtime. No caller can supply flash addresses. */
#pragma once
#include <stdint.h>
#include <stddef.h>
struct gateway_ota_config {
 uint8_t node[16],peer[16],group[16],owner_pin[32],relay[16],run[16],owner_der[128];
 size_t owner_bytes;uint64_t epoch;uint32_t phone_ip,peer_ip;unsigned role;
 int (*current)(void);int (*healthy)(void);uint32_t (*generation)(void);
};
void gateway_ota_boot(void); /* early watchdog, before potentially blocking setup */
int gateway_ota_start(const struct gateway_ota_config*);
int gateway_ota_usb_status(int,char**); /* read-only boot/rollback evidence */
