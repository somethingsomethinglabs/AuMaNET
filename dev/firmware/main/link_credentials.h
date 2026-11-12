/* Private retained radio credentials; never exported through network status. */
#pragma once
#include <stddef.h>
#include <stdint.h>
int link_credentials_load(void);
const char *link_credentials_ssid(void);
const char *link_credentials_password(void);
int link_credentials_scope(uint8_t digest[32]);
