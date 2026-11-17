// Exercise exact production queryBoth with independent control ingress/radio AP.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),args=process.argv.slice(2);
let jdk=process.env.JAVA_HOME,output=join(root,'dev/artifacts/native-radio-topology');
for(let i=0;i<args.length;i++){if(args[i]==='--jdk')jdk=resolve(args[++i]);else if(args[i]==='--output')output=resolve(args[++i]);else throw Error('Use --jdk JDK [--output DIR]');}
if(!jdk)throw Error('Pass --jdk or JAVA_HOME');
await mkdir(output,{recursive:true});const run=await mkdtemp(join(output,'run-')),classes=join(run,'classes');await mkdir(classes);
const source=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app/GatewayRadioSettingsController.java'),text=await readFile(source,'utf8');
const signature='private Reading[] queryBoth(',begin=text.indexOf(signature);if(begin<0)throw Error('Production method missing');
let end=begin,depth=0;for(end=text.indexOf('{',begin);end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}'&&!--depth){end++;break;}}
const method=text.slice(begin,end),native=join(root,'dev/mobile/android/app/src/main/java/au/aumanet/app');
const names=['GroupWire','GroupNamePolicy','GroupNameJson','GroupNameMetadata','GatewayGrantCodec','GatewayPublicKeyPolicy','GatewayBootCodec','GatewayRadioConfigCodec','GatewayRadioQueryTrace','GatewayRadioQueryPolicy','GatewayRadioChange','GroupRadioConfiguration'];
const sources=names.map(n=>join(native,n+'.java')).concat(join(root,'dev/tests/native-gateway-radio-settings/GatewayRadioSettingsTest.java'));
const harness=join(run,'GatewayRadioTopologyTest.java');
await writeFile(harness,`package au.aumanet.app;
import java.util.*;import org.json.*;
final class GatewayBindingConfig{static final class Node{final String id;Node(String id){this.id=id;}}final List<Node> nodes=List.of(new Node(GatewayRadioSettingsTest.A),new Node(GatewayRadioSettingsTest.B));}
final class GatewayLeaseIssuer{static final class Scope{String group=GatewayRadioSettingsTest.GROUP;long epoch=1;}static final class RadioContext{final Scope scope=new Scope();final GatewayBindingConfig config=new GatewayBindingConfig();final String owner=GatewayRadioSettingsTest.OWNER,relay=GatewayRadioSettingsTest.A,base=GatewayRadioSettingsTest.B;final Map<String,String> runs=Map.of(GatewayRadioSettingsTest.A,GatewayRadioSettingsTest.RUN,GatewayRadioSettingsTest.B,GatewayRadioSettingsTest.BRUN);}}
public final class GatewayRadioTopologyTest{
 static final class Operation{}static final class Reading{final GatewayRadioConfigCodec.Message message;Reading(GatewayRadioConfigCodec.Message m){message=m;}}
 final List<String> queried=new ArrayList<>();boolean wrongRole,wrongRun;
 void debugEvent(String ignored){}
 Reading exchange(GatewayLeaseIssuer.RadioContext c,Operation o,GatewayBindingConfig.Node node,GatewayRadioConfigCodec.Message query,Object prior)throws Exception{
  if(!query.relay.equals(c.relay))throw new AssertionError("Control ingress changed");queried.add(node.id);
  boolean station=!node.id.equals(c.base);if(wrongRole)station=!station;
  String run=wrongRun?"9".repeat(32):c.runs.get(node.id);
  byte[] body=GatewayRadioSettingsTest.report(station,run,0,5,station?0:5,0,"0".repeat(32)).body();
  System.arraycopy(GatewayGrantCodec.identifier(node.id),0,body,16,16);
  return new Reading(GatewayRadioConfigCodec.parse(body));
 }
 ${method}
 public static void main(String[] args)throws Exception{
  GatewayRadioTopologyTest test=new GatewayRadioTopologyTest();GatewayLeaseIssuer.RadioContext c=new GatewayLeaseIssuer.RadioContext();
  Reading[] result=test.queryBoth(c,null);
  if(!test.queried.equals(List.of(c.relay,c.base))||!result[0].message.target.equals(c.base)||result[0].message.station||!result[1].message.target.equals(c.relay)||!result[1].message.station)throw new AssertionError("Radio AP confused with owner ingress");
  test.wrongRole=true;boolean rejected=false;try{test.queryBoth(c,null);}catch(GatewayRadioQueryPolicy.InvalidReadback expected){rejected=true;}if(!rejected)throw new AssertionError("Wrong radio role accepted");
  test.wrongRole=false;test.wrongRun=true;rejected=false;try{test.queryBoth(c,null);}catch(GatewayRadioQueryPolicy.InvalidReadback expected){rejected=true;}if(!rejected)throw new AssertionError("Wrong boot accepted");
  System.out.println("radio topology production query tests: PASS");
 }
}`);
const dep=JSON.parse(await readFile(join(root,'dev/tests/native-group-messages-store/dependencies.json'),'utf8')).dependencies.find(x=>x.name==='org.json'),jar=join(root,'dev/artifacts/group-messages',dep.file),bytes=await readFile(jar);
if(bytes.length!==dep.bytes||createHash('sha256').update(bytes).digest('hex')!==dep.sha256)throw Error('Pinned JSON differs');
function command(name,args){const r=spawnSync(join(jdk,'bin',name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000});if(r.error||r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout;}
command('javac',['-encoding','UTF-8','-cp',jar,'-d',classes,...sources,harness]);
const result=command('java',['-cp',[classes,jar].join(delimiter),'au.aumanet.app.GatewayRadioTopologyTest']);
if(await readFile(source,'utf8')!==text)throw Error('Production source changed during test');
await writeFile(join(output,'result.log'),result);console.log(result.trim());
