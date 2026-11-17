#!/usr/bin/env python3
"""Exact callback/JSON extraction with pinned public SDK definitions. No RF/devices."""
import argparse, hashlib, json, pathlib, re, subprocess, tempfile
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--sdk',default='/home/rowan/aumanet-tools/esp-halow/halow/components/mm-iot-sdk');a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3];out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
link=root/'dev/firmware/main/link.c';sdk=pathlib.Path(a.sdk)/'framework/morselib/include';header=sdk/'mmwlan.h';stats=sdk/'mmwlan_stats.h'
inputs=[link,header,stats,pathlib.Path(__file__).resolve()];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={str(p):sha(p) for p in inputs}
result={'status':'running','scope':'Exact production observational callbacks/JSON renderer with actual pinned SDK event/status enums and mmwlan_stats struct. Clock and public SDK snapshot are declared boundary values; no real RF/driver association acceptance.','sourceSha256':before}
def extract(text,start):
    at=text.index(start);opening=text.index('{',at);depth=0
    for end in range(opening,len(text)):
        if text[end]=='{':depth+=1
        if text[end]=='}':
            depth-=1
            if not depth:return text[at:end+1]
    raise RuntimeError('Extraction boundary changed')
try:
    source=link.read_text();definitions=header.read_text();enums='\n'.join(extract(definitions,'enum '+name+'\n')+';' for name in ['mmwlan_status','mmwlan_sta_state','mmwlan_sta_event'])
    arguments=extract(definitions,'struct mmwlan_sta_event_cb_args\n')+';'
    declarations='\n'.join(re.findall(r'^static _Atomic uint32_t diag[^\n]+;',source,re.M))
    methods='\n'.join(extract(source,sig) for sig in ['static void diagnostic_sta_event(', 'static void diagnostic_sta_state(', 'static void diagnostic_tx_error(', 'static void diagnostic_status_json('])
    harness='''#include <stdint.h>
#include <stdbool.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>
#include "mmwlan_stats.h"
#define CONFIG_AUMANET_NODE_B 1
static uint64_t fake_us;
static int64_t esp_timer_get_time(void){return (int64_t)fake_us;}
'''+enums+'\n'+arguments+'\n'+declarations+'\n'+methods+'''
int main(void){struct mmwlan_stats_umac_data stats={0};printf("{\\"case\\":\\"empty\\"");diagnostic_status_json(&stats,false,100);puts("}");
 for(int event=0;event<8;event++){fake_us=(1000+event)*1000ULL;struct mmwlan_sta_event_cb_args args={.event=(enum mmwlan_sta_event)event};diagnostic_sta_event(&args,NULL);}
 struct mmwlan_sta_event_cb_args bad={.event=(enum mmwlan_sta_event)8};diagnostic_sta_event(&bad,NULL);diagnostic_sta_event(NULL,NULL);diagnostic_sta_state(MMWLAN_STA_CONNECTING);diagnostic_sta_state(MMWLAN_STA_CONNECTED);diagnostic_sta_state((enum mmwlan_sta_state)3);diagnostic_tx_error(MMWLAN_SUCCESS);diagnostic_tx_error(MMWLAN_NOT_FOUND);
 for(unsigned i=0;i<MMWLAN_STATS_CONNECT_TIMESTAMP_N_ENTRIES;i++){stats.connect_timestamp[i]=10000+i;}stats.hw_restart_counter=2;stats.num_scans_complete=3;stats.datapath_driver_tx_pending_status_timeout=7;
 printf("{\\"case\\":\\"observed\\"");diagnostic_status_json(&stats,true,1100);puts("}");
 fake_us=((uint64_t)UINT32_MAX-4)*1000ULL;struct mmwlan_sta_event_cb_args wrap={.event=MMWLAN_STA_EVT_AUTH_REQUEST};diagnostic_sta_event(&wrap,NULL);printf("{\\"case\\":\\"wrap\\"");diagnostic_status_json(&stats,true,5);puts("}");return 0;}
'''
    with tempfile.TemporaryDirectory(prefix='aumanet-radio-diag-') as directory:
        temp=pathlib.Path(directory);c=temp/'diag.c';binary=temp/'diag';c.write_text(harness)
        built=subprocess.run(['gcc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-I'+str(sdk),str(c),'-o',str(binary)],capture_output=True,text=True,timeout=60);(out/'compile.log').write_text(built.stdout+built.stderr)
        if built.returncode:raise RuntimeError('Diagnostic callback compilation failed')
        ran=subprocess.run([str(binary)],capture_output=True,text=True,timeout=30);(out/'cases.jsonl').write_text(ran.stdout);(out/'stderr.log').write_text(ran.stderr)
        if ran.returncode:raise RuntimeError('Diagnostic callback runtime failed')
        rows=[json.loads(line)['diagnostics'] for line in ran.stdout.splitlines()]
        checks=0
        def check(value):
            global checks
            checks+=1
            if not value:raise AssertionError('Diagnostic truth assertion failed at '+str(checks))
        empty,observed,wrapped=rows
        check(empty['last_sta_event']==-1 and empty['sta_event_age_ms']==-1);check(empty['last_sta_state']==-1 and empty['sta_state_age_ms']==-1);check(empty['connect_timestamps_ms'] is None and not empty['umac_stats_available']);check(not empty['last_connection_reason_supported'] and not empty['ap_auth_failure_reason_supported']);check(empty['sta_events_available']);check(observed['sta_event_counts']==[1]*8);check(observed['last_sta_event']==7 and observed['sta_event_age_ms']==93);check(observed['sta_state_counts']==[0,1,1] and observed['last_sta_state']==2);check(observed['host_tx_submit_error_count']==1 and observed['last_host_tx_submit_error']==9);check(observed['hardware_restarts']==2 and observed['scans_complete']==3 and observed['driver_tx_status_timeouts']==7);check(list(observed['connect_timestamps_ms'].values())==list(range(10000,10010)));check(wrapped['last_sta_event']==3 and wrapped['sta_event_age_ms']==10);check(wrapped['sta_event_counts'][3]==2);check(not any(k in observed for k in ['ssid','mac','signature','password','last_connection_reason']));
        result.update(status='pass',testCount=3,assertionCount=checks)
    if any(sha(path)!=before[str(path)] for path in inputs):raise RuntimeError('Source changed while testing')
    result['sourceStable']=True
except Exception as error:result.update(status='fail',error=str(error))
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['status','testCount','assertionCount','error'] if k in result}));raise SystemExit(result['status']!='pass')
