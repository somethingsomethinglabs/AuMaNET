#include <assert.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "nvs.h"
#include "esp_console.h"
static const uint8_t mac[6]={1,2,3,4,5,6};
static uint8_t storage[16],stage[16];
static size_t bytes;
static unsigned writes,commits,commands,checks;
static bool touched,started,resume;
static int open_fault,write_fault,commit_fault,read_fault,read_mismatch,committed;
#define CHECK(x) do { ++checks; assert(x); } while(0)
esp_err_t esp_read_mac(uint8_t *out,int type){(void)type;memcpy(out,mac,6);return ESP_OK;}
esp_err_t nvs_open(const char *name,int mode,nvs_handle_t *h){
    CHECK(!strcmp(name,"amn_relay1"));if(open_fault)return ESP_FAIL;
    if(mode==NVS_READONLY&&!bytes)return ESP_ERR_NVS_NOT_FOUND;*h=1;return ESP_OK;
}
esp_err_t nvs_get_blob(nvs_handle_t h,const char *key,void *out,size_t *n){
    CHECK(h==1&&!strcmp(key,"mode"));if(read_fault&&committed)return ESP_FAIL;
    if(!bytes)return ESP_ERR_NVS_NOT_FOUND;if(*n<bytes)return ESP_FAIL;
    memcpy(out,storage,bytes);*n=bytes;
    if(read_mismatch&&committed)((uint8_t *)out)[9]=1;return ESP_OK;
}
esp_err_t nvs_set_blob(nvs_handle_t h,const char *key,const void *in,size_t n){
    CHECK(h==1&&!strcmp(key,"mode")&&n==16);writes++;if(write_fault)return ESP_FAIL;
    memcpy(stage,in,n);return ESP_OK;
}
esp_err_t nvs_commit(nvs_handle_t h){CHECK(h==1);commits++;memcpy(storage,stage,16);bytes=16;committed=1;return commit_fault?ESP_FAIL:ESP_OK;}
void nvs_close(nvs_handle_t h){CHECK(h==1);}
esp_err_t esp_console_cmd_register(const esp_console_cmd_t *c){CHECK(c->func&&c->command);commands++;return ESP_OK;}
bool bench_link_touched(void){return touched;}
bool bench_link_started(void){return started;}
#include "../../firmware/main/relay_mode.c"
static bool autorun(void){return resume;}
static void boot(void){loaded=pending=active=false;state=EMPTY;memset(persisted,0,16);relay_mode_load();}
static void fresh(void){bytes=writes=commits=0;touched=started=resume=false;
    open_fault=write_fault=commit_fault=read_fault=read_mismatch=committed=0;boot();autostart=autorun;}
static int set(const char *mode){char *a[]={"relay-mode-set","010203040506",(char *)mode};return set_cmd(3,a);}
int main(void){
    fresh();CHECK(relay_mode_ready()&&!relay_mode_enabled()&&!writes);
    relay_mode_register(autorun);CHECK(commands==2);
    CHECK(set("off")==0&&!writes&&!pending);
#if CONFIG_AUMANET_UPSTREAM_RELAY
    resume=true;CHECK(set("on")!=0&&!writes);resume=false;
    touched=true;CHECK(set("on")!=0&&!writes);touched=false;
    started=true;CHECK(set("on")!=0&&!writes);started=false;
    char *bad[]={"relay-mode-set","000000000000","on"};CHECK(set_cmd(3,bad)!=0&&!writes);
    CHECK(set("bad")!=0&&!writes);
    CHECK(set("on")==0&&pending&&!relay_mode_ready()&&!active);
    CHECK(!memcmp(storage,"AMNR1\0\0\0",8)&&storage[8]==1&&!storage[9]&&!memcmp(storage+10,mac,6));
    boot();CHECK(relay_mode_ready()&&active);CHECK(set("on")==0&&!pending&&writes==1);
    CHECK(set("off")==0&&pending&&active&&!relay_mode_ready());
    boot();CHECK(relay_mode_ready()&&!active);
    for(unsigned i=0;i<16;i++){
        fresh();CHECK(set("on")==0);storage[i]^=0x80;boot();
        CHECK(state==INVALID&&!relay_mode_ready());unsigned before=writes;
        CHECK(set("off")!=0&&writes==before);
    }
    fresh();CHECK(set("on")==0);bytes=15;boot();CHECK(!relay_mode_ready());
    fresh();write_fault=1;CHECK(set("on")!=0&&state==UNAVAILABLE&&!relay_mode_ready());
    fresh();commit_fault=1;CHECK(set("on")!=0&&state==UNAVAILABLE&&!relay_mode_ready());
    fresh();read_fault=1;CHECK(set("on")!=0&&state==UNAVAILABLE&&!relay_mode_ready());
    fresh();read_mismatch=1;CHECK(set("on")!=0&&state==UNAVAILABLE&&!relay_mode_ready());
#else
    CHECK(set("on")!=0&&!writes);
    memcpy(storage,magic,8);storage[8]=1;storage[9]=0;memcpy(storage+10,mac,6);bytes=16;
    boot();CHECK(active&&!relay_mode_ready());
    CHECK(set("off")==0&&pending&&!relay_mode_ready());boot();CHECK(relay_mode_ready()&&!active);
#endif
    fresh();open_fault=1;boot();CHECK(state==UNAVAILABLE&&!relay_mode_ready());
    printf("relay mode C: %u assertions passed (supported=%d)\n",checks,CONFIG_AUMANET_UPSTREAM_RELAY);return 0;
}
