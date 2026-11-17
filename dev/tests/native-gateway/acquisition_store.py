#!/usr/bin/env python3
"""Exact firmware acquisition/NVS methods with transactional fault-injection adapters.
No ESP flash, radio, USB or time provisioning is performed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[3]
source = repo / 'dev/firmware/main/gateway_main.c'
header = repo / 'dev/firmware/gateway/include/aumanet_gateway.h'
text = source.read_text()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
inputs = [source, header, Path(__file__)]
before = {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}

def extract(signature):
    at = text.index(signature)
    if text.find(signature, at + 1) >= 0:
        raise ValueError('Method boundary not unique: ' + signature)
    opening, depth = text.index('{', at), 0
    for end in range(opening, len(text)):
        if text[end] == '{':
            depth += 1
        elif text[end] == '}':
            depth -= 1
            if not depth:
                return text[at:end + 1]
    raise ValueError('Unclosed method: ' + signature)

def structure(signature):
    at = text.index(signature)
    return text[at:text.index('};', at) + 2]

prefix = r'''
static void ota_deny(void){} /* unrelated OTA runtime boundary */

#include <stdatomic.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/evp.h>
#define AG_OK 0
#define AG_GROUP_PREFIX 0x0a4d0000UL
#define AB_MAX_SAFE 9007199254740991ULL
#define GB_ID_READY 1
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NVS_NOT_FOUND 0x1102
#define NVS_READONLY 0
#define NVS_READWRITE 1
#define portMAX_DELAY 0
typedef int esp_err_t;
typedef int nvs_handle_t;
static unsigned checks,cases;
#define CHECK(value) do {checks++;if(!(value)){fprintf(stderr,"FAIL %d: %s\n",__LINE__,#value);exit(1);}}while(0)
#define CASE() do{cases++;}while(0)
'''
prefix += structure('struct provision {') + '\n' + structure('struct acquisition_permission {') + r'''
static struct provision saved;
static struct acquisition_permission acquisition;
static bool acquisition_present,acquisition_storage_failed,acquisition_apply_failed,provisioned,persist_failed,core_ready,ap_touched,ap_started;
static uint8_t field_permitted,field_storage_failed,boot_initialized,boot_clock_poisoned,stored_field_scope[32],run[16]={1};
static uint64_t unix_base;
static _Atomic bool acquisition_runtime_allowed;
static bool core_handoff_fail,core_install_fail;
static int node_identity=GB_ID_READY,mutex,operation_result,boot_transport,signal_transport,radio_control;
static unsigned permits,core_installs;
static uint8_t node_key_pin[32]={0xa1};
struct ag_acquisition {uint8_t group[16],node[16],owner_pin[32],mac[6];uint64_t epoch;uint32_t ip;};
static struct ag_acquisition installed;
static bool core_enabled;
static int ag_acquisition_set(const struct ag_acquisition *p){if(core_install_fail)return 1;core_installs++;core_enabled=p!=NULL;if(p)installed=*p;return 0;}
static bool call_core(void (*work)(void *)){if(core_handoff_fail)return false;work(NULL);return true;}
static void xSemaphoreTake(int a,int b){(void)a;(void)b;}
static void xSemaphoreGive(int a){(void)a;}
static void ab_transport_permit(int *transport,int allowed){(void)transport;(void)allowed;permits++;}
/* Radio-profile ownership is separately exercised by radio.py; this harness
 * observes only the exact acquisition/field NVS transaction and core handoff. */
static void ar_permit(int *transport,int allowed){(void)transport;(void)allowed;}
static void bench_link_radio_permit(int allowed){(void)allowed;}
static void configure_boot(void){}
static int gb_crypto_public(uint8_t *key,size_t *bytes,uint8_t *pin){memset(key,0x42,91);*bytes=91;memcpy(pin,node_key_pin,32);return 1;}
static int gb_crypto_hash(const uint8_t *data,size_t n,uint8_t out[32]){unsigned bytes=0;return EVP_Digest(data,n,out,&bytes,EVP_sha256(),NULL)==1&&bytes==32;}
struct entry{char key[24];uint8_t bytes[1024];size_t size;bool used;};
static struct entry durable[8],working[8];
/* fail: 1 set/erase; 2 commit old outcome; 3 committed but reported failure;
 * 4 corrupt readback; 5 open failure. No failed operation is reported success. */
static unsigned fail;
static struct entry *entry(struct entry *items,const char *key,bool create){
 for(unsigned i=0;i<8;i++)if(items[i].used&&!strcmp(items[i].key,key))return &items[i];
 if(create)for(unsigned i=0;i<8;i++)if(!items[i].used){items[i].used=true;snprintf(items[i].key,sizeof items[i].key,"%s",key);return &items[i];}
 return NULL;
}
static int nvs_open(const char *name,int mode,nvs_handle_t *handle){(void)name;if(fail==5)return ESP_FAIL;*handle=mode?1:2;if(mode)memcpy(working,durable,sizeof working);return ESP_OK;}
static int nvs_set_blob(nvs_handle_t h,const char *key,const void *data,size_t n){(void)h;if(fail==1||n>1024)return ESP_FAIL;struct entry *e=entry(working,key,true);if(!e)return ESP_FAIL;memcpy(e->bytes,data,n);e->size=n;return ESP_OK;}
static int nvs_set_u8(nvs_handle_t h,const char *key,uint8_t n){return nvs_set_blob(h,key,&n,1);}
static int nvs_erase_key(nvs_handle_t h,const char *key){(void)h;if(fail==1)return ESP_FAIL;struct entry *e=entry(working,key,false);if(!e)return ESP_ERR_NVS_NOT_FOUND;memset(e,0,sizeof *e);return ESP_OK;}
static int nvs_commit(nvs_handle_t h){(void)h;if(fail==2)return ESP_FAIL;memcpy(durable,working,sizeof durable);return fail==3?ESP_FAIL:ESP_OK;}
static int nvs_get_blob(nvs_handle_t h,const char *key,void *data,size_t *n){struct entry *e=entry(h==1?working:durable,key,false);if(!e)return ESP_ERR_NVS_NOT_FOUND;if(data){if(*n<e->size)return ESP_FAIL;memcpy(data,e->bytes,e->size);if(fail==4&&!strcmp(key,"acquisition"))((uint8_t*)data)[0]^=1;}*n=e->size;return ESP_OK;}
static int nvs_get_u8(nvs_handle_t h,const char *key,uint8_t *n){size_t size=1;return nvs_get_blob(h,key,n,&size);}
static void nvs_close(nvs_handle_t h){(void)h;}
'''
signatures = ['static int read_acquisition_permission(', 'static int all_zero(', 'static int hex_digit(', 'static bool unhex(', 'static bool token(',
              'static bool client_ip(', 'static bool configured_ap(', 'static int field_scope(',
              'static bool acquisition_allowed(', 'static void core_acquisition(', 'static bool persist(',
              'static void load_acquisition(', 'static int acquisition_command(', 'static int field_command(']
functions = '\n'.join(extract(sig) for sig in signatures)
tail = r'''
static char token_text[]="01000000000000000000000000000000";
static int acquire(const char *mac){char *argv[]={"gw-acquisition",token_text,(char*)mac};return acquisition_command(3,argv);}
static int field(const char *state){char *argv[]={"gw-field",token_text,(char*)state};return field_command(3,argv);}
static void reset(void){memset(&saved,0,sizeof saved);memset(&acquisition,0,sizeof acquisition);memset(durable,0,sizeof durable);memset(working,0,sizeof working);memset(stored_field_scope,0,32);saved.version=1;saved.epoch=1;saved.group[0]=1;saved.node[0]=2;saved.peer[0]=3;saved.peer_mac[0]=2;saved.key_bytes=91;saved.pin[0]=0x33;saved.lease_ip=AG_GROUP_PREFIX|10;strcpy(saved.ssid,"fixture-node");strcpy(saved.password,"fixture-password");field_permitted=1;field_storage_failed=0;boot_initialized=1;boot_clock_poisoned=0;core_ready=true;ap_started=true;ap_touched=true;provisioned=true;persist_failed=false;acquisition_present=false;acquisition_storage_failed=false;core_enabled=false;core_handoff_fail=core_install_fail=false;acquisition_apply_failed=false;atomic_store(&acquisition_runtime_allowed,false);unix_base=0;fail=0;node_key_pin[0]=0xa1;CHECK(field_scope(stored_field_scope));}
static void good(void){CHECK(acquire("02000000000a")==0);CHECK(acquisition_present&&acquisition_allowed()&&core_enabled&&read_acquisition_permission());CHECK(installed.ip==saved.lease_ip&&!memcmp(installed.mac,(uint8_t[]){2,0,0,0,0,10},6));}
int main(void){
 CASE();reset();good();acquisition_present=false;memset(&acquisition,0,sizeof acquisition);load_acquisition();CHECK(acquisition_present&&acquisition_allowed());CHECK(unix_base==0);
 CASE();reset();ap_started=ap_touched=false;field_permitted=0;CHECK(acquire("02000000000a")==0);CHECK(acquisition_present&&!acquisition_allowed()&&!core_enabled);CHECK(field("on")==0);CHECK(acquisition_allowed()&&core_enabled);
 CASE();for(unsigned f=1;f<=5;f++){reset();fail=f;CHECK(acquire("02000000000a")!=0);CHECK(!acquisition_present&&acquisition_storage_failed&&!core_enabled);fail=0;}
 CASE();reset();good();CHECK(acquire("off")==0);CHECK(!acquisition_present&&!acquisition_allowed()&&!core_enabled);load_acquisition();CHECK(!acquisition_present&&!acquisition_storage_failed);CHECK(entry(durable,"acquisition",false)==NULL);
 CASE();reset();good();fail=2;CHECK(acquire("off")!=0);CHECK(!acquisition_present&&acquisition_storage_failed&&!core_enabled);fail=0;CHECK(acquire("off")==0);load_acquisition();CHECK(!acquisition_present);
 CASE();reset();good();CHECK(field("off")==0);CHECK(!field_permitted&&!acquisition_present&&!core_enabled);CHECK(entry(durable,"acquisition",false)==NULL);CHECK(field("on")==0);load_acquisition();CHECK(!acquisition_present&&!acquisition_allowed());
 CASE();reset();good();struct provision original=saved,next=saved;strcpy(next.ssid,"other-node");CHECK(persist(&next));CHECK(!field_permitted&&!acquisition_present);CHECK(entry(durable,"acquisition",false)==NULL);CHECK(persist(&original));CHECK(field("on")==0);load_acquisition();CHECK(!acquisition_present&&!acquisition_allowed());
 CASE();reset();good();node_key_pin[0]^=1;CHECK(!acquisition_allowed());node_key_pin[0]^=1;saved.epoch++;CHECK(!acquisition_allowed());saved.epoch--;saved.pin[0]^=1;CHECK(!acquisition_allowed());
 CASE();reset();good();struct entry *stored=entry(durable,"acquisition",false);CHECK(stored);stored->bytes[0]=99;load_acquisition();CHECK(!acquisition_present&&acquisition_storage_failed);reset();good();stored=entry(durable,"acquisition",false);stored->size--;load_acquisition();CHECK(!acquisition_present&&acquisition_storage_failed);
 CASE();reset();good();unix_base=1767225600;unsigned before=core_installs;CHECK(acquire("02000000000b")!=0);CHECK(acquisition_present&&acquisition_allowed()&&core_enabled&&core_installs==before);CHECK(!memcmp(acquisition.mac,(uint8_t[]){2,0,0,0,0,10},6));
 CASE();reset();good();core_handoff_fail=true;CHECK(acquire("off")!=0);CHECK(!read_acquisition_permission()&&acquisition_apply_failed);CHECK(entry(durable,"acquisition",false)==NULL);CHECK(!acquisition_present);core_handoff_fail=false;
 CASE();reset();good();core_handoff_fail=true;CHECK(field("off")!=0);CHECK(!read_acquisition_permission()&&!field_permitted&&acquisition_apply_failed);CHECK(entry(durable,"acquisition",false)==NULL);core_handoff_fail=false;
 CASE();reset();core_install_fail=true;CHECK(acquire("02000000000a")!=0);CHECK(!read_acquisition_permission()&&acquisition_apply_failed&&acquisition_present);core_install_fail=false;CHECK(acquire("02000000000a")==0);CHECK(read_acquisition_permission()&&!acquisition_apply_failed);
 fprintf(stderr,"runtime acquisition cases=%u assertions=%u\n",cases,checks);printf("{\"schema\":\"aumanet.gateway-acquisition-store.v1\",\"cases\":%u,\"assertions\":%u,\"result\":\"PASS\",\"physical\":false}\n",cases,checks);return 0;
}
'''
harness = out / 'AcquisitionStoreTest.c'
harness.write_text(prefix + functions + tail)
binary = out / 'AcquisitionStoreTest'
subprocess.run(['gcc', '-std=gnu11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                '-Wno-misleading-indentation', '-Wno-unused-function', '-fsanitize=address,undefined',
                '-fno-sanitize-recover=all', str(harness), '-lcrypto', '-o', str(binary)], check=True)
run = subprocess.run([str(binary)], text=True, capture_output=True,
                     env=dict(os.environ, ASAN_OPTIONS='halt_on_error=1:detect_leaks=1', UBSAN_OPTIONS='halt_on_error=1'))
(out / 'stdout.log').write_text(run.stdout)
(out / 'stderr.log').write_text(run.stderr)
run.check_returncode()
result = json.loads(run.stdout.strip().splitlines()[-1])
result.update(scope='Exact extracted firmware acquisition persistence/eligibility/field/provision methods and real SHA256; declared transactional NVS, TCPIP core API and radio/key-public adapters. No flash/device or actual ESP NVS acceptance.',
              sourceSha256=before, sanitizers=['address', 'undefined'])
for path in inputs:
    if before[str(path.relative_to(repo))] != hashlib.sha256(path.read_bytes()).hexdigest():
        raise ValueError('Runtime acquisition source changed during test')
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ('cases', 'assertions', 'result', 'physical')}))
