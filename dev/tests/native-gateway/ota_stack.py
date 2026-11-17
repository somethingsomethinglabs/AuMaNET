"""Exercise the exact gateway compile guard and actual artifact validator."""
import argparse,hashlib,json,re,subprocess,tempfile
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
source=repo/'dev/firmware/main/gateway_ota.c';validator=repo/'dev/firmware/tools/ota_check_image.py'
guard=re.search(r'#if CONFIG_ESP_MAIN_TASK_STACK_SIZE < 16384\n#error [^\n]+\n#endif',source.read_text()).group()
checks=0
for stack,good in [(0,False),(3584,False),(8192,False),(16383,False),(16384,True),(32768,True)]:
 r=subprocess.run(['cc','-E','-x','c','-',f'-DCONFIG_ESP_MAIN_TASK_STACK_SIZE={stack}'],input=guard,text=True,capture_output=True)
 assert (r.returncode==0)==good,(stack,r.stderr);checks+=1
image=repo/'dev/artifacts/firmware-B-gateway-v14-generic/aumanet_bench.bin'
profile=repo/'dev/firmware/gateway/generic-au.defaults'
for stack,good in [(3584,False),(16383,False),(16384,True),(32768,True)]:
 config=out/f'config-{stack}'
 config.write_text(f'CONFIG_WIFI_MORSE_AU_CHANNELISATION_2024=y\nCONFIG_AUMANET_TX_DBM=24\nCONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y\nCONFIG_AUMANET_SSID=""\nCONFIG_AUMANET_PSK=""\nCONFIG_ESP_MAIN_TASK_STACK_SIZE={stack}\n')
 r=subprocess.run(['python3',str(validator),str(image),'B','generic',str(profile),str(config)],text=True,capture_output=True)
 assert (r.returncode==0)==good,(stack,r.stdout,r.stderr);checks+=1
defaults=repo/'dev/firmware/gateway/sdkconfig.defaults'
assert 'CONFIG_ESP_MAIN_TASK_STACK_SIZE=16384' in defaults.read_text();checks+=1
report={'status':'pass','testCount':2,'assertionCount':checks,'scope':'Exact production preprocessor minimum rejects unsafe profile overrides; real image validator enforces same configured minimum. Physical boot/confirmation remains separate.','sourceSha256':{str(f.relative_to(repo)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [source,validator,defaults,Path(__file__)]}}
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
