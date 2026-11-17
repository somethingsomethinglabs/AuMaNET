import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoutedChatTopology} from './routed-chat-topology.mjs';
const rows=()=>[1,2,3].map((i)=>({name:'p'+i,node:i<3?'A':'B',expectedBssid:i<3?'02:00:00:00:00:01':'02:00:00:00:00:02',observedBssid:i<3?'02:00:00:00:00:01':'02:00:00:00:00:02',identity:'approved-'+i,subnet:i<3?'10.77.1.0/24':'10.77.2.0/24',address:i<3?'10.77.1.'+(15+i):'10.77.2.16'}));
test('two local plus remote evidence is bounded and excludes raw identities/BSSIDs',()=>{const r=validateRoutedChatTopology(rows());assert.equal(r.participants.length,3);assert.equal(JSON.stringify(r).includes('approved-'),false);assert.equal(JSON.stringify(r).includes('02:00'),false);});
test('legacy shared-prefix topology cannot pass routed acceptance',()=>{const r=rows();r[2].subnet='10.77.1.0/24';r[2].address='10.77.1.18';assert.throws(()=>validateRoutedChatTopology(r),/distinct routed/);});
test('duplicate addresses, identities, wrong BSSID, gateway or mismatched subnet reject',()=>{for(const changes of [{address:'10.77.1.16'},{identity:'approved-1'},{observedBssid:'02:00:00:00:00:03'},{address:'10.77.1.1'},{subnet:'10.77.2.0/24'}]){const r=rows();r[1]={...r[1],...changes};assert.throws(()=>validateRoutedChatTopology(r));}});
