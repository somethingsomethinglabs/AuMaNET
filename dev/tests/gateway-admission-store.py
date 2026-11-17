"""Run extracted production USB admission/NVS methods with fault adapters.

No devices. Hash/key checks are declared adapters; real ESP crypto is separate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zig',type=Path,default=Path.home()/'.codex/tools/aumanet-host-cc/ziglang/zig.exe')
parser.add_argument('--output',type=Path,default=Path('dev/artifacts/gateway-admission-store'))
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
source=root/'dev/firmware/main/gateway_main.c'
text=source.read_text()
def extract(signature):
    start=text.index(signature);opening=text.index('{',start);depth=0
    for end in range(opening,len(text)):
        if text[end]=='{':depth+=1
        elif text[end]=='}':
            depth-=1
            if not depth:return text[start:end+1]
    raise ValueError('Unclosed '+signature)
def structure(signature):
    start=text.index(signature);return text[start:text.index('};',start)+2]
prefix=r'''
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdatomic.h>
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND 1
#define ESP_MAC_WIFI_STA 0
#define NVS_READONLY 0
#define NVS_READWRITE 1
#define AB_MAX_SAFE 9007199254740991ULL
#define GB_ID_READY 1
#define portMAX_DELAY 0
typedef int esp_err_t;
typedef int nvs_handle_t;
static unsigned assertions,cases;
#define CHECK(c) do{assertions++;if(!(c)){fprintf(stderr,"FAIL %d %s\n",__LINE__,#c);exit(1);}}while(0)
'''
prefix+=structure('struct provision {')+'\n'+structure('struct control_ingress_record {')+r'''
static struct provision saved;
static struct control_ingress_record ingress_saved;
static bool provisioned,persist_failed,ingress_ready,ingress_failed,ap_touched,rf_touched,acquisition_present;
static unsigned field_permitted,mutex,node_identity,write_calls;
static uint8_t run[16]={1};
static bool last_accepted;
static int fault;
static bool committed;
static bool lan_present,lan_failed;
static struct {uint8_t opaque[128];} lan_saved; /* Unused routed record adapter. */
static _Atomic bool acquisition_runtime_allowed;
static uint8_t stored_field_scope[32];
static struct {uint8_t bytes[64];} acquisition;
struct entry {bool present;size_t size;uint8_t bytes[1024];};
static struct entry durable_provision,durable_ingress,work_provision,work_ingress,work_scope;
static int nvs_open(const char *name,int mode,nvs_handle_t *handle){(void)name;*handle=mode;if(mode==NVS_READWRITE){work_provision=durable_provision;work_ingress=durable_ingress;}return ESP_OK;}
static void nvs_close(nvs_handle_t handle){(void)handle;}
static int nvs_get_blob(nvs_handle_t h,const char *key,void *out,size_t *n){
    struct entry *entry=!strcmp(key,"provision")?(h==NVS_READWRITE?&work_provision:&durable_provision):(h==NVS_READWRITE?&work_ingress:&durable_ingress);
    if(!entry->present)return ESP_ERR_NVS_NOT_FOUND;
    if(fault==3&&committed&&out)return ESP_FAIL;
    if(!out){*n=entry->size;return ESP_OK;}
    if(*n<entry->size)return ESP_FAIL;
    memcpy(out,entry->bytes,entry->size);*n=entry->size;return ESP_OK;
}
static int nvs_set_blob(nvs_handle_t h,const char *key,const void *p,size_t n){(void)h;write_calls++;
    struct entry *entry=!strcmp(key,"provision")?&work_provision:!strcmp(key,"field_scope")?&work_scope:&work_ingress;
    entry->present=true;entry->size=n;memcpy(entry->bytes,p,n);return ESP_OK;}
static int nvs_set_u8(nvs_handle_t h,const char *key,uint8_t v){(void)h;(void)key;(void)v;return ESP_OK;}
static int nvs_erase_key(nvs_handle_t h,const char *key){(void)h;(void)key;return ESP_OK;}
static int nvs_commit(nvs_handle_t h){(void)h;if(fault==1)return ESP_FAIL;
    durable_provision=work_provision;durable_ingress=work_ingress;committed=true;return fault==2?ESP_FAIL:ESP_OK;}
static int gb_crypto_hash(const uint8_t *p,size_t n,uint8_t out[32]){memset(out,0,32);for(size_t i=0;i<n;i++)out[i%32]^=(uint8_t)(p[i]+i);return 1;}
static int ag_crypto_key_valid(const uint8_t *key,size_t n,const uint8_t pin[32]){return n==1&&key[0]==0x42&&pin[0]==0x55;}
static int gb_crypto_load(const uint8_t id[16]){(void)id;return 1;}
static int gb_crypto_public(uint8_t *der,size_t *n,uint8_t pin[32]){der[0]=0x42;*n=1;memset(pin,0x55,32);return 1;}
static bool gateway_control_ingress(uint8_t out[16]);
static void refresh_radio_scope(void){}
static int bench_link_touched(void){return rf_touched;}
static void xSemaphoreTake(unsigned m,int wait){(void)m;(void)wait;}
static void xSemaphoreGive(unsigned m){(void)m;}
static void ota_deny(void){}
static int esp_read_mac(uint8_t out[6],int type){(void)type;const uint8_t value[6]={0x1c,0xdb,0xd4,0x75,0x39,0xc0};memcpy(out,value,6);return ESP_OK;}
static void admission_emit(bool accepted){last_accepted=accepted;}
'''
names=['static int field_scope_value(','static int field_scope(','static int all_zero(','static int hex_digit(','static bool unhex(','static bool token(',
       'static bool decimal(','static bool valid(','static bool ingress_valid(',
       'static bool gateway_control_ingress(uint8_t out[16]){','static void load_control_ingress(',
       'static bool exact_hardware(','static unsigned admission_state(','static bool make_ingress(',
       'static bool admission_create(','static int enroll_command(','static bool membership_epoch(','static int membership_epoch_command(','static int control_ingress_command(']
body='\n'.join(extract(name) for name in names)
tests=r'''
static char group[]="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",node[]="dddddddddddddddddddddddddddddddd",peer[]="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
static char nonce[]="01000000000000000000000000000000",pin[]="5500000000000000000000000000000000000000000000000000000000000000";
static char *enroll_args[]={"gw-enroll","1cdbd47539c0",nonce,group,"1",node,peer,"7ce8b1a777ec","42",pin,node};
static void reset(void){memset(&saved,0,sizeof saved);memset(&ingress_saved,0,sizeof ingress_saved);memset(&durable_provision,0,sizeof durable_provision);memset(&durable_ingress,0,sizeof durable_ingress);
    provisioned=persist_failed=ingress_ready=ingress_failed=ap_touched=rf_touched=acquisition_present=last_accepted=committed=lan_present=lan_failed=false;field_permitted=node_identity=write_calls=0;fault=0;cases++;}
int main(void){uint8_t checked[16];
    reset();CHECK(admission_state()==0);CHECK(enroll_command(11,enroll_args)==0);CHECK(last_accepted);CHECK(provisioned&&ingress_ready&&!ingress_failed);CHECK(gateway_control_ingress(checked));CHECK(!memcmp(checked,saved.node,16));CHECK(write_calls==2);
    unsigned writes=write_calls;CHECK(enroll_command(11,enroll_args)==1);CHECK(!last_accepted);CHECK(write_calls==writes);CHECK(admission_state()==1);
    reset();enroll_args[1]="7ce8b1a777ec";CHECK(enroll_command(11,enroll_args)==1);CHECK(write_calls==0);enroll_args[1]="1cdbd47539c0";
    reset();enroll_args[2]=group;CHECK(enroll_command(11,enroll_args)==1);CHECK(write_calls==0);enroll_args[2]=nonce;
    reset();rf_touched=true;CHECK(enroll_command(11,enroll_args)==1);CHECK(write_calls==0);
    reset();durable_provision.present=true;durable_provision.size=1;durable_provision.bytes[0]=255;CHECK(admission_state()==2);CHECK(enroll_command(11,enroll_args)==1);CHECK(write_calls==0);
    for(int f=1;f<=3;f++){reset();fault=f;CHECK(enroll_command(11,enroll_args)==1);CHECK(!last_accepted);CHECK(persist_failed);CHECK(!gateway_control_ingress(checked));CHECK(admission_state()==3);}
    reset();CHECK(enroll_command(11,enroll_args)==0);memset(&saved,0,sizeof saved);memcpy(&saved,durable_provision.bytes,sizeof saved);provisioned=true;ingress_ready=false;load_control_ingress();CHECK(gateway_control_ingress(checked));
    uint8_t old_scope[32],new_scope[32];CHECK(field_scope(old_scope));saved.peer_mac[0]^=2;CHECK(gateway_control_ingress(checked));CHECK(field_scope(new_scope));CHECK(memcmp(old_scope,new_scope,32));saved.peer_mac[0]^=2;
    saved.epoch++;CHECK(!gateway_control_ingress(checked));saved.epoch--;saved.pin[0]^=1;CHECK(!gateway_control_ingress(checked));saved.pin[0]^=1;
    reset();CHECK(enroll_command(11,enroll_args)==0);durable_ingress.present=false;ingress_ready=false;load_control_ingress();CHECK(!ingress_ready&&!ingress_failed);
    char *migration[]={"gw-control-ingress","1cdbd47539c0",nonce,node};CHECK(control_ingress_command(4,migration)==0);CHECK(last_accepted&&gateway_control_ingress(checked));writes=write_calls;
    CHECK(control_ingress_command(4,migration)==0);CHECK(write_calls==writes);migration[3]=peer;CHECK(control_ingress_command(4,migration)==1);CHECK(write_calls==writes);
    reset();CHECK(enroll_command(11,enroll_args)==0);struct provision original=saved;uint8_t original_ingress[16];memcpy(original_ingress,ingress_saved.ingress,16);acquisition_present=true;field_permitted=1;atomic_store(&acquisition_runtime_allowed,true);
    CHECK(membership_epoch(1,2));CHECK(saved.epoch==2&&ingress_saved.epoch==2);original.epoch=2;CHECK(!memcmp(&original,&saved,sizeof saved));CHECK(!memcmp(original_ingress,ingress_saved.ingress,16));CHECK(gateway_control_ingress(checked));CHECK(!acquisition_present&&!field_permitted&&!atomic_load(&acquisition_runtime_allowed));
    writes=write_calls;CHECK(!membership_epoch(1,3));CHECK(!membership_epoch(2,2));CHECK(!membership_epoch(2,1));CHECK(write_calls==writes);
    for(int flag=0;flag<4;flag++){reset();CHECK(enroll_command(11,enroll_args)==0);if(flag==0)rf_touched=true;if(flag==1)ap_touched=true;if(flag==2)lan_present=true;if(flag==3)lan_failed=true;writes=write_calls;CHECK(!membership_epoch(1,2));CHECK(write_calls==writes);}
    for(int f=1;f<=3;f++){reset();CHECK(enroll_command(11,enroll_args)==0);committed=false;fault=f;CHECK(!membership_epoch(1,2));CHECK(persist_failed&&ingress_failed&&!ingress_ready);CHECK(!gateway_control_ingress(checked));CHECK(!membership_epoch(1,2));}
    reset();CHECK(enroll_command(11,enroll_args)==0);char *advance[]={"gw-membership-epoch","7ce8b1a777ec",nonce,group,"1","2",node,pin};writes=write_calls;CHECK(membership_epoch_command(8,advance)==1);CHECK(write_calls==writes);advance[1]="1cdbd47539c0";CHECK(membership_epoch_command(8,advance)==0);CHECK(last_accepted&&saved.epoch==2);
    printf("{\"cases\":%u,\"assertions\":%u,\"status\":\"pass\"}\n",cases,assertions);return 0;
}
'''
args.output.mkdir(parents=True,exist_ok=True)
cfile=args.output/'admission.c';exe=args.output/'admission.exe'
cfile.write_text(prefix+'\n'+body+'\n'+tests)
before=hashlib.sha256(source.read_bytes()).hexdigest()
subprocess.run([str(args.zig),'cc','-std=gnu11','-O1','-Wall','-Wextra','-Werror',str(cfile),'-o',str(exe)],check=True)
result=subprocess.run([str(exe.resolve())],capture_output=True,text=True,check=True)
if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise RuntimeError('Source changed during admission test')
print(result.stdout.strip())
(args.output/'result.json').write_text(json.dumps({'sourceSha256':before,'result':json.loads(result.stdout)},indent=2)+'\n')
