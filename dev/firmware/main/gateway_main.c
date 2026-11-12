/* SPDX-License-Identifier: Apache-2.0. Experimental USB-provisioned gateway. */
#include "sdkconfig.h"
#include "gateway_main.h"
#include "link.h"
#include "aumanet_gateway.h"
#include "aumanet_boot_transport.h"
#include "aumanet_radio_control.h"
#include "gateway_boot_crypto.h"
#include "gateway_ota.h"
#include "esp_console.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "esp_wifi_default.h"
#include "esp_netif_net_stack.h"
#include "nvs.h"
#include "lwip/tcpip.h"
#include "lwip/sockets.h"
#include "lwip/inet.h"
#include "dhcpserver/dhcpserver.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include <stdatomic.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* No native layout crosses the wire. This NVS version is local to ESP32S3;
 * future/corrupt blobs remain unavailable until explicit physical provisioning. */
struct provision {
    uint32_t version;
    uint64_t epoch;
    uint8_t group[16], node[16], peer[16], peer_mac[6], key[128], pin[32];
    uint16_t key_bytes;
    uint32_t lease_ip;
    char ssid[33], password[64];
};
/* Acquisition permission is separate from route grants and never restores time,
 * sequence floors, membership or packet-forwarding authority. USB setup only. */
struct acquisition_permission {uint32_t version,ip;uint8_t mac[6],scope[32];};
static struct acquisition_permission acquisition;
static bool acquisition_present,acquisition_storage_failed,acquisition_apply_failed;
static _Atomic bool acquisition_runtime_allowed;
static int read_acquisition_permission(void){return atomic_load(&acquisition_runtime_allowed)?1:0;}
static struct provision saved;
static uint8_t run[16];
static SemaphoreHandle_t mutex;
static esp_netif_t *phone_handle;
static struct netif *mesh_impl, *phone_impl;
static uint64_t unix_base, unix_started_ms;
static bool provisioned, persist_failed, core_ready, ap_touched, ap_started;
static atomic_bool ota_allowed,ota_healthy;
static _Atomic uint32_t ota_epoch=1;
static uint32_t ota_generation(void){return atomic_load(&ota_epoch);}
static void ota_deny(void){atomic_store(&ota_allowed,false);atomic_store(&ota_healthy,false);uint32_t epoch=atomic_load(&ota_epoch);if(epoch&&epoch!=UINT32_MAX)atomic_store(&ota_epoch,epoch+1);else atomic_store(&ota_epoch,0);}
static int ota_current(void){return atomic_load(&ota_allowed)?1:0;}
static int ota_health(void){return atomic_load(&ota_healthy)?1:0;}
static int control_socket=-1;
static enum ag_result operation_result;
static uint8_t grant_body[AG_GRANT_BODY_BYTES], grant_signature[AG_SIGNATURE_BYTES_LIMIT];
static size_t grant_signature_bytes;
static uint64_t packets_accepted, packets_rejected, packets_relayed;
static bool requested_partition, observed_partition, observed_mesh_up, observed_mesh_link;
static enum gb_identity node_identity;
static uint8_t field_permitted,field_storage_failed,boot_initialized,boot_clock_poisoned;
static uint8_t stored_field_scope[32];
static enum ab_clock clock_origin;
static struct ab_transport boot_transport,signal_transport;
static struct ab_budget control_budget;
static struct ar_context radio_control;
static struct ab_budget radio_budget;
static uint64_t boot_clock_value,boot_clock_request;
static int boot_clock_result;
static bool call_core(tcpip_callback_fn);
static void configure_boot(void);
static int field_scope(uint8_t digest[32]){
    uint8_t public_key[128],pin[32],input[sizeof saved+32];size_t bytes=0;
    if(node_identity!=GB_ID_READY||!gb_crypto_public(public_key,&bytes,pin))return 0;
    memcpy(input,&saved,sizeof saved);memcpy(input+sizeof saved,pin,32);return gb_crypto_hash(input,sizeof input,digest);
}
static void refresh_radio_scope(void){uint8_t scope[32];if(provisioned&&node_identity==GB_ID_READY&&field_scope(scope))bench_link_radio_setup(scope,saved.peer_mac);else bench_link_radio_setup(NULL,NULL);}

static int all_zero(const uint8_t *p,size_t n) {while(n--)if(*p++)return 0;return 1;}
static int hex_digit(char c) {if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;}
static bool unhex(const char *s,uint8_t *out,size_t n) {
    if(!s || strlen(s)!=n*2)return false;
    for(size_t i=0;i<n;i++){int a=hex_digit(s[i*2]),b=hex_digit(s[i*2+1]);if(a<0||b<0)return false;out[i]=(uint8_t)((a<<4)|b);}return true;
}
static void print_hex(const uint8_t *p,size_t n) {while(n--)printf("%02x",*p++);}
static bool token(const char *s) {uint8_t value[16];return unhex(s,value,16)&&!memcmp(value,run,16);}
static bool decimal(const char *s,uint64_t *value) {
    char *end; if(!s||!*s||*s<'0'||*s>'9')return false;errno=0;unsigned long long n=strtoull(s,&end,10);
    if(errno||*end)return false;
    *value=n;return true;
}
static bool client_ip(uint32_t ip) {return (ip&0xffffff00UL)==AG_GROUP_PREFIX&&(ip&255)>1&&(ip&255)<255;}
static bool valid(const struct provision *p) {
    return p->version==1 && p->epoch && !all_zero(p->group,16) && !all_zero(p->node,16) &&
      !all_zero(p->peer,16) && memcmp(p->node,p->peer,16) && !(p->peer_mac[0]&1) && !all_zero(p->peer_mac,6) &&
      ag_crypto_key_valid(p->key,p->key_bytes,p->pin);
}
static bool configured_ap(void) {
    size_t ssid=strnlen(saved.ssid,sizeof saved.ssid),password=strnlen(saved.password,sizeof saved.password);
    return client_ip(saved.lease_ip)&&ssid>0&&ssid<=32&&password>=8&&password<=63;
}
static bool acquisition_allowed(void) {
    uint8_t scope[32];
    return acquisition_present&&!acquisition_storage_failed&&field_permitted&&!field_storage_failed&&!persist_failed&&
      provisioned&&configured_ap()&&node_identity==GB_ID_READY&&acquisition.version==1&&acquisition.ip==saved.lease_ip&&
      !(acquisition.mac[0]&1)&&!all_zero(acquisition.mac,6)&&field_scope(scope)&&!memcmp(scope,acquisition.scope,32);
}
static void core_acquisition(void *ignored) {
    (void)ignored;atomic_store(&acquisition_runtime_allowed,false);struct ag_acquisition permission={0};
    if(!acquisition_allowed()){operation_result=ag_acquisition_set(NULL);return;}
    memcpy(permission.group,saved.group,16);memcpy(permission.node,saved.node,16);memcpy(permission.owner_pin,saved.pin,32);
    permission.epoch=saved.epoch;permission.ip=acquisition.ip;memcpy(permission.mac,acquisition.mac,6);
    operation_result=ag_acquisition_set(&permission);
    if(operation_result==AG_OK)atomic_store(&acquisition_runtime_allowed,true);
}
static bool persist(const struct provision *next) {
    ota_deny();
    bool changed=!provisioned||memcmp(&saved,next,sizeof saved);uint8_t empty_scope[32]={0};
    if(changed)atomic_store(&acquisition_runtime_allowed,false);
    nvs_handle_t handle;esp_err_t error=nvs_open("aumanet_gw1",NVS_READWRITE,&handle);
    if(error==ESP_OK){error=nvs_set_blob(handle,"provision",next,sizeof *next);
      if(error==ESP_OK&&changed){error=nvs_erase_key(handle,"acquisition");if(error==ESP_ERR_NVS_NOT_FOUND)error=ESP_OK;
        if(error==ESP_OK)error=nvs_set_u8(handle,"field_boot",0);
        if(error==ESP_OK)error=nvs_set_blob(handle,"field_scope",empty_scope,sizeof empty_scope);}
      if(error==ESP_OK)error=nvs_commit(handle);
      nvs_close(handle);}
    if(error!=ESP_OK){persist_failed=true;acquisition_present=false;puts("Gateway storage outcome unavailable; reboot before further gateway actions.");return false;}
    saved=*next;provisioned=true;
    if(changed){field_permitted=0;acquisition_present=false;acquisition_storage_failed=false;memset(&acquisition,0,sizeof acquisition);memset(stored_field_scope,0,sizeof stored_field_scope);
      if(boot_initialized)ab_transport_permit(&boot_transport,0);
      ab_transport_permit(&signal_transport,0);ar_permit(&radio_control,0);bench_link_radio_permit(0);}
    return true;
}
static uint64_t mono_ms(void) {return (uint64_t)(esp_timer_get_time()/1000);}
static int read_monotonic_ms(uint64_t *milliseconds) {
    int64_t microseconds=esp_timer_get_time();
    if(!milliseconds||microseconds<0)return 0;
    *milliseconds=(uint64_t)microseconds/1000;return 1;
}
static void core_clock(void *ignored) {
    (void)ignored;uint64_t mono=0;
    if(!read_monotonic_ms(&mono)||mono<unix_started_ms){ag_clock(0,0);return;}
    ag_clock(mono,unix_base?unix_base+(mono-unix_started_ms)/1000:0);
}
static void core_boot_clock_read(void *ignored){(void)ignored;boot_clock_result=ag_time_snapshot(&boot_clock_value);}
static void core_boot_clock_install(void *ignored){
    (void)ignored;uint64_t mono=0;boot_clock_result=0;
    if(!core_ready||unix_base||clock_origin!=AB_CLOCK_UNSET||boot_clock_poisoned||boot_clock_request%1000||boot_clock_request>AB_MAX_SAFE||!read_monotonic_ms(&mono))return;
    ag_clock(mono,boot_clock_request/1000);
    if(!ag_time_snapshot(&boot_clock_value)||boot_clock_value<boot_clock_request){boot_clock_poisoned=1;return;}
    unix_base=boot_clock_request/1000;unix_started_ms=mono;clock_origin=AB_CLOCK_SIGNED;boot_clock_result=1;
}
static void core_configure(void *ignored) {
    (void)ignored;struct ag_trust trust={0};struct ag_interface iface={0};
    memcpy(trust.group,saved.group,16);memcpy(trust.node,saved.node,16);memcpy(trust.run,run,16);trust.epoch=saved.epoch;
    trust.public_key_der=saved.key;trust.public_key_bytes=saved.key_bytes;memcpy(trust.public_key_sha256,saved.pin,32);
    trust.monotonic_ms=read_monotonic_ms;trust.acquisition_permitted=read_acquisition_permission;
    operation_result=ag_initialize(&trust);if(operation_result!=AG_OK)return;
    core_acquisition(NULL);if(operation_result!=AG_OK)return;
    core_clock(NULL);iface.netif=mesh_impl;iface.role=AG_MESH;memcpy(iface.peer,saved.peer,16);memcpy(iface.peer_mac,saved.peer_mac,6);
#if CONFIG_AUMANET_NODE_B
    iface.next_hop=0x0a4e0001;
#else
    iface.next_hop=0x0a4e0002;
#endif
    operation_result=ag_interface_set(1,&iface);if(operation_result!=AG_OK)return;
    if(phone_impl&&ap_started){memset(&iface,0,sizeof iface);iface.netif=phone_impl;iface.role=AG_PHONE;operation_result=ag_interface_set(0,&iface);}
}
static void core_grant(void *ignored) {(void)ignored;core_clock(NULL);operation_result=ag_admit(grant_body,sizeof grant_body,grant_signature,grant_signature_bytes);}
static void core_path_status(void *ignored) {
    (void)ignored;observed_partition=ag_interface_partitioned(1,mesh_impl);
    observed_mesh_up=mesh_impl&&netif_is_up(mesh_impl);observed_mesh_link=mesh_impl&&netif_is_link_up(mesh_impl);
}
static void core_path(void *ignored) {
    (void)ignored;core_clock(NULL);operation_result=ag_interface_partition(1,mesh_impl,requested_partition?1:0);core_path_status(NULL);
}
static bool call_core(tcpip_callback_fn callback) {
    if(!mesh_impl)return false;
    return tcpip_callback_wait(callback,NULL)==ERR_OK;
}
static int boot_now(void *ignored,uint64_t *out){(void)ignored;return read_monotonic_ms(out);}
static int boot_random(void *ignored,uint8_t *out,size_t bytes){(void)ignored;return gb_crypto_random(out,bytes);}
static int boot_hash(void *ignored,const uint8_t *p,size_t bytes,uint8_t out[32]){(void)ignored;return gb_crypto_hash(p,bytes,out);}
static int boot_verify(void *ignored,const uint8_t *p,size_t bytes,const uint8_t *signature,size_t n){(void)ignored;return ag_crypto_verify(saved.key,saved.key_bytes,saved.pin,p,bytes,signature,n);}
static int boot_sign(void *ignored,const uint8_t *p,size_t bytes,uint8_t signature[72],size_t *n){(void)ignored;return gb_crypto_sign(p,bytes,signature,n);}
static int boot_read_clock(void *ignored,enum ab_clock *origin,uint64_t *milliseconds){
    (void)ignored;if(!core_ready||boot_clock_poisoned)return 0;
    if(!unix_base){*origin=AB_CLOCK_UNSET;*milliseconds=0;return clock_origin==AB_CLOCK_UNSET;}
    if(!call_core(core_boot_clock_read)||!boot_clock_result)return 0;
    *origin=clock_origin;*milliseconds=boot_clock_value;return 1;
}
static int boot_install_clock(void *ignored,uint64_t upper){
    (void)ignored;boot_clock_request=upper;boot_clock_result=0;
    if(!call_core(core_boot_clock_install)||!boot_clock_result){boot_clock_poisoned=1;return 0;}return 1;
}
static int boot_read_signal(void *ignored,struct ab_signal *value){
    (void)ignored;memset(value,0,sizeof *value);memcpy(value->peer,saved.peer,16);
#if CONFIG_AUMANET_NODE_B
    value->role=1;
#endif
    value->status=(uint8_t)bench_link_signal(saved.peer_mac,&value->rssi);return 1;
}
static int boot_read_radio(void *ignored,struct ar_snapshot *value){(void)ignored;return bench_link_radio_read(value);}
static int boot_command_radio(void *ignored,unsigned op,unsigned option,const uint8_t transaction[16],uint64_t generation){(void)ignored;return field_permitted&&!field_storage_failed&&bench_link_radio_command(op,option,transaction,generation);}
static void configure_boot(void){
    if(boot_initialized||!core_ready||node_identity!=GB_ID_READY||field_storage_failed)return;
    struct ab_transport_config config={0};uint8_t public_key[128];size_t public_bytes=0;
    if(!gb_crypto_public(public_key,&public_bytes,config.local.node_pin))return;
    memcpy(config.local.group,saved.group,16);memcpy(config.local.node,saved.node,16);memcpy(config.local.run,run,16);memcpy(config.local.owner_pin,saved.pin,32);memcpy(config.peer,saved.peer,16);
    config.local.read_signal=boot_read_signal;config.local.epoch=saved.epoch;config.local.field_permitted=field_permitted;
    config.local.now=boot_now;config.local.random=boot_random;config.local.hash=boot_hash;config.local.verify_owner=boot_verify;config.local.sign_node=boot_sign;config.local.read_clock=boot_read_clock;config.local.install_clock=boot_install_clock;
    config.owner_ip=saved.lease_ip;
#if CONFIG_AUMANET_NODE_B
    config.is_node_b=1;config.peer_ip=0x0a4e0001;memcpy(config.local.relay,saved.peer,16);
#else
    config.peer_ip=0x0a4e0002;memcpy(config.local.relay,saved.node,16);
#endif
    boot_initialized=ab_transport_initialize(&boot_transport,&config)==AB_OK&&ab_transport_initialize(&signal_transport,&config)==AB_OK;
    struct ar_config radio={.trust=config.local,.station=config.is_node_b,.owner_ip=config.owner_ip,.peer_ip=config.peer_ip,.read=boot_read_radio,.command=boot_command_radio};memcpy(radio.peer,config.peer,16);
    ar_initialize(&radio_control,&radio);bench_link_radio_permit(field_permitted&&!field_storage_failed);
}
static void load_acquisition(void){
    acquisition_present=false;acquisition_storage_failed=false;memset(&acquisition,0,sizeof acquisition);
    nvs_handle_t acquisition_handle;esp_err_t acquisition_error=nvs_open("aumanet_gw1",NVS_READONLY,&acquisition_handle);
    if(acquisition_error==ESP_OK){size_t n=sizeof acquisition;acquisition_error=nvs_get_blob(acquisition_handle,"acquisition",&acquisition,&n);nvs_close(acquisition_handle);
      if(acquisition_error==ESP_OK&&n==sizeof acquisition&&acquisition.version==1&&client_ip(acquisition.ip)&&!(acquisition.mac[0]&1)&&!all_zero(acquisition.mac,6))acquisition_present=true;
      else if(acquisition_error!=ESP_ERR_NVS_NOT_FOUND)acquisition_storage_failed=true;
    }else if(acquisition_error!=ESP_ERR_NVS_NOT_FOUND)acquisition_storage_failed=true;
 }
void aumanet_gateway_boot(void) {
    mutex=xSemaphoreCreateMutex();if(!mutex)abort();
    if(!gb_crypto_boot()||!gb_crypto_random(run,sizeof run)||all_zero(run,sizeof run)){memset(run,0,sizeof run);persist_failed=true;}
    nvs_handle_t handle;size_t bytes=sizeof saved;esp_err_t result=nvs_open("aumanet_gw1",NVS_READONLY,&handle);
    if(result==ESP_OK){result=nvs_get_blob(handle,"provision",&saved,&bytes);esp_err_t permission=nvs_get_u8(handle,"field_boot",&field_permitted);if(permission==ESP_ERR_NVS_NOT_FOUND)field_permitted=0;else if(permission!=ESP_OK||field_permitted>1){field_permitted=0;field_storage_failed=1;}if(field_permitted){size_t scope_bytes=32;if(nvs_get_blob(handle,"field_scope",stored_field_scope,&scope_bytes)!=ESP_OK||scope_bytes!=32){field_permitted=0;field_storage_failed=1;}}nvs_close(handle);}
    load_acquisition();
    provisioned=result==ESP_OK&&bytes==sizeof saved&&valid(&saved);
    if(!provisioned)memset(&saved,0,sizeof saved);
    if(provisioned)node_identity=gb_crypto_load(saved.node);else field_permitted=0;
    if(field_permitted){uint8_t scope[32];if(!field_scope(scope)||memcmp(scope,stored_field_scope,32))field_permitted=0;}
    refresh_radio_scope();
}
void aumanet_gateway_mesh_ready(esp_netif_t *netif) {
    xSemaphoreTake(mutex,portMAX_DELAY);mesh_impl=esp_netif_get_netif_impl(netif);
    core_ready=provisioned&&!persist_failed&&call_core(core_configure)&&operation_result==AG_OK;
    if(core_ready){gb_crypto_wifi_events();configure_boot();}
    xSemaphoreGive(mutex);
}
static int status_command(int argc,char **argv) {
    (void)argc;(void)argv;xSemaphoreTake(mutex,portMAX_DELAY);
    observed_partition=false;observed_mesh_up=false;observed_mesh_link=false;if(mesh_impl)call_core(core_path_status);
    printf("\n{\"schema\":\"aumanet.gateway.v1\",\"type\":\"status\",\"provisioned\":%s,\"storage_failed\":%s,\"core_ready\":%s,\"trusted_time\":%s,\"ap_started\":%s,\"lease_ip\":%lu,\"run\":\"",
      provisioned?"true":"false",persist_failed?"true":"false",core_ready?"true":"false",unix_base?"true":"false",ap_started?"true":"false",(unsigned long)saved.lease_ip);
    print_hex(run,16);printf("\",\"node\":\"");if(provisioned)print_hex(saved.node,16);
    printf("\",\"mesh_mac\":\"");if(mesh_impl)print_hex(mesh_impl->hwaddr,mesh_impl->hwaddr_len);
    printf("\",\"mesh_path_paused\":%s,\"mesh_netif_up\":%s,\"mesh_link_up\":%s,\"accepted\":%llu,\"rejected\":%llu,\"relayed\":%llu,\"node_key_state\":%d,\"field_autostart\":%s,\"boot_control_ready\":%s,\"clock_origin\":%u,\"acquisition_configured\":%s,\"acquisition_ready\":%s,\"acquisition_storage_failed\":%s,\"acquisition_apply_failed\":%s}\n",observed_partition?"true":"false",observed_mesh_up?"true":"false",observed_mesh_link?"true":"false",(unsigned long long)packets_accepted,(unsigned long long)packets_rejected,(unsigned long long)packets_relayed,(int)node_identity,field_permitted?"true":"false",boot_initialized?"true":"false",(unsigned)clock_origin,acquisition_present?"true":"false",acquisition_allowed()&&read_acquisition_permission()?"true":"false",acquisition_storage_failed?"true":"false",acquisition_apply_failed?"true":"false");
    xSemaphoreGive(mutex);return 0;
}
static int provision_command(int argc,char **argv) {
    if(argc!=9||!token(argv[1])){puts("Usage: gw-provision RUN GROUP EPOCH NODE PEER PEERMAC SPKIHEX PINHEX");return 1;}
    struct provision next={.version=1};size_t keybytes=strlen(argv[7])/2;
    if(!decimal(argv[3],&next.epoch)||keybytes>128||keybytes==0||!unhex(argv[2],next.group,16)||!unhex(argv[4],next.node,16)||
       !unhex(argv[5],next.peer,16)||!unhex(argv[6],next.peer_mac,6)||!unhex(argv[7],next.key,keybytes)||!unhex(argv[8],next.pin,32)){puts("Invalid gateway provisioning fields.");return 1;}
    next.key_bytes=(uint16_t)keybytes;if(!valid(&next)){puts("Gateway authority/key pin or scope rejected.");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);
    bool ok=!persist_failed&&!bench_link_started()&&!ap_touched&&persist(&next);
    if(ok){node_identity=gb_crypto_load(saved.node);refresh_radio_scope();}
    xSemaphoreGive(mutex);puts(ok?"Gateway trust provisioned. Configure AP and trusted time explicitly.":"Provisioning unavailable after radio/AP start or storage failure.");return ok?0:1;
}
static int ap_command(int argc,char **argv) {
    if(argc!=5||!token(argv[1])){puts("Usage: gw-ap RUN LEASE_IPV4 SSIDHEX PASSWORDHEX");return 1;}
    struct in_addr address;size_t ssidbytes=strlen(argv[3])/2,passwordbytes=strlen(argv[4])/2;
    if(inet_pton(AF_INET,argv[2],&address)!=1||!client_ip(lwip_ntohl(address.s_addr))||!ssidbytes||ssidbytes>32||passwordbytes<8||passwordbytes>63){puts("Invalid AP configuration.");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);struct provision next=saved;memset(next.ssid,0,sizeof next.ssid);memset(next.password,0,sizeof next.password);next.lease_ip=lwip_ntohl(address.s_addr);
    bool ok=provisioned&&!persist_failed&&!ap_touched&&!bench_link_started()&&unhex(argv[3],(uint8_t*)next.ssid,ssidbytes)&&unhex(argv[4],(uint8_t*)next.password,passwordbytes)&&
      strlen(next.ssid)==ssidbytes&&strlen(next.password)==passwordbytes&&persist(&next);
    if(ok)refresh_radio_scope();
    xSemaphoreGive(mutex);memset(&next,0,sizeof next);puts(ok?"Private AP configuration saved; forwarding still requires signed grants.":"AP configuration rejected or unavailable.");return ok?0:1;
}
static int time_command(int argc,char **argv) {
    uint64_t seconds;if(argc!=3||!token(argv[1])||!decimal(argv[2],&seconds)||seconds<1767225600ULL||seconds>4102444800ULL){puts("Usage: gw-time RUN TRUSTED_UNIX_SECONDS");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);bool ok=provisioned&&!persist_failed&&!unix_base&&!ap_touched&&!boot_clock_poisoned;
    if(ok){unix_base=seconds;unix_started_ms=mono_ms();clock_origin=AB_CLOCK_USB;if(core_ready)ok=call_core(core_clock);}
    xSemaphoreGive(mutex);puts(ok?"Trusted time established for this boot only.":"Time already set, unavailable or AP already started; reboot required.");return ok?0:1;
}
static int key_command(int argc,char **argv){
    if(argc!=3||!token(argv[1])||(strcmp(argv[2],"init")&&strcmp(argv[2],"public"))){puts("Usage: gw-key RUN init|public (private key is never exported)");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);bool ok=provisioned&&!persist_failed;
    if(!strcmp(argv[2],"init")){
      bool eligible=ok&&!ap_touched&&node_identity==GB_ID_MISSING;ok=eligible&&gb_crypto_create(saved.node);
      if(eligible)node_identity=ok?GB_ID_READY:GB_ID_INVALID;
      if(ok){refresh_radio_scope();configure_boot();}
    }
    uint8_t der[128],pin[32];size_t bytes=0;ok=ok&&node_identity==GB_ID_READY&&gb_crypto_public(der,&bytes,pin);
    printf("\n{\"schema\":\"aumanet.gateway.v2\",\"type\":\"node_public\",\"available\":%s,\"node\":\"",ok?"true":"false");if(ok)print_hex(saved.node,16);
    printf("\",\"run\":\"");if(ok)print_hex(run,16);printf("\",\"spki\":\"");if(ok)print_hex(der,bytes);printf("\",\"pin\":\"");if(ok)print_hex(pin,32);puts("\"}");
    xSemaphoreGive(mutex);return ok?0:1;
}
static int acquisition_command(int argc,char **argv){
    if(argc!=3||!token(argv[1])){puts("Usage: gw-acquisition RUN CHECKED_PHONE_MAC|off (DHCP/local signed control only)");return 1;}
    bool disable=!strcmp(argv[2],"off");struct acquisition_permission next={.version=1};
    if(!disable&&(!unhex(argv[2],next.mac,6)||(next.mac[0]&1)||all_zero(next.mac,6))){puts("Invalid checked phone MAC");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);
    bool ok=provisioned&&!persist_failed&&!field_storage_failed&&node_identity==GB_ID_READY&&configured_ap()&&(disable||!ap_touched||(ap_started&&!unix_base&&field_permitted&&boot_initialized&&!boot_clock_poisoned));
    if(ok&&!disable){next.ip=saved.lease_ip;ok=field_scope(next.scope);}
    if(!ok){memset(&next,0,sizeof next);xSemaphoreGive(mutex);puts("Acquisition setup is unavailable in this node state; the existing permission was preserved.");return 1;}
    atomic_store(&acquisition_runtime_allowed,false);
    nvs_handle_t handle;
    if(ok){esp_err_t e=nvs_open("aumanet_gw1",NVS_READWRITE,&handle);if(e==ESP_OK){
      e=disable?nvs_erase_key(handle,"acquisition"):nvs_set_blob(handle,"acquisition",&next,sizeof next);
      if(disable&&e==ESP_ERR_NVS_NOT_FOUND)e=ESP_OK;
      if(e==ESP_OK)e=nvs_commit(handle);
      if(e==ESP_OK){struct acquisition_permission readback;size_t n=sizeof readback;esp_err_t read=nvs_get_blob(handle,"acquisition",&readback,&n);
        if(disable?read!=ESP_ERR_NVS_NOT_FOUND:read!=ESP_OK||n!=sizeof readback||memcmp(&next,&readback,sizeof next))e=ESP_FAIL;}
      nvs_close(handle);}ok=e==ESP_OK;
    }
    if(ok){acquisition_present=!disable;acquisition_storage_failed=false;if(disable)memset(&acquisition,0,sizeof acquisition);else acquisition=next;}
    else {acquisition_present=false;acquisition_storage_failed=true;}
    if(core_ready){acquisition_apply_failed=!call_core(core_acquisition)||operation_result!=AG_OK;if(acquisition_apply_failed){atomic_store(&acquisition_runtime_allowed,false);ok=false;}}
    memset(&next,0,sizeof next);puts(ok?(disable?"Acquisition permission removed; signed data grants are separate.":"Checked phone acquisition saved; only DHCP and local signed control are permitted without fresh grants."):"Acquisition outcome unavailable; forwarding was not authorized.");
    xSemaphoreGive(mutex);return ok?0:1;
}
static int radio_default_command(int argc,char **argv){
    if(argc!=2||!token(argv[1])){puts("Usage: gw-radio-default RUN (stopped radio only; preserves all other settings)");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);bool ok=provisioned&&node_identity==GB_ID_READY&&bench_link_radio_default();xSemaphoreGive(mutex);
    puts(ok?"Radio selection removed; restart to use the compiled AU default. Keys and other settings were retained.":"Radio selection reset unavailable or unconfirmed; stop RF/reboot into USB recovery before retrying.");return ok?0:1;
}
static int field_command(int argc,char **argv){
    if(argc!=3||!token(argv[1])||(strcmp(argv[2],"on")&&strcmp(argv[2],"off"))){puts("Usage: gw-field RUN on|off (USB authorization for quarantined boot; gw-stop stops current AP)");return 1;}
    uint8_t requested=!strcmp(argv[2],"on"),scope[32]={0};xSemaphoreTake(mutex,portMAX_DELAY);ota_deny();atomic_store(&acquisition_runtime_allowed,false);ar_permit(&radio_control,0);bench_link_radio_permit(0);
    bool ok=provisioned&&!persist_failed&&!field_storage_failed&&(!requested||(saved.epoch<=AB_MAX_SAFE&&configured_ap()&&node_identity==GB_ID_READY&&field_scope(scope)));
    nvs_handle_t handle;
    if(ok){esp_err_t error=nvs_open("aumanet_gw1",NVS_READWRITE,&handle);if(error==ESP_OK){error=nvs_set_u8(handle,"field_boot",requested);if(error==ESP_OK&&!requested){error=nvs_erase_key(handle,"acquisition");if(error==ESP_ERR_NVS_NOT_FOUND)error=ESP_OK;}if(error==ESP_OK)error=nvs_set_blob(handle,"field_scope",scope,32);if(error==ESP_OK)error=nvs_commit(handle);if(error==ESP_OK){uint8_t readback=2,read_scope[32];size_t n=32;if(nvs_get_u8(handle,"field_boot",&readback)!=ESP_OK||readback!=requested||nvs_get_blob(handle,"field_scope",read_scope,&n)!=ESP_OK||n!=32||memcmp(read_scope,scope,32))error=ESP_FAIL;}if(error==ESP_OK&&!requested){size_t remaining=0;if(nvs_get_blob(handle,"acquisition",NULL,&remaining)!=ESP_ERR_NVS_NOT_FOUND)error=ESP_FAIL;}nvs_close(handle);}ok=error==ESP_OK;if(!ok)field_storage_failed=1;}
    field_permitted=ok?requested:0;if(ok){field_storage_failed=0;memcpy(stored_field_scope,scope,32);if(!requested){acquisition_present=false;acquisition_storage_failed=false;memset(&acquisition,0,sizeof acquisition);}}if(core_ready){acquisition_apply_failed=!call_core(core_acquisition)||operation_result!=AG_OK;if(acquisition_apply_failed){atomic_store(&acquisition_runtime_allowed,false);ok=false;field_permitted=0;}}configure_boot();if(boot_initialized)ab_transport_permit(&boot_transport,field_permitted);ab_transport_permit(&signal_transport,field_permitted);ar_permit(&radio_control,field_permitted);bench_link_radio_permit(field_permitted&&!field_storage_failed);
    printf("\n{\"schema\":\"aumanet.gateway.v2\",\"type\":\"field_permission\",\"accepted\":%s,\"enabled\":%s,\"storage_failed\":%s}\n",ok?"true":"false",field_permitted?"true":"false",field_storage_failed?"true":"false");
    xSemaphoreGive(mutex);return ok?0:1;
}
static int grant_command(int argc,char **argv) {
    if(argc!=4||!token(argv[1])){puts("Usage: gw-grant RUN BODYHEX SIGNATUREHEX");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);size_t bytes=strlen(argv[3])/2;operation_result=AG_FORMAT;
    bool ok=core_ready&&ap_started&&bytes>=8&&bytes<=72&&unhex(argv[2],grant_body,sizeof grant_body)&&unhex(argv[3],grant_signature,bytes);
    if(ok){grant_signature_bytes=bytes;ok=call_core(core_grant)&&operation_result==AG_OK;}
    printf("\n{\"schema\":\"aumanet.gateway.v1\",\"type\":\"grant\",\"accepted\":%s,\"result\":%d}\n",ok?"true":"false",ok?0:(int)operation_result);
    xSemaphoreGive(mutex);return ok?0:1;
}
static esp_err_t wait_phone_dhcp_ready(void) {
    uint64_t began=0,now=0;
    if(!phone_handle||!read_monotonic_ms(&began))return ESP_FAIL;
    for(;;){
      esp_netif_dhcp_status_t status=ESP_NETIF_DHCP_INIT;
      esp_err_t error=esp_netif_dhcps_get_status(phone_handle,&status);
      if(error!=ESP_OK)return error;
      if(esp_netif_is_netif_up(phone_handle)&&status==ESP_NETIF_DHCP_STARTED)return ESP_OK;
      if(!read_monotonic_ms(&now)||now<began)return ESP_FAIL;
      if(now-began>=5000)return ESP_ERR_TIMEOUT;
      vTaskDelay(pdMS_TO_TICKS(20));
    }
}
static void receive_grant(const uint8_t *packet,int n,const struct sockaddr_in *source,uint64_t now){
    bool allowed=ab_budget_take(&control_budget,AB_LANE_GRANT,now)&&n>=217&&n<=281&&packet[208]>=8&&packet[208]<=72&&n==209+packet[208]&&
      !memcmp(packet+16,"AUGW1\0\0\0",8)&&!memcmp(packet+32,saved.group,16)&&ag_crypto_verify(saved.key,saved.key_bytes,saved.pin,packet+16,192,packet+209,packet[208]);
    if(allowed&&!memcmp(packet,saved.node,16)){
      memcpy(grant_body,packet+16,192);grant_signature_bytes=packet[208];memcpy(grant_signature,packet+209,grant_signature_bytes);
      if(call_core(core_grant)&&operation_result==AG_OK)packets_accepted++;else packets_rejected++;
    }else if(allowed&&!memcmp(packet,saved.peer,16)&&source->sin_addr.s_addr!=htonl(
#if CONFIG_AUMANET_NODE_B
      0x0a4e0001
#else
      0x0a4e0002
#endif
      )){
      struct sockaddr_in peer={.sin_family=AF_INET,.sin_port=htons(AG_CONTROL_PORT)};
      peer.sin_addr.s_addr=htonl(
#if CONFIG_AUMANET_NODE_B
        0x0a4e0001
#else
        0x0a4e0002
#endif
      );
      if(sendto(control_socket,packet,n,0,(struct sockaddr*)&peer,sizeof peer)==n)packets_relayed++;else packets_rejected++;
    }else packets_rejected++;
}
static void control_task(void *ignored) {
    (void)ignored;
    /* Fixed batch, no allocation or unbounded receive loop. Grants are serviced
     * first and retain their own four-per-second budget under BOOT traffic. */
    struct datagram {uint8_t bytes[512];int length;struct sockaddr_in source;} batch[8];
    for(;;){
      unsigned count=0;
      for(;count<8;count++){
        socklen_t address_bytes=sizeof batch[count].source;
        int n=recvfrom(control_socket,batch[count].bytes,sizeof batch[count].bytes,MSG_DONTWAIT,(struct sockaddr*)&batch[count].source,&address_bytes);
        if(n<0)break;
        batch[count].length=address_bytes==sizeof(struct sockaddr_in)&&batch[count].source.sin_family==AF_INET?n:0;
      }
      xSemaphoreTake(mutex,portMAX_DELAY);
      if(core_ready)call_core(core_clock);
      bool ota_live=ota_generation()!=0&&ap_started&&core_ready&&provisioned&&!persist_failed&&field_permitted&&!field_storage_failed&&boot_initialized&&unix_base&&clock_origin!=AB_CLOCK_UNSET&&!boot_clock_poisoned&&node_identity==GB_ID_READY;atomic_store(&ota_allowed,ota_live);atomic_store(&ota_healthy,ota_live&&bench_link_started());
      if(ap_started&&core_ready)for(unsigned pass=0;pass<2;pass++)for(unsigned i=0;i<count;i++){
        struct datagram *d=&batch[i];uint64_t now=0;
        if(d->length<24||d->length>AB_FRAME_MAX||!read_monotonic_ms(&now))continue;
        bool grant=!memcmp(d->bytes+16,"AUGW1\0\0\0",8);
        if(pass==0){if(grant)receive_grant(d->bytes,d->length,&d->source,now);continue;}
        if(grant||!boot_initialized||!field_permitted||field_storage_failed)continue;
        struct ab_view view;
        if(ar_frame_read(d->bytes,(size_t)d->length,&view)){
          if(!ab_budget_take(&radio_budget,AB_LANE_SIGNAL,now))continue;
          uint8_t reply[AB_FRAME_MAX];size_t written=0;uint32_t destination=0;uint16_t port=0;
          if(ar_transport_receive(&radio_control,d->bytes,(size_t)d->length,lwip_ntohl(d->source.sin_addr.s_addr),lwip_ntohs(d->source.sin_port),reply,&written,&destination,&port)){
            struct sockaddr_in endpoint={.sin_family=AF_INET,.sin_port=htons(port),.sin_addr={.s_addr=htonl(destination)}};
            if(sendto(control_socket,reply,written,0,(struct sockaddr*)&endpoint,sizeof endpoint)==(int)written)packets_relayed++;else packets_rejected++;
          }else packets_rejected++;
          continue;
        }
        if(!ab_frame_read(d->bytes,(size_t)d->length,&view))continue;
        bool signal=view.kind==AB_SIGNAL_QUERY||view.kind==AB_SIGNAL_REPORT;
        enum ab_lane lane=signal?AB_LANE_SIGNAL:view.kind==AB_QUERY||view.kind==AB_TIME?AB_LANE_REQUEST:AB_LANE_RESPONSE;
        if(!ab_budget_take(&control_budget,lane,now))continue;
        uint8_t reply[AB_FRAME_MAX];size_t reply_bytes=0;uint32_t destination=0;uint16_t port=0;
        if(ab_transport_receive(signal?&signal_transport:&boot_transport,d->bytes,(size_t)d->length,lwip_ntohl(d->source.sin_addr.s_addr),lwip_ntohs(d->source.sin_port),reply,&reply_bytes,&destination,&port)){
          struct sockaddr_in endpoint={.sin_family=AF_INET,.sin_port=htons(port),.sin_addr={.s_addr=htonl(destination)}};
          if(sendto(control_socket,reply,reply_bytes,0,(struct sockaddr*)&endpoint,sizeof endpoint)==(int)reply_bytes)packets_relayed++;else packets_rejected++;
        }else packets_rejected++;
      }
      xSemaphoreGive(mutex);vTaskDelay(pdMS_TO_TICKS(count?10:100));
    }
}
/* Caller owns mutex. Quarantine is authorized only by the separately committed
 * physical USB field scope; it enables control, never DHCP/app-data authority. */
static int start_locked(bool quarantine) {
    if(!core_ready||(!unix_base&&!quarantine)||persist_failed||!configured_ap()||ap_touched||!bench_link_started()||
       (quarantine&&(!field_permitted||field_storage_failed||node_identity!=GB_ID_READY||!boot_initialized))){
      puts("Provision authority/AP/time, start radio, then start gateway once per boot.");return 1;
    }
    ap_touched=true;esp_err_t error=ESP_OK;const char *stage="netif_create";
#define GW_START_STEP(label,call) do{stage=(label);error=(call);if(error!=ESP_OK)goto failed;}while(0)
    /* HaLow already owns WIFI_STA_DEF. The native AP has its own unique key. */
    esp_netif_inherent_config_t inherent=ESP_NETIF_INHERENT_DEFAULT_WIFI_AP();
    inherent.if_key="AUMANET_PHONE_AP";inherent.if_desc="AuMaNET phone gateway";inherent.route_prio=0;
    esp_netif_config_t config={.base=&inherent,.stack=ESP_NETIF_NETSTACK_DEFAULT_WIFI_AP};
    phone_handle=esp_netif_new(&config);if(!phone_handle){error=ESP_ERR_NO_MEM;goto failed;}
    GW_START_STEP("wifi_attach",esp_netif_attach_wifi_ap(phone_handle));
    GW_START_STEP("wifi_handlers",esp_wifi_set_default_wifi_ap_handlers());
    esp_netif_ip_info_t ip={0};ip.ip.addr=htonl(AG_GATEWAY);ip.netmask.addr=htonl(0xffffff00UL);ip.gw.addr=htonl(AG_GATEWAY);
    stage="dhcp_stop";error=esp_netif_dhcps_stop(phone_handle);if(error!=ESP_OK&&error!=ESP_ERR_ESP_NETIF_DHCP_ALREADY_STOPPED)goto failed;
    GW_START_STEP("netif_address",esp_netif_set_ip_info(phone_handle,&ip));
    dhcps_lease_t lease={.enable=true};lease.start_ip.addr=htonl(saved.lease_ip);lease.end_ip.addr=htonl(saved.lease_ip);
    GW_START_STEP("dhcp_exact_pool",esp_netif_dhcps_option(phone_handle,ESP_NETIF_OP_SET,ESP_NETIF_REQUESTED_IP_ADDRESS,&lease,sizeof lease));
    /* No DNS server is advertised while the real bounded proxy is absent. */
    uint8_t offer_dns=0;GW_START_STEP("dhcp_dns_off",esp_netif_dhcps_option(phone_handle,ESP_NETIF_OP_SET,ESP_NETIF_DOMAIN_NAME_SERVER,&offer_dns,sizeof offer_dns));
    wifi_init_config_t wifi=WIFI_INIT_CONFIG_DEFAULT();GW_START_STEP("wifi_init",esp_wifi_init(&wifi));
    GW_START_STEP("wifi_storage",esp_wifi_set_storage(WIFI_STORAGE_RAM));
    wifi_config_t ap={0};memcpy(ap.ap.ssid,saved.ssid,strlen(saved.ssid));ap.ap.ssid_len=(uint8_t)strlen(saved.ssid);
    memcpy(ap.ap.password,saved.password,strlen(saved.password));ap.ap.channel=6;ap.ap.max_connection=1;ap.ap.authmode=WIFI_AUTH_WPA2_PSK;ap.ap.pmf_cfg.capable=true;
    GW_START_STEP("wifi_mode",esp_wifi_set_mode(WIFI_MODE_AP));
    GW_START_STEP("wifi_configuration",esp_wifi_set_config(WIFI_IF_AP,&ap));
    memset(&ap,0,sizeof ap);
    phone_impl=esp_netif_get_netif_impl(phone_handle);ap_started=true;
    stage="gateway_binding";if(!call_core(core_configure)||operation_result!=AG_OK){error=ESP_FAIL;goto failed;}
    /* Stop-for-configuration leaves STOPPED. On a down AP, explicit Start
     * re-arms INIT so the later AP-start event creates the real UDP67 server. */
    GW_START_STEP("dhcp_arm",esp_netif_dhcps_start(phone_handle));
    GW_START_STEP("wifi_start",esp_wifi_start());
    GW_START_STEP("dhcp_ready",wait_phone_dhcp_ready());
    control_socket=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);
    struct sockaddr_in endpoint={.sin_family=AF_INET,.sin_port=htons(AG_CONTROL_PORT),.sin_addr={.s_addr=INADDR_ANY}};
    stage="control_bind";if(control_socket<0||bind(control_socket,(struct sockaddr*)&endpoint,sizeof endpoint)<0){error=ESP_FAIL;goto failed;}
    stage="control_task";if(xTaskCreate(control_task,"gw_signed_ctl",12288,NULL,4,NULL)!=pdPASS){error=ESP_ERR_NO_MEM;goto failed;}
    struct gateway_ota_config update={.epoch=saved.epoch,.phone_ip=saved.lease_ip,.owner_bytes=saved.key_bytes,.current=ota_current,.healthy=ota_health,.generation=ota_generation};
    memcpy(update.node,saved.node,16);memcpy(update.peer,saved.peer,16);memcpy(update.group,saved.group,16);memcpy(update.owner_pin,saved.pin,32);memcpy(update.owner_der,saved.key,saved.key_bytes);memcpy(update.run,run,16);
#if CONFIG_AUMANET_NODE_B
    update.role=2;update.peer_ip=0x0a4e0001;memcpy(update.relay,saved.peer,16);
#else
    update.role=1;update.peer_ip=0x0a4e0002;memcpy(update.relay,saved.node,16);
#endif
    if(!gateway_ota_start(&update))puts("Node OTA service unavailable; existing gateway remains active.");
    puts("Gateway AP started. Checked acquisition may obtain DHCP/local control; data requires fresh signed time and bindings.");return 0;
failed:
    ap_started=false;if(control_socket>=0){close(control_socket);control_socket=-1;}
    if(phone_handle)esp_netif_dhcps_stop(phone_handle);
    esp_wifi_stop();if(mesh_impl)call_core(core_configure);
    printf("Gateway start failed at %s (%d, %s); reboot before retry.\n",stage,(int)error,esp_err_to_name(error));return 1;
#undef GW_START_STEP
}
static int start_command(int argc,char **argv) {
    if(argc!=2||!token(argv[1])){puts("Usage: gw-start RUN");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);int result=start_locked(false);xSemaphoreGive(mutex);return result;
}
void aumanet_gateway_field_resume(void){
    xSemaphoreTake(mutex,portMAX_DELAY);
    /* Existing radio-autostart permission is independent and must already have
     * started the checked radio. This path never enables RF permission itself. */
    if(field_permitted&&!field_storage_failed&&bench_link_started()){
      configure_boot();if(start_locked(true))puts("Authorized field AP resume failed closed; USB remains available.");
    }
    xSemaphoreGive(mutex);
}
static int stop_command(int argc,char **argv) {
    if(argc!=2||!token(argv[1])){puts("Usage: gw-stop RUN");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);ota_deny();ap_started=false;
    if(mesh_impl)call_core(core_configure);
    esp_wifi_stop();xSemaphoreGive(mutex);
    puts("Gateway grants invalidated and phone AP stopped. Reboot before another start.");return 0;
}
static int path_command(int argc,char **argv) {
    if(argc!=3||!token(argv[1])||(strcmp(argv[2],"down")&&strcmp(argv[2],"up"))){puts("Usage: gw-path RUN down|up (HaLow IP interface partition; RF stays on)");return 1;}
    xSemaphoreTake(mutex,portMAX_DELAY);operation_result=AG_UNAVAILABLE;requested_partition=!strcmp(argv[2],"down");
    bool ok=provisioned&&!persist_failed&&core_ready&&ap_started&&mesh_impl&&call_core(core_path)&&operation_result==AG_OK;
    if(!ok&&mesh_impl)call_core(core_path_status);
    printf("\n{\"schema\":\"aumanet.gateway.v1\",\"type\":\"path_partition\",\"accepted\":%s,\"result\":%d,\"mode\":\"interface_partition\",\"rf_disabled\":false,\"paused\":%s,\"mesh_netif_up\":%s,\"mesh_link_up\":%s,\"ap_started\":%s}\n",ok?"true":"false",(int)operation_result,observed_partition?"true":"false",observed_mesh_up?"true":"false",observed_mesh_link?"true":"false",ap_started?"true":"false");
    xSemaphoreGive(mutex);return ok?0:1;
}
static int stations_command(int argc,char **argv) {
    (void)argc;(void)argv;wifi_sta_list_t list={0};xSemaphoreTake(mutex,portMAX_DELAY);
    esp_err_t error=ap_started?esp_wifi_ap_get_sta_list(&list):ESP_ERR_INVALID_STATE;
    printf("\n{\"schema\":\"aumanet.gateway.v1\",\"type\":\"observed_stations\",\"available\":%s,\"count\":%u,\"macs\":[",error==ESP_OK?"true":"false",error==ESP_OK?list.num:0);
    if(error==ESP_OK)for(unsigned i=0;i<list.num;i++){if(i)printf(",");printf("\"");print_hex(list.sta[i].mac,6);printf("\"");}
    puts("],\"authority\":false}");xSemaphoreGive(mutex);return error==ESP_OK?0:1;
}
void aumanet_gateway_register_commands(void) {
    const esp_console_cmd_t commands[]={
      {.command="gw-update-status",.help="Read-only installed partition, image and OTA boot/rollback state",.func=gateway_ota_usb_status},
      {.command="gw-status",.help="Experimental gateway status and current boot nonce",.func=status_command},
      {.command="gw-provision",.help="Physically provision pinned public authority and peer",.func=provision_command},
      {.command="gw-ap",.help="Physically configure private AP and exact lease IP",.func=ap_command},
      {.command="gw-time",.help="Supply trusted Unix time once for this boot",.func=time_command},
      {.command="gw-key",.help="Physical USB only: initialize/export pinned node public identity",.func=key_command},
      {.command="gw-acquisition",.help="Physical USB checked MAC: independent DHCP/local-control permission",.func=acquisition_command},
      {.command="gw-field",.help="Physical USB only: authorize quarantined AP/control on later boots",.func=field_command},
      {.command="gw-radio-default",.help="Physical USB stopped-radio recovery: reset only saved radio selection",.func=radio_default_command},
      {.command="gw-start",.help="Explicitly start signed gateway AP after radio",.func=start_command},
      {.command="gw-grant",.help="Admit one exact signed, expiring grant",.func=grant_command},
      {.command="gw-stop",.help="Invalidate grants and stop the phone AP",.func=stop_command},
      {.command="gw-path",.help="Physical USB only: down|up partition of HaLow IP interface; RF stays on",.func=path_command},
      {.command="gw-stations",.help="Observed station MACs, never authorization",.func=stations_command}
    };
    for(size_t i=0;i<sizeof commands/sizeof commands[0];i++)ESP_ERROR_CHECK(esp_console_cmd_register(&commands[i]));
}
