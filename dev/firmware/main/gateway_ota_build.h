#pragma once
#include <stdint.h>
struct gateway_ota_build {
 uint8_t magic[8],role,layout,country[2],power,private_bootstrap,channel,flags;
 char version[32];uint8_t commit[20];char ref[128],build[64];uint8_t profile[32];
};
_Static_assert(sizeof(struct gateway_ota_build)==292,"OTA embedded identity ABI");
extern const struct gateway_ota_build gateway_ota_build;
