/* Compile and exercise the production C profile implementation against a
 * fault-injecting NVS adapter. No hardware, crypto substitute or model copy. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include "nvs.h"
#include "esp_console.h"
static const uint8_t physical_mac[6]={0x1c,0xdb,0xd4,0x75,0x39,0xc0};
static uint8_t storage[16],staged[16];
static size_t storage_bytes;
static unsigned writes,commits,commands;
static int write_failure,commit_failure,readback_failure,unavailable,was_committed;
static bool touched,started;
esp_err_t esp_read_mac(uint8_t *out,int type){(void)type;memcpy(out,physical_mac,6);return ESP_OK;}
esp_err_t nvs_open(const char *name,int mode,nvs_handle_t *out){
    assert(!strcmp(name,"amn_profile1"));
    if(unavailable)return ESP_FAIL;
    if(mode==NVS_READONLY&&!storage_bytes)return ESP_ERR_NVS_NOT_FOUND;
    *out=1;return ESP_OK;
}
esp_err_t nvs_get_blob(nvs_handle_t h,const char *key,void *out,size_t *size){
    assert(h==1&&!strcmp(key,"profile"));
    if(readback_failure&&was_committed)return ESP_FAIL;
    if(!storage_bytes)return ESP_ERR_NVS_NOT_FOUND;
    if(*size<storage_bytes)return ESP_FAIL;
    memcpy(out,storage,storage_bytes);*size=storage_bytes;return ESP_OK;
}
esp_err_t nvs_set_blob(nvs_handle_t h,const char *key,const void *in,size_t size){
    assert(h==1&&!strcmp(key,"profile")&&size==16);writes++;
    if(write_failure)return ESP_FAIL;
    memcpy(staged,in,16);return ESP_OK;
}
esp_err_t nvs_commit(nvs_handle_t h){assert(h==1);commits++;memcpy(storage,staged,16);storage_bytes=16;was_committed=1;return commit_failure?ESP_FAIL:ESP_OK;}
void nvs_close(nvs_handle_t h){assert(h==1);}
esp_err_t esp_console_cmd_register(const esp_console_cmd_t *cmd){assert(cmd->func&&cmd->command);commands++;return ESP_OK;}
bool bench_link_touched(void){return touched;}
bool bench_link_started(void){return started;}
#include "../../firmware/main/node_profile.c"

static void boot(void){loaded=false;pending=false;active_role=0;state=EMPTY;memset(persisted,0,sizeof persisted);node_profile_load();}
static void fresh(void){storage_bytes=0;writes=commits=0;write_failure=commit_failure=readback_failure=unavailable=was_committed=0;touched=started=false;boot();}
static int setup(const char *role,bool init){char *argv[]={"node-profile-set","1cdbd47539c0",(char *)role};return save(3,argv,init);}
int main(void){
    fresh();assert(!node_profile_ready()&&node_profile_role()==0&&state==EMPTY&&writes==0);
    node_profile_register_commands();assert(commands==3);
    assert(setup("B",true)==0&&pending&&!node_profile_ready()&&active_role==0&&writes==1&&commits==1);
    assert(!memcmp(storage,"AMNP1\0\0\0",8)&&storage[8]==2&&storage[9]==0&&!memcmp(storage+10,physical_mac,6));
    boot();assert(node_profile_ready()&&node_profile_station()&&node_profile_role()==2&&node_profile_peer_ip()==0x0a4e0001);
    assert(!strcmp(node_profile_local_address(),"10.78.0.2"));
    assert(setup("B",true)==0&&writes==1&&!pending);
    assert(setup("A",true)!=0&&writes==1&&node_profile_station());
    touched=true;assert(setup("A",false)!=0&&writes==1);touched=false;
    started=true;assert(setup("A",false)!=0&&writes==1);started=false;
    char *wrong[]={"node-profile-init","000000000000","A"};assert(save(3,wrong,true)!=0&&writes==1);
    assert(setup("A",false)==0&&pending&&active_role==2&&!node_profile_ready());
    boot();assert(node_profile_ready()&&!node_profile_station()&&node_profile_role()==1&&node_profile_peer_ip()==0x0a4e0002);
    for(unsigned i=0;i<16;i++){
      fresh();assert(setup("A",true)==0);storage[i]^=0x80;boot();assert(state==INVALID&&!node_profile_ready());
      unsigned prior=writes;assert(setup("A",false)!=0&&writes==prior);
    }
    fresh();assert(setup("A",true)==0);storage_bytes=15;boot();assert(state==INVALID);
    fresh();write_failure=1;assert(setup("A",true)!=0&&state==UNAVAILABLE&&!node_profile_ready());
    assert(setup("B",false)!=0&&writes==1);
    fresh();commit_failure=1;assert(setup("A",true)!=0&&state==UNAVAILABLE&&!node_profile_ready());
    fresh();readback_failure=1;assert(setup("B",true)!=0&&state==UNAVAILABLE&&!node_profile_ready());
    fresh();unavailable=1;boot();assert(state==UNAVAILABLE&&!node_profile_ready());
    puts("profile C host tests: PASS (empty, role changes, target/RF guards, 16 corruptions, short record, write/commit/readback faults)");
    return 0;
}
