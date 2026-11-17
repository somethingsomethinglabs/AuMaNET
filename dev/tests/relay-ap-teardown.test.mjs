import {homedir} from 'node:os';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
test('pinned SDK AP disconnect callback never passes removed interface addresses to the relay table',async()=>{
 const lock=JSON.parse(await readFile('dev/firmware/sdk-upstream-lock.json','utf8')),patch=lock.adapter_patches.find(p=>p.file.includes('003-relay-ap-teardown'));
 const path=resolve('dev/artifacts/sdk-upstream/esp-halow/halow/components/mm-iot-sdk',patch.target),source=(await readFile(path,'utf8')).replaceAll('\r\n','\n');assert.equal(createHash('sha256').update(source).digest('hex'),patch.after_sha256);
 const at=source.indexOf('void umac_relay_handle_ap_sta_state(');let body;let n=0;for(let i=source.indexOf('{',at);i<source.length;i++){if(source[i]==='{')n++;if(source[i]==='}'&&!--n){body=source.slice(at,i+1);break;}}assert(body);
 const dir=resolve('dev/artifacts/relay-ap-teardown');await mkdir(dir,{recursive:true});const file=resolve(dir,'test.c'),exe=resolve(dir,'test.exe');
 await writeFile(file,`#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#define MMLOG_VRB(...) ((void)0)
#define MMLOG_DBG(...) ((void)0)
enum reachable_address_update_type {REACHABLE_ADDRESS_ADD,REACHABLE_ADDRESS_REMOVE};
enum {MMWLAN_AP_STA_UNKNOWN,MMWLAN_AP_STA_AUTHORIZED,OTHER};
struct umac_data {int unused;};struct umac_relay_data {int unused;};struct umac_sta_data {int unused;};
struct mmwlan_ap_sta_status {int state;uint8_t mac_addr[6];};
static struct umac_data device;static struct umac_relay_data relay;static uint8_t local[6]={1},peer[6]={2};static bool enabled=true,has_local=true,has_peer=true;static int updates;static enum reachable_address_update_type last;
static struct umac_data *umac_sta_data_get_umacd(struct umac_sta_data *s){(void)s;return &device;}
static struct umac_relay_data *umac_data_get_relay(struct umac_data *d){(void)d;return enabled?&relay:NULL;}
static const uint8_t *umac_interface_peek_mac_addr(struct umac_sta_data *s){(void)s;return has_local?local:NULL;}
static const uint8_t *umac_sta_data_peek_peer_addr(struct umac_sta_data *s){(void)s;return has_peer?peer:NULL;}
static void umac_relay_process_reachable_address_update(struct umac_sta_data *s,enum reachable_address_update_type type,bool capable,const uint8_t *initiator,const uint8_t *mac){(void)s;assert(!capable&&initiator&&mac);updates++;last=type;}
${body}
int main(void){struct umac_sta_data s={0};struct mmwlan_ap_sta_status status={.state=MMWLAN_AP_STA_UNKNOWN};has_local=false;umac_relay_handle_ap_sta_state(&s,&status);assert(updates==0);has_local=true;has_peer=false;umac_relay_handle_ap_sta_state(&s,&status);assert(updates==0);has_peer=true;umac_relay_handle_ap_sta_state(&s,&status);assert(updates==1&&last==REACHABLE_ADDRESS_REMOVE);status.state=MMWLAN_AP_STA_AUTHORIZED;umac_relay_handle_ap_sta_state(&s,&status);assert(updates==2&&last==REACHABLE_ADDRESS_ADD);enabled=false;umac_relay_handle_ap_sta_state(&s,&status);assert(updates==2);return 0;}
`);
 const cc=process.env.AUMANET_HOST_CC??resolve(homedir(),'.codex/tools/aumanet-host-cc/ziglang/zig.exe');execFileSync(cc,['cc','-std=c11','-Wall','-Wextra','-Werror',file,'-o',exe],{windowsHide:true,timeout:60000});execFileSync(exe,{windowsHide:true,timeout:10000});
});
