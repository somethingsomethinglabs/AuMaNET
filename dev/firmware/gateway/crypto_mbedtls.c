/* SPDX-License-Identifier: Apache-2.0 */
#include "aumanet_gateway.h"
#include "mbedtls/pk.h"
#include "mbedtls/sha256.h"
#include <string.h>
static int parse(mbedtls_pk_context *key, const uint8_t *der,size_t bytes,const uint8_t pin[32]) {
  uint8_t digest[32];
  if(!der || !pin || !bytes || bytes>AG_KEY_BYTES_LIMIT || mbedtls_sha256(der,bytes,digest,0) || memcmp(digest,pin,32)) return 0;
  if(mbedtls_pk_parse_public_key(key,der,bytes)) return 0;
  return mbedtls_pk_can_do(key,MBEDTLS_PK_ECDSA) && mbedtls_pk_get_bitlen(key)==256 &&
    mbedtls_pk_ec(*key)->MBEDTLS_PRIVATE(grp).id==MBEDTLS_ECP_DP_SECP256R1;
}
int ag_crypto_key_valid(const uint8_t *der,size_t bytes,const uint8_t pin[32]) {
  mbedtls_pk_context key; int ok;mbedtls_pk_init(&key);ok=parse(&key,der,bytes,pin);mbedtls_pk_free(&key);return ok;
}
int ag_crypto_verify(const uint8_t *der, size_t key_bytes, const uint8_t pin[32],
                     const uint8_t *body, size_t bytes, const uint8_t *sig, size_t sigbytes) {
  mbedtls_pk_context key; uint8_t digest[32]; int ok=0;
  if(!body || !sig || sigbytes<8 || sigbytes>AG_SIGNATURE_BYTES_LIMIT) return 0;
  mbedtls_pk_init(&key);
  if(!parse(&key,der,key_bytes,pin)) goto done;
  if(mbedtls_sha256(body,bytes,digest,0)) goto done;
  ok=mbedtls_pk_verify(&key,MBEDTLS_MD_SHA256,digest,32,sig,sigbytes)==0;
done: mbedtls_pk_free(&key); return ok;
}
