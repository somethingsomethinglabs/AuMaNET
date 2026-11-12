"""Reject non-OTA-sized, mismatched or credential-bearing generic artifacts."""
import ast,json,struct,sys
from pathlib import Path
image=Path(sys.argv[1]);role=sys.argv[2];flavor=sys.argv[3];profile=Path(sys.argv[4]);config=Path(sys.argv[5])
b=image.read_bytes();expected=1 if role=='A' else 2
if not 580<=len(b)<=0x240000 or b[0]!=0xe9 or struct.unpack_from('<H',b,12)[0]!=9:raise SystemExit('Invalid OTA image size/chip')
m=b[0x120:0x120+292]
if len(m)!=292 or m[:8]!=b'AUMBD1\0\0' or m[8]!=expected or m[9]!=1 or m[10:12]!=b'AU' or m[12]!=24 or m[14]>3 or m[15]>1:raise SystemExit('Invalid embedded OTA build identity')
if m[13]!=(1 if flavor=='private-bootstrap' else 0):raise SystemExit('Firmware flavor mismatch')
if b[48:80]!=m[16:48]:raise SystemExit('App and custom version disagree')
settings={line.split('=',1)[0]:line.split('=',1)[1] for line in config.read_text().splitlines() if line.startswith('CONFIG_') and '=' in line}
if settings.get('CONFIG_WIFI_MORSE_AU_CHANNELISATION_2024')!='y' or settings.get('CONFIG_AUMANET_TX_DBM')!='24' or settings.get('CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE')!='y':raise SystemExit('Firmware profile/rollback configuration mismatch')
if int(settings.get('CONFIG_ESP_MAIN_TASK_STACK_SIZE','0'))<16384:raise SystemExit('Gateway main-task stack is below the verified 16384-byte minimum')
if flavor=='generic':
 if settings.get('CONFIG_AUMANET_PSK')!='""' or settings.get('CONFIG_AUMANET_SSID')!='""' or settings.get('CONFIG_AUMANET_PRIVATE_BOOTSTRAP')=='y':raise SystemExit('Generic firmware has compiled private credential input')
 for line in profile.read_text().splitlines():
  if line.startswith(('CONFIG_AUMANET_PSK=','CONFIG_AUMANET_SSID=')):
   value=ast.literal_eval(line.split('=',1)[1]).encode()
   if len(value)>=8 and value in b:raise SystemExit('Generic firmware contains private profile credential bytes')
print(json.dumps({'status':'pass','bytes':len(b),'role':role,'flavor':flavor,'customDescriptorOffset':288,'layout':1,'configuredTxCeilingDbm':24,'dirty':bool(m[15]&1)}))
