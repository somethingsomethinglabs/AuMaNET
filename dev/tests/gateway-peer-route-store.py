"""Fault-test extracted production exact-target peer-MAC route migration."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zig',type=Path,default=Path.home()/'.codex/tools/aumanet-host-cc/ziglang/zig.exe')
parser.add_argument('--output',type=Path,default=Path('dev/artifacts/gateway-peer-route-store'))
args=parser.parse_args()
source=Path(__file__).resolve().parents[2]/'dev/firmware/main/gateway_main.c'
text=source.read_text()
def extract(signature):
    start=text.index(signature);depth=0
    for end in range(text.index('{',start),len(text)):
        if text[end]=='{':depth+=1
        elif text[end]=='}':
            depth-=1
            if not depth:return text[start:end+1]
    raise ValueError(signature)
start=text.index('struct provision {');structure=text[start:text.index('};',start)+2]
prefix=r'''
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND 1
#define ESP_MAC_WIFI_STA 0
#define NVS_READONLY 0
#define NVS_READWRITE 1
#define portMAX_DELAY 0
typedef int nvs_handle_t;
typedef int esp_err_t;
static unsigned checks,cases;
#define CHECK(c) do{checks++;if(!(c)){fprintf(stderr,"FAIL line%d %s\n",__LINE__,#c);exit(1);}}while(0)
'''+structure+r'''
static struct provision saved;
static bool provisioned,persist_failed,field_storage_failed,ap_touched,ap_started,core_ready,acquisition_present,acquisition_storage_failed,rf_touched,rf_started,boot_initialized;
static uint8_t field_permitted,stored_field_scope[32],run[16]={1};
static unsigned mutex,writes,commits,refreshes,denials;
static int boot_transport,signal_transport,radio_control;
static _Atomic bool acquisition_runtime_allowed;
static struct {uint32_t version;uint8_t bytes[48];} acquisition;
struct store {struct provision provision;uint8_t scope[32],field;bool acquire,present;};
static struct store durable,work;
static int fault;static bool committed;
static bool bench_link_touched(void){return rf_touched;}
static bool bench_link_started(void){return rf_started;}
static void ota_deny(void){denials++;}
static void refresh_radio_scope(void){refreshes++;}
static void ab_transport_permit(int *value,int enabled){(void)value;CHECK(!enabled);}
static void ar_permit(int *value,int enabled){(void)value;CHECK(!enabled);}
static void bench_link_radio_permit(int enabled){CHECK(!enabled);}
static void xSemaphoreTake(unsigned m,int wait){(void)m;(void)wait;}
static void xSemaphoreGive(unsigned m){(void)m;}
static int ag_crypto_key_valid(const uint8_t *key,size_t n,const uint8_t *pin){return n==1&&key[0]==0x42&&pin[0]==0x55;}
static int esp_read_mac(uint8_t out[6],int type){(void)type;const uint8_t m[6]={0x1c,0xdb,0xd4,0x75,0x39,0xc0};memcpy(out,m,6);return ESP_OK;}
static int nvs_open(const char *name,int mode,nvs_handle_t *h){CHECK(!strcmp(name,"aumanet_gw1"));if((fault==1&&mode==NVS_READWRITE)||(fault==8&&mode==NVS_READONLY&&committed))return ESP_FAIL;*h=mode;if(mode==NVS_READWRITE)work=durable;return ESP_OK;}
static void nvs_close(nvs_handle_t h){(void)h;}
static int nvs_get_blob(nvs_handle_t h,const char *key,void *out,size_t *n){
    struct store *s=h==NVS_READWRITE?&work:&durable;
    if(!strcmp(key,"acquisition"))return (s->acquire||(fault==12&&committed))?ESP_OK:ESP_ERR_NVS_NOT_FOUND;
    if(!s->present)return ESP_ERR_NVS_NOT_FOUND;
    const void *data;size_t bytes;
    if(!strcmp(key,"provision")){data=&s->provision;bytes=sizeof s->provision;if(fault==9&&committed)return ESP_FAIL;}
    else{CHECK(!strcmp(key,"field_scope"));data=s->scope;bytes=32;}
    if(!out){*n=bytes;return ESP_OK;}if(*n<bytes)return ESP_FAIL;
    memcpy(out,data,bytes);*n=bytes;if(fault==11&&committed&&!strcmp(key,"field_scope"))((uint8_t*)out)[0]^=1;return ESP_OK;
}
static int nvs_set_blob(nvs_handle_t h,const char *key,const void *data,size_t n){CHECK(h==NVS_READWRITE);writes++;
    if(!strcmp(key,"provision")){if(fault==2)return ESP_FAIL;CHECK(n==sizeof saved);memcpy(&work.provision,data,n);}
    else{CHECK(!strcmp(key,"field_scope")&&n==32);if(fault==5)return ESP_FAIL;memcpy(work.scope,data,n);}return ESP_OK;
}
static int nvs_erase_key(nvs_handle_t h,const char *key){CHECK(h==NVS_READWRITE&&!strcmp(key,"acquisition"));writes++;if(fault==3)return ESP_FAIL;work.acquire=false;return ESP_OK;}
static int nvs_set_u8(nvs_handle_t h,const char *key,uint8_t value){CHECK(h==NVS_READWRITE&&!strcmp(key,"field_boot")&&!value);writes++;if(fault==4)return ESP_FAIL;work.field=value;return ESP_OK;}
static int nvs_get_u8(nvs_handle_t h,const char *key,uint8_t *out){CHECK(h==NVS_READONLY&&!strcmp(key,"field_boot"));*out=(fault==10&&committed)?1:durable.field;return ESP_OK;}
static int nvs_commit(nvs_handle_t h){CHECK(h==NVS_READWRITE);commits++;if(fault==6)return ESP_FAIL;durable=work;committed=true;return fault==7?ESP_FAIL:ESP_OK;}
'''
names=['static int all_zero(','static int hex_digit(','static bool unhex(','static void print_hex(','static bool token(',
       'static bool valid(','static bool exact_hardware(','static unsigned admission_state(',
       'static bool peer_route_replace(','static int peer_route_command(']
body='\n'.join(extract(n) for n in names)
tests=r'''
static uint8_t oldmac[6]={0x3c,0x1a,0xcc,0x4c,0x83,0xa7},newmac[6]={0x3e,0x1a,0xcc,0x4c,0x83,0xa7};
static void reset(void){
 memset(&saved,0,sizeof saved);saved.version=1;saved.epoch=7;saved.group[0]=1;saved.node[0]=2;memset(saved.peer,0xee,16);memcpy(saved.peer_mac,oldmac,6);saved.key[0]=0x42;saved.key_bytes=1;saved.pin[0]=0x55;saved.lease_ip=0x0a4d0028;strcpy(saved.ssid,"private-test-ap");strcpy(saved.password,"never-export-test-secret");
 memset(&durable,0,sizeof durable);durable.provision=saved;durable.present=true;memset(durable.scope,7,32);durable.field=1;durable.acquire=true;
 provisioned=true;persist_failed=field_storage_failed=ap_touched=ap_started=core_ready=rf_touched=rf_started=acquisition_storage_failed=committed=false;field_permitted=1;acquisition_present=true;memset(&acquisition,7,sizeof acquisition);memset(stored_field_scope,7,32);atomic_store(&acquisition_runtime_allowed,true);writes=commits=refreshes=denials=0;fault=0;
}
static bool mutate(void){return peer_route_replace(saved.peer,oldmac,newmac);}
int main(void){
 cases++;reset();struct provision expected;memcpy(&expected,&saved,sizeof expected);memcpy(expected.peer_mac,newmac,6);CHECK(mutate());CHECK(!memcmp(&saved,&expected,sizeof saved));CHECK(!memcmp(&durable.provision,&expected,sizeof expected));CHECK(!durable.field&&!durable.acquire);CHECK(!field_permitted&&!acquisition_present&&!atomic_load(&acquisition_runtime_allowed));CHECK(!persist_failed&&!field_storage_failed&&refreshes==1&&commits==1);
 unsigned prior=writes;CHECK(!mutate());CHECK(writes==prior);CHECK(peer_route_replace(saved.peer,newmac,newmac));CHECK(writes==prior);
 cases++;reset();uint8_t badpeer[16]={3},badmac[6]={1},zero[6]={0};CHECK(!peer_route_replace(badpeer,oldmac,newmac));CHECK(!peer_route_replace(saved.peer,newmac,newmac));CHECK(!peer_route_replace(saved.peer,oldmac,badmac));CHECK(!peer_route_replace(saved.peer,oldmac,zero));CHECK(!writes);
 cases++;for(unsigned guard=0;guard<7;guard++){reset();if(guard==0)rf_touched=true;else if(guard==1)rf_started=true;else if(guard==2)ap_touched=true;else if(guard==3)ap_started=true;else if(guard==4)core_ready=true;else if(guard==5)persist_failed=true;else field_storage_failed=true;CHECK(!mutate()&&!writes);}
 cases++;reset();durable.provision.peer_mac[5]^=2;CHECK(!mutate()&&!writes);reset();durable.provision.version=99;CHECK(!mutate()&&!writes);
 cases++;for(int mode=1;mode<=12;mode++){reset();fault=mode;struct provision original;memcpy(&original,&saved,sizeof original);CHECK(!mutate());CHECK(persist_failed&&field_storage_failed&&acquisition_storage_failed&&!field_permitted&&!acquisition_present&&!atomic_load(&acquisition_runtime_allowed));CHECK(!memcmp(&saved,&original,sizeof saved));prior=writes;CHECK(!mutate()&&writes==prior);}
 cases++;reset();char *argv[]={"gw-peer-route","1cdbd47539c0","01000000000000000000000000000000","eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","3c1acc4c83a7","3e1acc4c83a7"};CHECK(peer_route_command(6,argv)==0);CHECK(!memcmp(saved.peer_mac,newmac,6));
 cases++;reset();argv[1]="000000000000";CHECK(peer_route_command(6,argv)==1&&!writes);argv[1]="1cdbd47539c0";argv[2]="02000000000000000000000000000000";CHECK(peer_route_command(6,argv)==1&&!writes);
 printf("{\"status\":\"pass\",\"cases\":%u,\"assertions\":%u}\n",cases,checks);return 0;
}
'''
args.output.mkdir(parents=True,exist_ok=True)
cfile=args.output/'peer_route.c';exe=args.output/'peer_route.exe'
cfile.write_text(prefix+'\n'+body+'\n'+tests)
before=hashlib.sha256(source.read_bytes()).hexdigest()
subprocess.run([str(args.zig),'cc','-std=gnu11','-O1','-Wall','-Wextra','-Werror',str(cfile),'-o',str(exe)],check=True)
result=subprocess.run([str(exe.resolve())],capture_output=True,text=True,check=True)
if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise RuntimeError('Production source changed during tests')
last=json.loads(result.stdout.strip().splitlines()[-1]);print(json.dumps(last))
(args.output/'result.json').write_text(json.dumps({'sourceSha256':before,'result':last},indent=2)+'\n')
