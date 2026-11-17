"""WSL exact OTA engine/crypto, private credential fault and publisher tests."""
import argparse,base64,hashlib,json,os,subprocess
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
fw=repo/'dev/firmware';test=Path(__file__).resolve().parent
inputs=[fw/'gateway/ota.c',fw/'gateway/include/aumanet_ota.h',fw/'main/link_credentials.c',fw/'main/link_credentials.h',fw/'main/gateway_ota.c',fw/'main/gateway_ota_build.h',fw/'main/gateway_boot_crypto.c',fw/'main/ota_publisher.h',test/'OtaTest.c',test/'OtaRuntimeTest.c',test/'OtaCryptoOwnerTest.c',Path(__file__)]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before={str(p.relative_to(repo)):sha(p) for p in inputs}
report={'status':'running','scope':'Exact production OTA engine with actual P256/ECDH/HKDF/AES-GCM and declared flash boundary; exact retained-credential source with NVS commit faults; exact publisher callback and production public key. ESP flash/rollback/RF remain device acceptance.','sourceSha256':before}
def run(args,env=None):
 try:return subprocess.check_output(list(map(str,args)),text=True,stderr=subprocess.STDOUT,env=env,timeout=90)
 except subprocess.CalledProcessError as e:raise RuntimeError(e.output) from e
def compile(name,sources,extra=()):
 exe=out/name;run(['gcc','-std=c11','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-fsanitize=address,undefined','-g','-I',fw/'gateway/include','-I',fw/'main','-I',out,*extra,*sources,'-lcrypto','-o',exe]);return exe
def function(text,marker):
 start=text.index(marker);at=text.index('{',start);depth=0
 for i in range(at,len(text)):
  if text[i]=='{':depth+=1
  elif text[i]=='}':
   depth-=1
   if not depth:return text[start:i+1]
 raise ValueError('Unclosed exact function')
try:
 vector=out/'c-vector';vector.mkdir(exist_ok=True)
 env=dict(os.environ,AUMANET_OTA_VECTOR_DIR=str(vector))
 engine=json.loads(run([compile('ota-engine',[fw/'gateway/ota.c',test/'OtaTest.c'])],env))
 (out/'sdkconfig.h').write_text('#pragma once\n#ifndef CONFIG_AUMANET_PRIVATE_BOOTSTRAP\n#define CONFIG_AUMANET_PRIVATE_BOOTSTRAP 0\n#endif\n#define CONFIG_HALOW_COUNTRY_CODE "AU"\n#define CONFIG_AUMANET_SSID "fixture-mesh"\n#define CONFIG_AUMANET_PSK "fixture-private-password"\n')
 (out/'nvs.h').write_text('''#pragma once
#include <stddef.h>
typedef int nvs_handle_t;typedef int esp_err_t;
#define ESP_OK 0
#define ESP_FAIL 1
#define ESP_ERR_NVS_NOT_FOUND 2
#define NVS_READONLY 0
#define NVS_READWRITE 1
int nvs_open(const char*,int,nvs_handle_t*);void nvs_close(nvs_handle_t);int nvs_get_blob(nvs_handle_t,const char*,void*,size_t*);int nvs_set_blob(nvs_handle_t,const char*,const void*,size_t);int nvs_commit(nvs_handle_t);
''')
 credential=out/'credential-test.c'
 credential.write_text('''#define _POSIX_C_SOURCE 200809L
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <openssl/sha.h>
static unsigned char disk[256],next[256];static size_t disk_n,next_n;static int exists,fault,writes,commits,checks,cases;
#include "nvs.h"
int nvs_open(const char*s,int mode,int*h){assert(!strcmp(s,"amn_link1"));*h=1;if(fault==1)return ESP_FAIL;return !exists&&mode==NVS_READONLY?ESP_ERR_NVS_NOT_FOUND:ESP_OK;}
void nvs_close(int h){(void)h;}
int nvs_get_blob(int h,const char*k,void*out,size_t*n){(void)h;assert(!strcmp(k,"credentials"));if(fault==2)return ESP_FAIL;if(!exists)return ESP_ERR_NVS_NOT_FOUND;if(*n<disk_n)return ESP_FAIL;memcpy(out,disk,disk_n);*n=disk_n;return ESP_OK;}
int nvs_set_blob(int h,const char*k,const void*b,size_t n){(void)h;assert(!strcmp(k,"credentials"));writes++;memcpy(next,b,n);next_n=n;return fault==3?ESP_FAIL:ESP_OK;}
int nvs_commit(int h){(void)h;commits++;if(fault==4)return ESP_FAIL;memcpy(disk,next,next_n);disk_n=next_n;exists=1;if(fault==6)disk[0]^=1;return fault==5?ESP_FAIL:ESP_OK;}
int gb_crypto_hash(const unsigned char*p,size_t n,unsigned char out[32]){return SHA256(p,n,out)!=NULL;}
'''+(fw/'main/link_credentials.c').read_text()+'''
#define CHECK(x) do{checks++;if(!(x)){fprintf(stderr,"credential line%d\\n",__LINE__);assert(x);}}while(0)
static void reboot(void){attempted=ready=0;memset(&retained,0,sizeof retained);}
static void reset(void){reboot();exists=fault=writes=commits=0;disk_n=next_n=0;memset(disk,0,sizeof disk);}
static void valid_disk(void){struct link_record r={.version=1};memcpy(r.country,"AU",2);strcpy(r.ssid,"fixture-mesh");strcpy(r.password,"fixture-private-password");gb_crypto_hash((const unsigned char*)&r,offsetof(struct link_record,digest),r.digest);memcpy(disk,&r,sizeof r);disk_n=sizeof r;exists=1;}
int main(void){reset();cases++;
#if CONFIG_AUMANET_PRIVATE_BOOTSTRAP
 CHECK(link_credentials_load()&&writes==1&&commits==1);CHECK(link_credentials_load()&&writes==1);
#else
 CHECK(!link_credentials_load()&&writes==0&&commits==0);
#endif
 reset();valid_disk();cases++;CHECK(link_credentials_load()&&writes==0);CHECK(!strcmp(link_credentials_ssid(),"fixture-mesh"));unsigned char actual[32],expected[32];static const char old[]="AU\\0fixture-mesh\\0fixture-private-password";CHECK(link_credentials_scope(actual));gb_crypto_hash((const unsigned char*)old,sizeof old,expected);CHECK(!memcmp(actual,expected,32));
 reset();valid_disk();disk[100]^=1;cases++;CHECK(!link_credentials_load()&&writes==0);reboot();disk_n--;CHECK(!link_credentials_load()&&writes==0);
 for(int e=1;e<=2;e++){reset();valid_disk();fault=e;cases++;CHECK(!link_credentials_load()&&writes==0);}
#if CONFIG_AUMANET_PRIVATE_BOOTSTRAP
 for(int e=3;e<=6;e++){reset();fault=e;cases++;CHECK(!link_credentials_load());CHECK(!ready);if(e==5){fault=0;reboot();CHECK(link_credentials_load());}}
#endif
 printf("{\\"status\\":\\"pass\\",\\"testCount\\":%d,\\"assertionCount\\":%d}\\n",cases,checks);return 0;}
''')
 credentials=[]
 for value in (0,1):credentials.append(json.loads(run([compile('credentials-'+str(value),[credential],['-DCONFIG_AUMANET_PRIVATE_BOOTSTRAP='+str(value)])])))
 publisher=out/'publisher-test.c'
 publisher.write_text('''#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <assert.h>
#include <openssl/evp.h>
#include <openssl/x509.h>
#include <openssl/sha.h>
#include "ota_publisher.h"
static int ag_crypto_verify(const uint8_t*der,size_t dn,const uint8_t*pin,const uint8_t*b,size_t n,const uint8_t*s,size_t z){uint8_t hash[32];SHA256(der,dn,hash);if(memcmp(hash,pin,32))return 0;const unsigned char*p=der;EVP_PKEY*k=d2i_PUBKEY(NULL,&p,(long)dn);EVP_MD_CTX*c=EVP_MD_CTX_new();int ok=k&&p==der+dn&&EVP_DigestVerifyInit(c,NULL,EVP_sha256(),NULL,k)>0&&EVP_DigestVerify(c,s,z,b,n)>0;EVP_MD_CTX_free(c);EVP_PKEY_free(k);return ok;}
'''+function((fw/'main/gateway_ota.c').read_text(),'static int publisher_verify(')+'''
int main(int argc,char**argv){assert(argc==3);uint8_t body[384],sig[73];FILE*f=fopen(argv[1],"rb");assert(f&&fread(body,1,384,f)==384);fclose(f);f=fopen(argv[2],"rb");assert(f);size_t n=fread(sig,1,sizeof sig,f);fclose(f);assert(publisher_verify(NULL,body,384,sig,n));body[40]^=1;assert(!publisher_verify(NULL,body,384,sig,n));body[40]^=1;sig[n-1]^=1;assert(!publisher_verify(NULL,body,384,sig,n));puts("{\\"status\\":\\"pass\\",\\"testCount\\":1,\\"assertionCount\\":3}");}
''')
 golden=repo/'dev/artifacts/node-update-golden-crypto-only'
 publisher_result=json.loads(run([compile('publisher',[publisher]),golden/'descriptor.bin',golden/'signature.der']))
 text=(fw/'main/gateway_ota.c').read_text()
 boundary=function(text,'struct ota_receipt {')+';\nstatic esp_ota_handle_t handle;static const esp_partition_t*destination;static struct ota_receipt staged,running_receipt;static atomic_bool pending_boot,confirmed_boot;static atomic_int known_boot_state=255;static bool upload_open,receipt_ready,running_identity_ready;static uint64_t reboot_at;\n'
 for marker in ['static int layout_ready(','static void abort_cb(','static int begin_cb(','static int embedded_checked(','static int write_cb(','static int partition_hash(','static int finish_cb(','static const char*receipt_key(','static int save_receipt(','static int activate_cb(','static int confirm_cb(','void gateway_ota_boot(']:boundary+=function(text,marker)+'\n'
 (out/'ota_runtime_boundary.inc').write_text(boundary)
 fixture=repo/'dev/artifacts/node-update-parser-checkpoint'
 release=json.loads(next(fixture.glob('release-A-*.json')).read_text());descriptor=out/'executable-descriptor.bin';descriptor.write_bytes(base64.b64decode(release['manifest']))
 runtime=json.loads(run([compile('runtime',[test/'OtaRuntimeTest.c']),next(fixture.glob('firmware-A-*.bin')),descriptor]))
 crypto=(fw/'main/gateway_boot_crypto.c').read_text()
 (out/'ota_crypto_owner.inc').write_text(function(crypto,'static int random_mbed(')+'\n'+function(crypto,'int gb_crypto_random(')+'\n')
 ownership=json.loads(run([compile('crypto-owner',[test/'OtaCryptoOwnerTest.c'],['-pthread'])]))
 suites={'engine':engine,'credentialsGeneric':credentials[0],'credentialsBootstrap':credentials[1],'productionPublisher':publisher_result,'runtimeFaults':runtime,'sharedDrbg':ownership}
 report.update(status='pass',suites=suites,testCount=sum(v['testCount'] for v in suites.values()),assertionCount=sum(v['assertionCount'] for v in suites.values()),sourceStable=all(sha(repo/p)==h for p,h in before.items()))
 if not report['sourceStable']:raise ValueError('OTA source changed during host test')
except Exception as e:
 report.update(status='failed',error=str(e));raise
finally:(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
