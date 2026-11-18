<script lang="ts">
  import {appearance} from '../appearance';
  import MapPanel from '../MapPanel.svelte';
  import {groupMapMembers} from '../maps/group-members';
  import type {GroupSnapshot,RadioSignal} from '@aumanet/protocol';
  import DeviceDetails from '../DeviceDetails.svelte';
  import {networkNodes,mapNameSelection,type DeviceSelection} from '../network-topology';
  const self='A'.repeat(64),peer='B'.repeat(64),third='C'.repeat(64);
  const own={latitude:-37.6535,longitude:145.5159,accuracy:5,timestamp:1};
  let fix=own,ageMs=0,active=true,dark=false;
  let selection:DeviceSelection|undefined;
  const observation:RadioSignal={status:'available',authenticated:true,receiverNodeId:'b'.repeat(32),transmitterNodeId:'a'.repeat(32),receiverPhoneId:peer,transmitterPhoneId:self,sourceRun:'c'.repeat(32),observationId:'D'.repeat(64),direction:'ap-to-station',verification:'pinned-node',rssiDbm:-45,kind:'associated-ap-last-known',readAgeMs:0,sampleAgeKnown:false,observedElapsedMs:1000,configRevision:1};
  let group:GroupSnapshot={schema:'aumanet.group.v1',source:'device',processId:'12345678-1234-1234-1234-123456789abc',sequence:1,observedElapsedMs:1000,status:'hosting',role:'owner',identity:{id:self,name:'You'},group:{id:'a'.repeat(32),ownerId:self,name:'Fixture group',epoch:1},members:[{id:self,name:'You',connected:true,sharingLocation:true,voiceJoined:false},{id:peer,name:'Fixture peer',connected:true,sharingLocation:true,voiceJoined:false,fix:{latitude:-37.6555,longitude:145.5189,accuracy:7,timestamp:1,ageMs:0,mock:true}}],radioSignals:[observation],pending:[],signals:[],sharingLocation:true,voiceJoined:false,error:''};
  $: members=groupMapMembers(group,0);
  $: nodes=networkNodes(group);
  export function signal(rssiDbm:number){group={...group,radioSignals:[{...observation,rssiDbm}]};}
  export function stale(){group={...group,radioSignals:[{...observation,readAgeMs:30001}]};}
  export function unmapped(){group={...group,radioSignals:[{...observation,receiverPhoneId:undefined,transmitterPhoneId:undefined}]};}
  export function stopped(){ageMs=60001;active=false;}
  export function addThird(){group={...group,members:[...group.members,{id:third,name:'Unmapped third',connected:true,sharingLocation:true,voiceJoined:false,fix:{latitude:-37.6545,longitude:145.5199,accuracy:6,timestamp:1,ageMs:0,mock:true}}]};}
  export function rename(name:string){group={...group,members:group.members.map(member=>member.id===peer?{...member,name}:member)};}
  export function disconnect(){group={...group,status:'interrupted'};}
  export async function theme(value:boolean){dark=value;await appearance.set({theme:value?'Dark':'Light'});}
</script>
<main class="live-shell map-fixture" class:dark style="height:100dvh;display:flex;flex-direction:column;position:relative"><h1>Map connection fixture</h1><p>Synthetic positions and signed-report shapes. No phones or GPS.</p><MapPanel {fix} {ageMs} {active} {members} {group} onmemberdetails={id=>selection={kind:'phone',id:id==='self'?self:id}} onmembernamedetails={id=>selection=mapNameSelection(nodes,self,id)} nodeMemberIds={nodes.flatMap(node=>node.phones.map(phone=>phone.id===self?'self':phone.id))}/></main>
<DeviceDetails {selection} {group} {nodes} ownFix={fix} ownAgeMs={ageMs} ownActive={active} {dark} onselect={value=>selection=value} onclose={()=>selection=undefined}/>
<style>.live-shell{box-sizing:border-box;padding:12px;max-width:800px;margin:auto;--card:#fffdf6;--line:#dfe1d5;--ink:#214c35;--muted:#65745f;background:#f5f3e9;color:var(--ink)}.live-shell.dark{--card:#202d26;--line:#4f6255;--ink:#eaf0e7;--muted:#b9c6b5;background:#162019}h1{font-size:18px;margin:0}main>p{font-size:12px}</style>
