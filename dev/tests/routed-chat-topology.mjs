import {ipv4Number,parseIpv4Network} from '../packages/protocol/dist/routed-node-profile.js';
/** Evidence is captured from ADB, with BSSIDs independently supplied by operator.
 * No SSID, password, private key, invitation or message body enters the result. */
export function validateRoutedChatTopology(rows){
 if(!Array.isArray(rows)||rows.length!==3)throw Error('Routed increment requires exactly three participants');
 const names=new Set(),ips=new Set(),identities=new Set(),nodes=new Map();
 for(const r of rows){
  if(!r||!/^[-\w]+$/.test(r.name)||names.has(r.name)||!['A','B'].includes(r.node)||
   !/^([a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(r.expectedBssid)||r.observedBssid!==r.expectedBssid||
   typeof r.identity!=='string'||!r.identity||identities.has(r.identity))throw Error('Distinct approved identities and independently checked node BSSIDs required');
  const n=parseIpv4Network(r.subnet),ip=ipv4Number(r.address);
  if(n.prefix!==24||ip<=n.network+1||ip>=n.last||ips.has(r.address))throw Error('Distinct usable routed client addresses required');
  if(nodes.has(r.node)&&nodes.get(r.node).subnet!==r.subnet||nodes.has(r.node)&&nodes.get(r.node).bssid!==r.expectedBssid)throw Error('Local clients disagree about node LAN');
  nodes.set(r.node,{subnet:r.subnet,bssid:r.expectedBssid,count:(nodes.get(r.node)?.count??0)+1});names.add(r.name);ips.add(r.address);identities.add(r.identity);
 }
 if(nodes.get('A')?.count!==2||nodes.get('B')?.count!==1||nodes.get('A').subnet===nodes.get('B').subnet||nodes.get('A').bssid===nodes.get('B').bssid)throw Error('Require two clients on A and one on B, with distinct routed LANs');
 return {schema:'aumanet.routed-chat-topology.v1',participants:rows.map(({name,node,address,subnet})=>({name,node,address,subnet})),distinctIdentities:true,attachmentsVerified:true};
}
