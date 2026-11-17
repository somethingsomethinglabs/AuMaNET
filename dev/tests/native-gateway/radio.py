#!/usr/bin/env python3
"""Pure radio control + pinned catalog + real P256 regression. No devices/RF."""
import argparse, hashlib, json, pathlib, re, subprocess, tempfile
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--sdk',default='/home/rowan/aumanet-tools/esp-halow/halow/components/mm-iot-sdk');args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3];out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
base=root/'dev/firmware/gateway';sdk=pathlib.Path(args.sdk);reg=sdk/'framework/src/mmregdb/mmregdb.c'
inputs=[base/'radio_profile.c',base/'radio_trial.c',base/'radio_control.c',base/'boot_recovery.c',base/'include/aumanet_radio_profile.h',base/'include/aumanet_radio_trial.h',base/'include/aumanet_radio_control.h',base/'include/aumanet_boot_recovery.h',root/'dev/tests/native-gateway/RadioControlTest.c',pathlib.Path(__file__).resolve(),reg,root/'dev/firmware/main/link.c',root/'dev/tests/native-gateway/RadioRuntimeTest.c']
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
before={str(path.relative_to(root)) if path.is_relative_to(root) else str(path):sha(path) for path in inputs}
result={'status':'running','scope':'Production pure dedicated radio framing/nonce/relay/trial policy with real OpenSSL P256 and ASan+UBSan; matched exact pinned SDK AU2024 catalog. SDK radio callbacks/persistence are declared faults, not actual RF/NVS/device acceptance.','sourceSha256':before}
try:
    au=reg.read_text().split('const struct mmwlan_s1g_channel s1g_channels_AU[] = {',1)[1].split('};',1)[0]
    rows=[]
    for match in re.finditer(r'\{\s*([0-9]+),\s*([0-9]+),\s*false,\s*([0-9]+),\s*([0-9]+),\s*([0-9]+),\s*([0-9]+),\s*([0-9]+),',au):
        freq,duty,goc,op,ch,bw,power=map(int,match.groups());rows.append((ch,op,goc,bw,freq,power))
    expected=rows[23:46]
    actual=[tuple(map(int,m.groups())) for m in re.finditer(r'\{(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\}',(base/'radio_profile.c').read_text())]
    if len(expected)!=23 or actual!=[(i+1,*r[:5]) for i,r in enumerate(expected)] or any(r[5]!=30 for r in expected):raise RuntimeError('Catalog differs from exact pinned AU2024 tuple ordering')
    result['sdkCatalogValidated']=23
    with tempfile.TemporaryDirectory(prefix='aumanet-radio-') as temp:
        binary=pathlib.Path(temp)/'radio-test'
        command=['gcc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-g','-I'+str(base/'include'),str(inputs[8]),*[str(base/n) for n in ['radio_control.c','radio_trial.c','radio_profile.c','boot_recovery.c']],'-lcrypto','-o',str(binary)]
        build=subprocess.run(command,capture_output=True,text=True,timeout=60);(out/'compile.log').write_text(build.stdout+build.stderr)
        if build.returncode:raise RuntimeError('Radio host compilation failed')
        run=subprocess.run([str(binary)],capture_output=True,text=True,timeout=30);(out/'cases.log').write_text(run.stdout+run.stderr)
        if run.returncode:raise RuntimeError('Radio policy regression failed')
        result.update(json.loads(run.stdout))
        link=inputs[-2].read_text()
        def method(signature):
            start=link.index(signature);position=link.index('{',start);depth=0
            for end in range(position,len(link)):
                if link[end]=='{':depth+=1
                if link[end]=='}':
                    depth-=1
                    if not depth:return link[start:end+1]
            raise RuntimeError('Runtime method boundary changed')
        record=re.search(r'struct radio_record \{.*?\};',link).group(0)
        (pathlib.Path(temp)/'RadioRecord.h').write_text(record)
        begin=link.index('nvs_handle_t profile;esp_err_t profile_error=')
        end=link.index('\n#endif\n    bench_channel=',begin)
        runtime=method('static int radio_apply(void *ignored,unsigned option){')+'\n'+method('static int radio_persist(void *ignored,unsigned option,uint64_t generation,const uint8_t transaction[16]){')+'\n'+method('void bench_link_radio_permit(int enabled){')+'\n'+method('int bench_link_radio_default(void){')+'\nstatic int radio_load_for_test(void){memset(&radio_saved,0,sizeof radio_saved);'+link[begin:end]+'\nreturn 0;}\n'
        (pathlib.Path(temp)/'RadioRuntimeExtract.h').write_text(runtime)
        runtime_command=['gcc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-g','-I'+str(base/'include'),'-I'+temp,str(inputs[-1]),str(base/'radio_trial.c'),str(base/'radio_profile.c'),'-o',str(binary)]
        build=subprocess.run(runtime_command,capture_output=True,text=True,timeout=60);(out/'runtime-compile.log').write_text(build.stdout+build.stderr)
        if build.returncode:raise RuntimeError('Extracted runtime compilation failed')
        run=subprocess.run([str(binary)],capture_output=True,text=True,timeout=30);(out/'runtime-cases.log').write_text(run.stdout+run.stderr)
        if run.returncode:raise RuntimeError('Extracted runtime fault regression failed')
        runtime_result=json.loads(run.stdout.strip().splitlines()[-1]);result['runtime']=runtime_result;result['testCount']+=runtime_result['testCount'];result['assertionCount']+=runtime_result['assertionCount']
    if any(sha(path)!=before[str(path.relative_to(root)) if path.is_relative_to(root) else str(path)] for path in inputs):raise RuntimeError('Source changed while testing')
    result['sourceStable']=True
except Exception as error:result['status']='fail';result['error']=str(error)
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','testCount','assertionCount','error'] if k in result}))
raise SystemExit(result['status']!='pass')
