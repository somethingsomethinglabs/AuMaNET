/* SPDX-License-Identifier: Apache-2.0. Gateway node identity.
 * SAR entropy is enabled only during documented early startup. Later automatic
 * reseeding fails closed; asynchronous RF events are not an entropy proof. */
#include "gateway_boot_crypto.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
static SemaphoreHandle_t identity_sign_mutex,drbg_mutex;
#include "aumanet_boot_recovery.h"
#include "bootloader_random.h"
#include "esp_random.h"
#include "nvs.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/pk.h"
#include "mbedtls/platform_util.h"
#include "mbedtls/sha256.h"
#include <string.h>

struct key_record {uint32_t version;uint8_t node[16];uint16_t private_bytes,public_bytes;uint8_t private_der[256],public_der[128],pin[32];};
static mbedtls_ctr_drbg_context drbg;
static mbedtls_pk_context identity;
static uint8_t public_der[128],public_pin[32];static size_t public_bytes;
static int initialized,seeded,sar_phase,identity_state,identity_loaded,identity_poisoned;
static uint8_t loaded_node[16];
static int zero(const uint8_t *p,size_t n){while(n--)if(*p++)return 0;return 1;}
static int entropy(void *ignored,uint8_t *out,size_t n){
    (void)ignored;
    if(!sar_phase)return MBEDTLS_ERR_CTR_DRBG_ENTROPY_SOURCE_FAILED;
    esp_fill_random(out,n);return 0;
}
static int random_mbed(void *ignored,uint8_t *out,size_t n){(void)ignored;if(!seeded||!drbg_mutex||xSemaphoreTake(drbg_mutex,pdMS_TO_TICKS(1000))!=pdTRUE)return MBEDTLS_ERR_CTR_DRBG_ENTROPY_SOURCE_FAILED;int result=mbedtls_ctr_drbg_random(&drbg,out,n);xSemaphoreGive(drbg_mutex);return result;}
int gb_crypto_random(uint8_t *out,size_t n){return out&&n&&n<=MBEDTLS_CTR_DRBG_MAX_REQUEST&&random_mbed(NULL,out,n)==0;}
int gb_crypto_hash(const uint8_t *p,size_t n,uint8_t out[32]){return p&&out&&mbedtls_sha256(p,n,out,0)==0;}
int gb_crypto_wifi_events(void){
    return seeded; /* No live-RF entropy source is enabled by this profile. */
}
int gb_crypto_boot(void){
    static const uint8_t purpose[]="AuMaNET gateway boot DRBG v1";
    if(initialized)return seeded;
    initialized=1;identity_sign_mutex=xSemaphoreCreateMutex();drbg_mutex=xSemaphoreCreateMutex();if(!identity_sign_mutex||!drbg_mutex)return 0;mbedtls_pk_init(&identity);mbedtls_ctr_drbg_init(&drbg);
    /* Caller is app_main before ADC/native Wi-Fi/BT initialization. */
    bootloader_random_enable();sar_phase=1;
    int result=mbedtls_ctr_drbg_seed(&drbg,entropy,NULL,purpose,sizeof purpose-1);
    sar_phase=0;bootloader_random_disable();seeded=result==0;
    /* Keep the finite default reseed interval. Once reached, crypto fails closed
     * until a new boot; never re-enable SAR while ADC/native RF may be active. */
    return seeded;
}
static int canonical_public(const uint8_t *p,size_t n){
    static const uint8_t prefix[]={0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00,0x04};
    return n==91&&!memcmp(p,prefix,sizeof prefix);
}
static int adopt(const struct key_record *record,const uint8_t node[16]){
    uint8_t encoded[128],pin[32];int n,ok=0;
    if(!seeded||record->version!=1||memcmp(record->node,node,16)||!record->private_bytes||record->private_bytes>256||!canonical_public(record->public_der,record->public_bytes))return 0;
    mbedtls_pk_free(&identity);mbedtls_pk_init(&identity);
    if(mbedtls_pk_parse_key(&identity,record->private_der,record->private_bytes,NULL,0,random_mbed,NULL))goto done;
    if(!mbedtls_pk_can_do(&identity,MBEDTLS_PK_ECDSA)||mbedtls_pk_get_bitlen(&identity)!=256||mbedtls_pk_ec(identity)->MBEDTLS_PRIVATE(grp).id!=MBEDTLS_ECP_DP_SECP256R1)goto done;
    n=mbedtls_pk_write_pubkey_der(&identity,encoded,sizeof encoded);
    if(n!=record->public_bytes||!canonical_public(encoded+sizeof encoded-n,(size_t)n)||memcmp(encoded+sizeof encoded-n,record->public_der,(size_t)n))goto done;
    if(!gb_crypto_hash(record->public_der,record->public_bytes,pin)||memcmp(pin,record->pin,32))goto done;
    memcpy(public_der,record->public_der,record->public_bytes);public_bytes=record->public_bytes;memcpy(public_pin,pin,32);ok=1;
done:
    mbedtls_platform_zeroize(encoded,sizeof encoded);mbedtls_platform_zeroize(pin,sizeof pin);
    if(!ok){mbedtls_pk_free(&identity);mbedtls_pk_init(&identity);public_bytes=0;memset(public_pin,0,32);}
    return ok;
}
enum gb_identity gb_crypto_load(const uint8_t node[16]){
    struct key_record record={0};nvs_handle_t handle;size_t bytes=sizeof record;
    if(!seeded||identity_poisoned||!node||zero(node,16))return GB_ID_INVALID;
    identity_loaded=1;memcpy(loaded_node,node,16);
    esp_err_t result=nvs_open("aumanet_gw1",NVS_READONLY,&handle);
    if(result==ESP_ERR_NVS_NOT_FOUND){identity_state=GB_ID_MISSING;return GB_ID_MISSING;}
    if(result!=ESP_OK){identity_poisoned=1;identity_state=GB_ID_INVALID;return GB_ID_INVALID;}
    result=nvs_get_blob(handle,"node_identity",&record,&bytes);nvs_close(handle);
    if(result==ESP_ERR_NVS_NOT_FOUND)identity_state=GB_ID_MISSING;
    else identity_state=result==ESP_OK&&bytes==sizeof record&&adopt(&record,node)?GB_ID_READY:GB_ID_INVALID;
    if(identity_state==GB_ID_INVALID)identity_poisoned=1;
    mbedtls_platform_zeroize(&record,sizeof record);return (enum gb_identity)identity_state;
}
int gb_crypto_create(const uint8_t node[16]){
    struct key_record record={.version=1};uint8_t encoded[256];nvs_handle_t handle;int bytes,ok=0;
    if(!seeded||identity_poisoned||!identity_loaded||identity_state!=GB_ID_MISSING||!node||zero(node,16)||memcmp(node,loaded_node,16))return 0;
    memcpy(record.node,node,16);mbedtls_pk_free(&identity);mbedtls_pk_init(&identity);
    if(mbedtls_pk_setup(&identity,mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY))||mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1,mbedtls_pk_ec(identity),random_mbed,NULL))goto done;
    bytes=mbedtls_pk_write_key_der(&identity,encoded,sizeof encoded);if(bytes<=0||bytes>256)goto done;
    record.private_bytes=(uint16_t)bytes;memcpy(record.private_der,encoded+sizeof encoded-bytes,(size_t)bytes);mbedtls_platform_zeroize(encoded,sizeof encoded);
    bytes=mbedtls_pk_write_pubkey_der(&identity,record.public_der,sizeof record.public_der);if(bytes<=0||bytes>128)goto done;
    memmove(record.public_der,record.public_der+sizeof record.public_der-bytes,(size_t)bytes);record.public_bytes=(uint16_t)bytes;
    memset(record.public_der+bytes,0,sizeof record.public_der-(size_t)bytes);
    if(!canonical_public(record.public_der,record.public_bytes)||!gb_crypto_hash(record.public_der,record.public_bytes,record.pin))goto done;
    if(nvs_open("aumanet_gw1",NVS_READWRITE,&handle)!=ESP_OK)goto poisoned;
    esp_err_t error=nvs_set_blob(handle,"node_identity",&record,sizeof record);if(error==ESP_OK)error=nvs_commit(handle);
    struct key_record readback={0};size_t read_bytes=sizeof readback;
    if(error==ESP_OK&&(nvs_get_blob(handle,"node_identity",&readback,&read_bytes)!=ESP_OK||read_bytes!=sizeof readback||memcmp(&readback,&record,sizeof record)))error=ESP_FAIL;
    mbedtls_platform_zeroize(&readback,sizeof readback);nvs_close(handle);
    if(error!=ESP_OK)goto poisoned;
    ok=adopt(&record,node);identity_state=ok?GB_ID_READY:GB_ID_INVALID;if(!ok)identity_poisoned=1;goto done;
poisoned: identity_poisoned=1;identity_state=GB_ID_INVALID;
done:
    mbedtls_platform_zeroize(encoded,sizeof encoded);mbedtls_platform_zeroize(&record,sizeof record);
    if(!ok){mbedtls_pk_free(&identity);mbedtls_pk_init(&identity);public_bytes=0;memset(public_pin,0,32);}return ok;
}
int gb_crypto_public(uint8_t out[128],size_t *bytes,uint8_t pin[32]){
    if(identity_state!=GB_ID_READY||!out||!bytes||!pin)return 0;
    memcpy(out,public_der,public_bytes);*bytes=public_bytes;memcpy(pin,public_pin,32);return 1;
}
int gb_crypto_sign(const uint8_t *p,size_t n,uint8_t signature[72],size_t *bytes){
    uint8_t hash[32];int result;
    if(identity_state!=GB_ID_READY||!p||!signature||!bytes||!gb_crypto_hash(p,n,hash))return 0;
    if(!identity_sign_mutex||xSemaphoreTake(identity_sign_mutex,pdMS_TO_TICKS(3000))!=pdTRUE)return 0;
    result=mbedtls_pk_sign(&identity,MBEDTLS_MD_SHA256,hash,32,signature,72,bytes,random_mbed,NULL);
    xSemaphoreGive(identity_sign_mutex);
    mbedtls_platform_zeroize(hash,sizeof hash);return result==0&&ab_signature_der(signature,*bytes);
}
