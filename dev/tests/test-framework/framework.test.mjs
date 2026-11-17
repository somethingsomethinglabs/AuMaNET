import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {select,plan,root} from './run.mjs';
test('firmware changes include app regression and security; unknown changes broaden',()=>{
 assert.deepEqual(new Set(select(['dev/firmware/main/link.c'])),new Set(['app','connectivity','security','release','profiles','provisioning']));
 assert.deepEqual(select(['package.json']),['all']);assert.deepEqual(select([]),['all']);
 assert.deepEqual(select(['dev/packages/protocol/src/index.ts']),['all']);
});
test('UAT cannot be passed by planning or host tests and includes all mandatory scenarios',()=>{
 const p=plan(['uat']);assert.equal(p.acceptance,'INCOMPLETE');assert.equal(p.cases.length,16);
 assert.equal(new Set(p.cases.map(c=>c.id)).size,16);
 assert.ok(p.cases.every(c=>c.mandatory&&c.status==='NOT_RUN'&&c.evidence.length===0));
 assert.ok(p.commands.some(c=>c.includes('web:test')));
});
test('all focused test paths exist and invalid suites fail',()=>{
 for(const s of ['connectivity','app','security','release','profiles','provisioning'])for(const command of plan([s]).commands){
  if(command[1]==='--run'){assert.equal(command[2],'typecheck');continue;}
  for(const arg of command.slice(command[1]==='--test'?2:1))assert.ok(existsSync(resolve(root,arg)),arg);
 }
 assert.throws(()=>plan(['typo']),/Unknown suite/);
});
test('new contracts prepare types and provisioning remains host-only',()=>{
 const p=plan(['profiles']);assert.equal(p.commands[0][2],'typecheck');
 assert.ok(p.commands.some(c=>c.includes('dev/tests/node-client-registry.test.mjs')));
 const provisioning=plan(['provisioning']);assert.equal(provisioning.commands.length,9);
 assert.ok(provisioning.commands.every(c=>c[1].startsWith('dev/tests/')&&c[1].endsWith('.py')));
});
