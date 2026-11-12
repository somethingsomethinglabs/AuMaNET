/* SPDX-License-Identifier: Apache-2.0. Private node identity, never key export. */
#pragma once
#include <stddef.h>
#include <stdint.h>
enum gb_identity {GB_ID_MISSING=0,GB_ID_READY=1,GB_ID_INVALID=2};
int gb_crypto_boot(void); /* early pre-ADC/pre-native-RF phase only, once */
int gb_crypto_wifi_events(void); /* after default event loop exists */
int gb_crypto_random(uint8_t *,size_t);
enum gb_identity gb_crypto_load(const uint8_t node[16]);
int gb_crypto_create(const uint8_t node[16]); /* explicit physical USB only */
int gb_crypto_public(uint8_t der[128],size_t *,uint8_t pin[32]);
int gb_crypto_sign(const uint8_t *,size_t,uint8_t signature[72],size_t *);
int gb_crypto_hash(const uint8_t *,size_t,uint8_t out[32]);
