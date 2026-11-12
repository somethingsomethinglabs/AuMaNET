/* SPDX-License-Identifier: Apache-2.0. Generic images contain no fallback PSK. */
#include "sdkconfig.h"
#include "link_credentials.h"
#include "gateway_boot_crypto.h"
#include "nvs.h"
#include <string.h>
#include <stdbool.h>
struct link_record {uint32_t version;char country[3],ssid[33],password[64];uint8_t digest[32];};
_Static_assert(sizeof(struct link_record)==136,"Private link record layout");
static struct link_record retained;
static bool attempted,ready;
static int checked(const struct link_record *r){
    uint8_t hash[32];size_t s=strnlen(r->ssid,sizeof r->ssid),p=strnlen(r->password,sizeof r->password);
    if(r->version!=1||memcmp(r->country,"AU\0",3)||s<1||s>32||p<8||p>63)return 0;
    for(size_t i=s+1;i<sizeof r->ssid;i++)if(r->ssid[i])return 0;
    for(size_t i=p+1;i<sizeof r->password;i++)if(r->password[i])return 0;
    return gb_crypto_hash((const uint8_t*)r,offsetof(struct link_record,digest),hash)&&!memcmp(hash,r->digest,32);
}
int link_credentials_load(void){
    if(attempted)return ready;
    attempted=true;
    nvs_handle_t h;esp_err_t e=nvs_open("amn_link1",NVS_READONLY,&h);size_t n=sizeof retained;
    if(e==ESP_OK){e=nvs_get_blob(h,"credentials",&retained,&n);nvs_close(h);if(e==ESP_OK){ready=n==sizeof retained&&checked(&retained);return ready;}}
    if(e!=ESP_ERR_NVS_NOT_FOUND)return 0;
#if CONFIG_AUMANET_PRIVATE_BOOTSTRAP
    /* Only this explicitly private USB image can migrate legacy compile inputs.
     * Do not replace a malformed or uncertain retained record with defaults. */
    struct link_record next={.version=1};
    size_t s=strlen(CONFIG_AUMANET_SSID),p=strlen(CONFIG_AUMANET_PSK);
    if(strcmp(CONFIG_HALOW_COUNTRY_CODE,"AU")||s<1||s>32||p<8||p>63)return 0;
    memcpy(next.country,"AU",2);memcpy(next.ssid,CONFIG_AUMANET_SSID,s);memcpy(next.password,CONFIG_AUMANET_PSK,p);
    if(!gb_crypto_hash((const uint8_t*)&next,offsetof(struct link_record,digest),next.digest)||!checked(&next))return 0;
    e=nvs_open("amn_link1",NVS_READWRITE,&h);if(e!=ESP_OK)return 0;
    e=nvs_set_blob(h,"credentials",&next,sizeof next);if(e==ESP_OK)e=nvs_commit(h);
    n=sizeof retained;if(e==ESP_OK)e=nvs_get_blob(h,"credentials",&retained,&n);nvs_close(h);
    ready=e==ESP_OK&&n==sizeof retained&&!memcmp(&retained,&next,sizeof next)&&checked(&retained);
    memset(&next,0,sizeof next);return ready;
#else
    return 0;
#endif
}
const char *link_credentials_ssid(void){return ready?retained.ssid:"";}
const char *link_credentials_password(void){return ready?retained.password:"";}
int link_credentials_scope(uint8_t digest[32]){
    uint8_t bytes[3+33+64];if(!link_credentials_load()||!digest)return 0;
    size_t s=strlen(retained.ssid)+1,p=strlen(retained.password)+1;
    memcpy(bytes,retained.country,3);memcpy(bytes+3,retained.ssid,s);memcpy(bytes+3+s,retained.password,p);
    int ok=gb_crypto_hash(bytes,3+s+p,digest);memset(bytes,0,sizeof bytes);return ok;
}
