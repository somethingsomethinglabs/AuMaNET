/* Actual NVS/USB migration methods with explicit transactional fault adapter. */
#include "aumanet_gateway.h"
#include <stdbool.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
extern int host_sha(const uint8_t*,size_t,uint8_t[32]);
typedef int esp_err_t;typedef int nvs_handle_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND -2
#define NVS_READWRITE 1
#define GB_ID_READY 1
#define portMAX_DELAY 0
#define xSemaphoreTake(a,b) ((void)(a),(void)(b))
#define xSemaphoreGive(a) ((void)(a))
static struct {uint8_t group[16],node[16],peer[16],pin[32],key[128];size_t key_bytes;uint64_t epoch;} saved;
static struct al_record lan_saved,disk,staged;static struct al_grant lan_staged[2];static uint8_t lan_stage_mask;
static bool provisioned=true,persist_failed,lan_failed,ap_touched,lan_present,field_permitted=true,core_ready,radio_touched;
static int mutex,node_identity=GB_ID_READY,fault;static bool disk_present,committed;static uint64_t unix_base=1,unix_started_ms=1000;
static _Atomic bool acquisition_runtime_allowed=true;static enum ag_result operation_result;
static bool bench_link_touched(void){return radio_touched;}static void ota_deny(void){}static uint64_t mono_ms(void){return 1000;}
static bool exact_hardware(const char*s){return !strcmp(s,"checked-hardware");}static bool token(const char*s){return !strcmp(s,"checked-run");}
static bool decimal(const char*s,uint64_t*out){char*end;*out=strtoull(s,&end,10);return *s&&!*end&&s[0]>='0'&&s[0]<='9';}
static bool unhex(const char*s,uint8_t*out,size_t n){if(strlen(s)!=n*2)return false;for(size_t i=0;i<n;i++){char b[3]={s[2*i],s[2*i+1],0};char*end;unsigned long v=strtoul(b,&end,16);if(*end)return false;out[i]=(uint8_t)v;}return true;}
static int all_zero(const uint8_t*p,size_t n){while(n--)if(*p++)return 0;return 1;}
static void core_configure(void*p){(void)p;operation_result=AG_OK;}static bool call_core(void(*f)(void*)){f(NULL);return true;}static void refresh_radio_scope(void){}
static esp_err_t nvs_open(const char*space,int mode,nvs_handle_t*h){(void)space;(void)mode;*h=1;committed=false;return ESP_OK;}
static esp_err_t nvs_get_blob(nvs_handle_t h,const char*key,void*out,size_t*n){(void)h;assert(!strcmp(key,"routed_lan"));if(!disk_present)return ESP_ERR_NVS_NOT_FOUND;assert(*n>=sizeof disk);memcpy(out,&disk,sizeof disk);*n=sizeof disk;if(committed&&fault==3)((struct al_record*)out)->revision++;return ESP_OK;}
static esp_err_t nvs_set_blob(nvs_handle_t h,const char*key,const void*data,size_t n){(void)h;assert(!strcmp(key,"routed_lan")&&n==sizeof staged);memcpy(&staged,data,n);return ESP_OK;}
static esp_err_t nvs_commit(nvs_handle_t h){(void)h;if(fault==1)return ESP_FAIL;disk=staged;disk_present=true;committed=true;return fault==2?ESP_FAIL:ESP_OK;}
static void nvs_close(nvs_handle_t h){(void)h;}
#include "gateway_lan.inc"
static size_t readfile(const char*dir,const char*name,uint8_t*out,size_t max){char path[2048];snprintf(path,sizeof path,"%s/%s",dir,name);FILE*f=fopen(path,"rb");assert(f);size_t n=fread(out,1,max,f);assert(!ferror(f)&&fgetc(f)==EOF);fclose(f);return n;}
int main(int argc,char**argv){
 assert(argc==2);memset(saved.group,0x11,16);memset(saved.node,0xaa,16);memset(saved.peer,0xbb,16);saved.epoch=1;saved.key_bytes=readfile(argv[1],"owner.der",saved.key,128);assert(host_sha(saved.key,saved.key_bytes,saved.pin));
 for(unsigned i=0;i<2;i++){assert(readfile(argv[1],i?"lan-peer.bin":"lan-local.bin",lan_staged[i].body,128)==128);lan_staged[i].signature_bytes=readfile(argv[1],i?"lan-peer.sig":"lan-local.sig",lan_staged[i].signature,72);}lan_stage_mask=3;
 char owner[20];snprintf(owner,sizeof owner,"%u",0x0a4d0110u);char* migration[]={"gw-lan-migrate","checked-hardware","checked-run","migrate-v1",owner};
 assert(lan_migrate_command(5,migration)==0);assert(lan_present&&disk_present&&lan_saved.revision==1&&lan_saved.client_count==0&&!field_permitted);struct al_record original=lan_saved;assert(lan_migrate_command(5,migration)!=0);assert(!memcmp(&original,&lan_saved,sizeof original));
 char*client[]={"gw-client","checked-hardware","checked-run","1",owner,"020000000001"};assert(lan_client_command(6,client)==0);assert(lan_saved.client_count==1&&lan_saved.revision==2);assert(lan_client_command(6,client)!=0);
 client[3]="2";client[5]="020000000099";assert(lan_client_command(6,client)!=0);assert(lan_saved.clients[0].mac[5]==1);
 char second[20];snprintf(second,sizeof second,"%u",0x0a4d0111u);client[4]=second;client[5]="020000000002";assert(lan_client_command(6,client)==0);assert(lan_saved.client_count==2&&lan_saved.revision==3);
 original=lan_saved;client[3]="3";client[5]="off";ap_touched=true;assert(lan_client_command(6,client)!=0);assert(!memcmp(&original,&lan_saved,sizeof original));ap_touched=false;
 for(int mode=1;mode<=3;mode++){disk=original;lan_saved=original;lan_failed=false;field_permitted=true;atomic_store(&acquisition_runtime_allowed,true);fault=mode;struct al_record next=original;next.revision++;assert(!lan_commit_record(&next));assert(lan_failed&&!field_permitted&&!atomic_load(&acquisition_runtime_allowed));assert(!memcmp(&lan_saved,&original,sizeof original));assert(disk.revision==(mode==1?original.revision:next.revision));assert(!lan_commit_record(&next));}
 fault=0;lan_failed=false;disk=original;lan_saved=original;client[3]="3";assert(lan_client_command(6,client)==0);assert(lan_saved.client_count==1&&lan_saved.clients[0].mac[5]==1);assert(lan_saved.revision==4);
 puts("{\"status\":\"pass\",\"physical\":false,\"scope\":\"exact production NVS migration/client methods, real signatures, transactional fault adapters\"}");return 0;
}
