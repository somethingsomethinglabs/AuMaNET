import {homedir} from 'node:os';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';
const source=await readFile('dev/firmware/main/link.c','utf8');
function extract(signature){const at=source.indexOf(signature);assert(at>=0);let depth=0;for(let i=source.indexOf('{',at);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(at,i+1);}throw Error('Unclosed function');}
test('production root relay channel lifecycle preserves configuration, supports rollback and reports matching capability',async()=>{
 const dir=resolve('dev/artifacts/relay-radio-lifecycle');await mkdir(dir,{recursive:true});const file=resolve(dir,'test.c'),exe=resolve(dir,'test.exe');
 const text=`#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#define CONFIG_AUMANET_UPSTREAM_RELAY 1
#define ESP_OK 0
#define WIFI_IF_AP 1
enum mmwlan_status {MMWLAN_SUCCESS,MMWLAN_ERROR,MMWLAN_SHUTDOWN_BLOCKED};
enum {MMWLAN_AP_STA_UNKNOWN};
struct ap_args {unsigned s1g_chan_num,op_class,max_stas;int credential;};
typedef struct {struct ap_args ap;} mmhalow_wifi_config_t;
struct relay_args {const struct ap_args *root_ap_args;const void *relay_sta_args;int forwarding_table_size;};
struct ar_option {unsigned channel,opclass;};
static const struct ar_option options[]={{36,22},{34,22}};
static const struct ar_option *ar_option(unsigned id){return id>=1&&id<=2?&options[id-1]:NULL;}
static mmhalow_wifi_config_t active_ap_config;
static struct relay_args active_relay_args;
static unsigned validated_channels[]={36,34},bench_channel;
static bool started=true,station,relay,radio_vif_up;static int peer_state;
static int fail_boot,boots,fail_disable,fail_config,fail_enable,disables,enables,configs,legacy_disables,legacy_enables;
static bool node_profile_station(void){return station;}static bool relay_mode_enabled(void){return relay;}
static enum mmwlan_status mmwlan_boot(const void *args){assert(!args);boots++;return fail_boot?MMWLAN_ERROR:MMWLAN_SUCCESS;}
static enum mmwlan_status mmwlan_relay_disable(void){assert(boots>disables);disables++;return fail_disable?MMWLAN_ERROR:MMWLAN_SUCCESS;}
static int mmhalow_set_config(int iface,const mmhalow_wifi_config_t *next){assert(iface==WIFI_IF_AP);assert(next->ap.credential==1234);configs++;return fail_config?-1:0;}
static enum mmwlan_status mmwlan_relay_enable(const struct relay_args *args){enables++;assert(args==&active_relay_args);assert(args->root_ap_args==&active_ap_config.ap);assert(args->root_ap_args->credential==1234);assert(args->root_ap_args->max_stas==2);assert(args->forwarding_table_size==8);return fail_enable?MMWLAN_ERROR:MMWLAN_SUCCESS;}
static enum mmwlan_status mmwlan_ap_disable(void){legacy_disables++;return MMWLAN_SUCCESS;}
static enum mmwlan_status mmwlan_ap_enable(const struct ap_args *args){legacy_enables++;assert(args->credential==1234);return MMWLAN_SUCCESS;}
${extract('static int radio_change_supported(void)')}
${extract('static int radio_apply(void *ignored,unsigned option){')}
static void reset(void){active_ap_config=(mmhalow_wifi_config_t){.ap={36,22,2,1234}};active_relay_args=(struct relay_args){.root_ap_args=&active_ap_config.ap,.forwarding_table_size=8};station=false;relay=true;bench_channel=36;fail_boot=boots=fail_disable=fail_config=fail_enable=disables=enables=configs=legacy_disables=legacy_enables=0;}
int main(void){
 reset();assert(radio_change_supported());assert(radio_apply(NULL,2));assert(bench_channel==34&&active_ap_config.ap.s1g_chan_num==34);assert(disables==1&&enables==1&&!legacy_disables&&!legacy_enables);assert(radio_apply(NULL,1));assert(bench_channel==36);
 reset();fail_boot=1;assert(!radio_apply(NULL,2));assert(boots==1&&!disables&&!enables&&bench_channel==36);
 reset();fail_enable=1;assert(!radio_apply(NULL,2));assert(bench_channel==36);fail_enable=0;assert(radio_apply(NULL,1));assert(active_ap_config.ap.s1g_chan_num==36);
 reset();fail_disable=1;assert(!radio_apply(NULL,2));assert(!configs&&!enables&&bench_channel==36);
 reset();fail_config=1;assert(!radio_apply(NULL,2));assert(!enables&&bench_channel==36);fail_config=0;assert(radio_apply(NULL,1));
 reset();station=true;assert(!radio_change_supported()&&!radio_apply(NULL,2));assert(!boots&&!disables&&!enables);
 reset();active_relay_args.root_ap_args=NULL;assert(!radio_change_supported()&&!radio_apply(NULL,2));assert(!disables);
 reset();active_relay_args.relay_sta_args=&station;assert(!radio_change_supported()&&!radio_apply(NULL,2));
 reset();relay=false;assert(radio_change_supported()&&radio_apply(NULL,2));assert(legacy_disables==1&&legacy_enables==1&&!disables&&!enables);
 puts("relay radio lifecycle: PASS (9 cases)");return 0;
}`;
 await writeFile(file,text);const cc=process.env.AUMANET_HOST_CC??resolve(homedir(),'.codex/tools/aumanet-host-cc/ziglang/zig.exe');execFileSync(cc,['cc','-std=c11','-Wall','-Wextra','-Werror',file,'-o',exe],{windowsHide:true,timeout:60000});assert.match(execFileSync(exe,{windowsHide:true,timeout:10000}).toString(),/PASS/);assert.equal(await readFile('dev/firmware/main/link.c','utf8'),source,'Production source changed during test');
});
