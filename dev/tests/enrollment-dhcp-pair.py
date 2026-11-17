"""Run the required installed-app DHCP gate sequentially on the intended pair."""
import json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'dev/artifacts/fresh-enrollment-20261116'
ADB='C:/Users/rowan/.codex/tools/android/platform-tools/adb.exe'
rows=[]
for name,serial,port,hardware in [('owner','R5CTA309DMW','COM4','1cdbd47539c0'),('member','00170158Q001707','COM3','7ce8b1a777ec')]:
    profile=json.loads((BASE/'private'/f'{name}-new-profile.json').read_text())['profile']
    result=BASE/f'dhcp-{name}.json'
    args=[sys.executable,str(ROOT/'dev/firmware/tools/test_phone_dhcp.py'),'--adb',ADB,'--serial',serial,'--port',port,'--node',hardware,'--mac',profile['mac'],'--ip',profile['address'],'--ssid',profile['ssid'],'--output',str(result),'--reboot']
    subprocess.run(args,cwd=ROOT,check=True)
    proof=json.loads(result.read_text())
    if proof.get('passed') is not True:raise RuntimeError('Mandatory DHCP acceptance failed')
    rows.append(dict(phone=serial,node=hardware,passed=True,result=str(result.relative_to(ROOT))))
    subprocess.run(['node','dev/tests/universal-phone-check.mjs','--wait-connected','--assert-not-transmitting'],cwd=ROOT,check=True)
    print(name+': complete installed-app DHCP/reboot acceptance passed',flush=True)
(BASE/'dhcp-pair.json').write_text(json.dumps(dict(passed=True,phones=rows),indent=2))
