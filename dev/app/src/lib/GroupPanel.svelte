<script lang="ts">
  import HelpButton from './HelpButton.svelte';
  import OfflineEnrollment from './OfflineEnrollment.svelte';
  import {onDestroy,onMount} from 'svelte';
  import type {NativeGroupClient,GroupSnapshot,GroupMember} from '@aumanet/core';
  import {normalizeGroupName,type GroupNameRepairTicket} from '@aumanet/protocol';
  import {Users,UserPlus,Copy,ShieldCheck,LogOut} from '@lucide/svelte';

  export let client:NativeGroupClient;
  export let flow:'manage'|'create'|'join'='manage';
  export let state:GroupSnapshot|undefined;
  export let sourceError='';
  export let onleave:(()=>Promise<void>|void)|undefined=undefined;
  export let onmember:((id:string)=>void)|undefined=undefined;

  type Confirmation={kind:'leave'}|{kind:'remove';id:string;name:string}|{kind:'repair';ticket:GroupNameRepairTicket;scope:string;deadline:number};
  let connectionInput='',ownerCode='',ownerCodeExpires=0,ownerCodeDeadline=0,codeCopied=false;
  let ownName='',groupName='',incoming='',inviteCode='',inviteExpires=0,inviteDeadline=0,inputDeadline=0;
  let ownNameDirty=false,seededIdentity='',shownGroup='',busy='',error='',notice='',copied=false;
  let profileEditorOpen=true;
  let renamedGroup='',renameDirty=false;
  let invitationInspected=false,invitationError='';
  let invitePendingIds:ReadonlySet<string>=new Set();
  let now=Date.now(),elapsed=typeof performance==='undefined'?0:performance.now(),alive=true,operation=0,leaving=false;
  let confirmation:Confirmation|undefined,confirmDialog:HTMLDialogElement|undefined;

  $: active=state?.status==='hosting'||state?.status==='connected';
  $: pending=state?.status==='connecting'||state?.status==='pending';
  $: recovering=state?.recovery?.state==='searching'||state?.recovery?.state==='verifying';
  $: codeRemaining=Math.max(0,Math.min(ownerCodeExpires-now,ownerCodeDeadline-elapsed));
  $: ready=!!state&&!sourceError&&client.synced;
  $: owner=state?.role==='owner';
  $: nameValid=validLabel(ownName,48);
  $: incomingInfo=readInvitation(incoming);
  $: inviteRemaining=Math.max(0,Math.min(inviteExpires-now,inviteDeadline-elapsed));
  $: incomingRemaining=incomingInfo?Math.max(0,Math.min(incomingInfo.expiresAt-now,inputDeadline-elapsed)):0;
  $: connectedCount=state?.members.filter(member=>member.connected).length??0;
  $: pendingName=state&&client.pendingNameEdit;
  $: pendingRepair=state&&client.pendingNameRepair;
  $: repairExpired=confirmation?.kind==='repair'&&elapsed>=confirmation.deadline;
  $: if(state&&(seededIdentity!==state.identity.id||!ownNameDirty)){
    seededIdentity=state.identity.id;ownName=state.identity.name;
  }
  $: if((state?.group?.id??'')!==shownGroup){
    shownGroup=state?.group?.id??'';clearSecrets();confirmation=undefined;renameDirty=false;profileEditorOpen=!state?.group;
  }
  $: if(!renameDirty)renamedGroup=state?.group?.name??'';
  $: if(inviteCode&&state?.pending.some(request=>!invitePendingIds.has(request.id)))invitationUsed();
  $: if((inviteCode||ownerCode)&&state?.status!=='hosting')clearSecrets();
  $: if(confirmation?.kind==='remove'&&!memberPresent(confirmation.id))confirmation=undefined;
  $: if(confirmation?.kind==='repair'&&(confirmation.scope!==repairScopeKey()||state?.nameStorage!=='repairable'))confirmation=undefined;
  $: if(!confirmation&&confirmDialog?.open)confirmDialog.close();

  function validLabel(value:string,max:number){try{normalizeGroupName(value,max===48?'self':'group');return true;}catch{return false;}}
  function explain(value:unknown){return value instanceof Error?value.message.slice(0,240):'The group action could not be completed. Please try again.';}
  function clearSecrets(){invitationError='';invitationInspected=false;connectionInput='';ownerCode='';ownerCodeExpires=ownerCodeDeadline=0;codeCopied=false;incoming='';inviteCode='';inviteExpires=inviteDeadline=inputDeadline=0;invitePendingIds=new Set();copied=false;}
  function invitationUsed(){inviteCode='';inviteExpires=inviteDeadline=0;invitePendingIds=new Set();copied=false;notice='Invitation used. Review the phone’s request below.';}
  function memberPresent(id:string){return state?.members.some(member=>member.id===id);}
  function expireSecrets(){
    const wall=Date.now(),monotonic=performance.now(),candidate=readInvitation(incoming);
    if(ownerCode&&(ownerCodeExpires<=wall||ownerCodeDeadline<=monotonic)){ownerCode='';ownerCodeExpires=ownerCodeDeadline=0;codeCopied=false;}
    if(inviteCode&&(inviteExpires<=wall||inviteDeadline<=monotonic)){inviteCode='';inviteExpires=inviteDeadline=0;copied=false;notice='Invitation expired. Create a new one when you are ready.';}
    if(incoming&&(inputDeadline>0&&inputDeadline<=monotonic||candidate&&candidate.expiresAt<=wall)){
      incoming='';inputDeadline=0;invitationInspected=false;invitationError='Invitation expired. Ask the group owner for a new one.';
    }
  }
  function validConnectionCode(value:string){value=value.trim();return value.length<=4096&&value.startsWith('aumanet://reconnect/')&&/^[A-Za-z0-9_-]+$/.test(value.slice('aumanet://reconnect/'.length));}
  function initials(value:string){return Array.from(value.trim())[0]?.toUpperCase()??'';}
  function duration(milliseconds:number){const seconds=Math.ceil(milliseconds/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
  function memberState(member:GroupMember){return !member.connected?'Disconnected':member.voiceJoined?'In voice':'Connected';}
  function readInvitation(value:string):{expiresAt:number;groupName:string;ownerId:string}|undefined{
    if(value.length>4096||!/^aumanet:\/\/join\/[A-Za-z0-9_-]+$/.test(value.trim()))return;
    try{
      const encoded=value.trim().slice('aumanet://join/'.length).replaceAll('-','+').replaceAll('_','/');
      const text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)));
      const candidate=JSON.parse(text);
      if(candidate.schema!=='aumanet.invite.v2'||!Number.isSafeInteger(candidate.expiresAt)||candidate.expiresAt<=0||typeof candidate.groupName!=='string'||!validLabel(candidate.groupName,64)||
        typeof candidate.pin!=='string'||!/^[A-F0-9]{64}$/.test(candidate.pin))return;
      return {expiresAt:candidate.expiresAt,groupName:candidate.groupName,ownerId:candidate.pin};
    }catch{return;}
  }
  function invitationInput(value:string){invitationError='';invitationInspected=false;incoming=value;if(value&&!inputDeadline)inputDeadline=performance.now()+300000;if(!value)inputDeadline=0;notice='';expireSecrets();}
  async function refresh(){try{await client.refresh();}catch(failure){if(alive)error=explain(failure);}}
  async function run(label:string,action:()=>Promise<unknown>){
    if(busy||leaving)return;const token=++operation;busy=label;error='';notice='';
    try{await action();}catch(failure){if(alive&&token===operation)error=explain(failure);}
    finally{if(alive&&token===operation){busy='';await refresh();}}
  }
  function nameScope(){return `${state?.processId}:${state?.group?.id??''}:${state?.group?.epoch??0}`;}
  async function saveName(){const scope=nameScope(),input=ownName;await run('Saving your name…',async()=>{if(client.supportsNameEdits)await client.editName('self',input);else if(state?.namesAvailable!==undefined)throw new Error('Native name editing is unavailable; check the connection status');else await client.identity(normalizeGroupName(input,'self'));if(alive&&scope===nameScope()){ownNameDirty=false;notice='Your name is saved on this phone.';}});}
  async function renameGroup(){const scope=nameScope(),input=renamedGroup;await run('Saving group name…',async()=>{await client.editName('group',input);if(alive&&scope===nameScope()){renameDirty=false;notice='The group name is saved on this phone.';}});}
  async function checkNameSave(){await run('Checking saved name…',async()=>{notice=await client.recoverNameEdit()?'Name save confirmed on this phone.':'Name save is still unconfirmed. Restart the app if storage could not be confirmed.';});}
  function repairScopeKey(){return `${nameScope()}:${state?.identity.nameRevision}:${state?.group?.nameRevision??0}:${state?.nameGeneration}`;}
  async function prepareNameRepair(){const scope=repairScopeKey();await run('Preparing name metadata repair…',async()=>{const ticket=await client.prepareNameRepair();if(alive&&scope===repairScopeKey())confirm({kind:'repair',ticket,scope,deadline:performance.now()+ticket.expiresInMs});});}
  async function checkNameRepair(){await run('Checking name metadata repair…',async()=>{notice=await client.checkNameRepair()?'Name metadata repair confirmed.':'Name metadata repair is still unconfirmed. Restart the app if storage could not be confirmed.';});}
  async function createGroup(){await run('Creating group…',async()=>{clearSecrets();await client.create(ownName.trim(),groupName.trim());ownNameDirty=false;});}
  async function joinGroup(){
    const code=incoming.trim();
    await run('Connecting to group…',async()=>{await client.join(code,ownName.trim());incoming='';inputDeadline=0;ownNameDirty=false;});
  }
  async function createInvitation(){
    const groupId=state?.group?.id;
    await run('Creating invitation…',async()=>{
      inviteCode='';inviteExpires=inviteDeadline=0;copied=false;
      const token=operation,result=await client.createInvite(),current=client.state;
      if(!alive||token!==operation||!groupId||current?.group?.id!==groupId||current.role!=='owner'||current.status!=='hosting')return;
      const remaining=result.expiresAt-Date.now();
      if(typeof result.inviteCode!=='string'||result.inviteCode.length>4096||!readInvitation(result.inviteCode)||!Number.isFinite(remaining)||remaining<=0||remaining>305000)
        throw new Error('A current invitation could not be created. Please try again.');
      inviteCode=result.inviteCode;inviteExpires=result.expiresAt;inviteDeadline=performance.now()+Math.min(remaining,300000);
      invitePendingIds=new Set(current.pending.map(request=>request.id));
    });
  }
  async function reconnect(){const code=connectionInput.trim();connectionInput='';await run('Reconnecting…',()=>client.resume(code||undefined));}
  async function createConnectionCode(){const scope=nameScope();await run('Creating connection code…',async()=>{const result=await client.createRecoveryCode();if(!alive||scope!==nameScope()||state?.status!=='hosting')return;const remaining=result.expiresAt-Date.now();if(remaining<=0||remaining>305000)throw new Error('A current connection code could not be created');ownerCode=result.connectionCode;ownerCodeExpires=result.expiresAt;ownerCodeDeadline=performance.now()+Math.min(remaining,300000);codeCopied=false;});}
  async function copyConnectionCode(){if(!ownerCode||codeRemaining<=0)return;try{await navigator.clipboard.writeText(ownerCode);if(alive&&ownerCode){codeCopied=true;notice='Connection code copied. Share it privately with an existing member.';}}catch{error='Copy is unavailable. Select the connection code and copy it manually.';}}
  async function copyInvitation(){
    if(!inviteCode||inviteRemaining<=0)return;
    try{await navigator.clipboard.writeText(inviteCode);if(alive&&inviteCode){copied=true;notice='Invitation copied. Share it privately with the person you want to join.';}}
    catch{error='Copy is unavailable. Select the invitation text and copy it manually.';}
  }
  function confirm(action:Confirmation){confirmation=action;confirmDialog?.showModal();}
  async function leaveGroup(){
    if(leaving)return;++operation;leaving=true;busy='Disconnecting group…';error='';notice='';clearSecrets();
    let stopFailed=false;
    try{await onleave?.();}catch{stopFailed=true;}
    try{
      await client.leave();
      if(alive){confirmation=undefined;groupName='';notice=stopFailed?'Disconnected. Call stop could not be confirmed; use the voice notification to stop it.':'Disconnected. Your saved membership, keys and messages are preserved.';}
    }catch(failure){if(alive)error=explain(failure);}
    finally{if(alive){leaving=false;busy='';await refresh();}}
  }
  async function confirmAction(){
    const action=confirmation;if(!action)return;
    if(action.kind==='leave'){await leaveGroup();return;}
    if(action.kind==='repair'){confirmation=undefined;await run('Repairing name metadata…',async()=>{await client.confirmNameRepair(action.ticket);notice='Name metadata repaired. Your saved names and group are preserved.';});return;}
    await run('Removing member…',async()=>{await client.revoke(action.id);confirmation=undefined;notice=`${action.name} has been removed.`;});
  }
  onMount(()=>{const tick=()=>{now=Date.now();elapsed=performance.now();expireSecrets();};const timer=setInterval(tick,500);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};});
  onDestroy(()=>{alive=false;++operation;clearSecrets();if(confirmDialog?.open)confirmDialog.close();});
</script>

<div class="group-panel">
  {#if state?.group||flow==='manage'}<section class="card group-heading"><Users size={25}/><div><h2>{state?.group?.name||'Your group'}</h2>
    <p class="hint" role="status">{!state?'Loading group…':state.status==='hosting'?'Group open on this phone':state.status==='connected'?'Connected to group':state.status==='pending'?'Waiting for the owner’s approval':recovering?(state.recovery?.message||'Looking for the saved group owner…'):state.status==='connecting'?'Connecting to group…':state.group?'Group disconnected':'Create a group or join with an invitation'}</p></div>
    {#if active}<span class="pill">{connectedCount} connected</span>{/if}</section>{/if}
  {#if error||sourceError||state?.error}<p class="group-error" role="alert">{error||sourceError||state?.error}</p>{/if}
  {#if sourceError}<button class="outline" disabled={!!busy} onclick={()=>void refresh()}>Check connection status</button>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  {#if busy}<p class="hint" role="status">{busy}</p>{/if}

  {#if state?.group}
    <section class="card"><h3>Members <span class="hint">{state.members.length} / 5</span></h3>
      {#each state.members as member(member.id)}<div class="group-member"><span class="avatar" aria-hidden="true">{initials(member.name)}</span><div class="member-text">
        {#if onmember}<button class="member-name" onclick={()=>onmember?.(member.id)}>{member.name}{member.id===state.identity.id?' · You':''}</button>{:else}<strong>{member.name}{member.id===state.identity.id?' · You':''}</strong>{/if}
        <small>{memberState(member)}{member.id===state.group.ownerId?' · Group owner':''}</small>
        {#if !onmember}<div class="help-row"><span>Phone identity</span><HelpButton title="Phone identity"><output class="pin">{member.id}</output></HelpButton></div>{/if}</div>
        {#if owner&&member.id!==state.identity.id}<button class="text-button remove" aria-label={`Remove ${member.name} from group`} disabled={!ready||!!busy} onclick={()=>confirm({kind:'remove',id:member.id,name:member.name})}>Remove</button>{/if}</div>{/each}
    </section>
    {#if owner&&active}
      <section class="card"><h3>Invite someone</h3><p class="hint">Send a private invitation, then approve the phone when it asks to join.</p>
        <button class="outline" disabled={!ready||!!busy||state.members.length>=5} onclick={()=>void createInvitation()}><UserPlus size={19}/>{inviteCode?'Replace invitation':'Create invitation'}</button>
        {#if state.members.length>=5}<p class="hint">This group has five members. Remove a member before inviting another phone.</p>{/if}
        {#if inviteCode}<label class="field">Private invitation<textarea aria-label="Private group invitation" readonly autocomplete="off" autocapitalize="off" spellcheck="false" value={inviteCode}></textarea></label>
          <p class="hint">Expires in {duration(inviteRemaining)}. Share with one person you trust.</p>
          <button class="outline" disabled={!ready||inviteRemaining<=0} onclick={()=>void copyInvitation()}><Copy size={18}/>{copied?'Copied':'Copy invitation'}</button>{/if}
      </section>
    {/if}
  {/if}

  {#if flow==='manage'}<details class="card profile-editor" bind:open={profileEditorOpen}><summary>Edit your name</summary><h3>Your name</h3>
    <form onsubmit={event=>{event.preventDefault();void saveName();}}>
      <label class="field">Name shown to the group<input aria-label="Your name in the group" autocomplete="off" maxlength="96" bind:value={ownName} oninput={()=>ownNameDirty=true} disabled={!state||leaving}/></label>
      <button class="outline" type="submit" disabled={!ready||!!busy||pending||!!pendingName||state?.namesAvailable===false||!nameValid||ownName.trim()===state?.identity.name}>Save name</button>
    </form>
    {#if state}<div class="help-row"><span>This phone’s identity</span><HelpButton title="This phone’s identity"><p>Compare the complete identity when the owner approves this phone.</p><output class="pin" aria-label="This phone's identity">{state.identity.id}</output></HelpButton></div>{/if}
  </details>{/if}
  {#if state?.nameStorage==='repairable'}<section class="card"><h3>Name metadata needs repair</h3><p class="hint">The saved names are verified, but their edit records cannot be read. Repair preserves the current names and group, retires old name edits, and leaves voice and location sharing as they are.</p><button class="outline" disabled={!ready||!!busy||pending} onclick={()=>void prepareNameRepair()}>Repair name metadata</button></section>
  {:else if state?.nameStorage==='uncertain'}<p class="group-error" role="status">Name storage could not be confirmed. Restart the app before editing or repairing names. Your group data has been preserved.</p>
  {:else if state?.nameStorage==='unavailable'}<p class="group-error" role="status">Saved name values cannot be verified. Name editing and metadata repair are unavailable. Your saved group data has been preserved.</p>
  {:else if state?.namesAvailable===false}<p class="hint">Name editing is unavailable on this installed app.</p>{/if}
  {#if pendingRepair}<button class="outline" disabled={!!busy} onclick={()=>void checkNameRepair()}>Check metadata repair</button>{/if}
  {#if pendingName}<section class="card"><p class="hint">The last name save is unconfirmed. Check its outcome before saving another name.</p><button class="outline" disabled={!!busy} onclick={()=>void checkNameSave()}>Check name save</button></section>{/if}
  {#if owner&&active&&state?.namesAvailable===true}
    <details class="card profile-editor"><summary>Edit group name</summary><h3>Group name</h3><form onsubmit={event=>{event.preventDefault();void renameGroup();}}>
      <label class="field">Name shown to members<input aria-label="Group name shown to members" autocomplete="off" maxlength="128" bind:value={renamedGroup} oninput={()=>renameDirty=true}/></label>
      <button class="outline" type="submit" disabled={!ready||!!busy||!!pendingName||!validLabel(renamedGroup,64)||renamedGroup.trim()===state?.group?.name}>Save group name</button>
    </form></details>
  {/if}

  {#if !state?.group&&!pending&&!active}
    {#if flow!=='join'}<section class="card"><h3>Create a group</h3><p class="hint">Connect the phones to the same local network, then invite the people you want to join. For radio nodes, each phone uses its own node’s Wi-Fi.</p>
      <form onsubmit={event=>{event.preventDefault();void createGroup();}}>
        {#if flow!=='manage'}<label class="field">Your display name<input aria-label="Your name in the group" maxlength="96" bind:value={ownName} oninput={()=>ownNameDirty=true}/></label>{/if}
        <label class="field">Group name<input aria-label="New group name" autocomplete="off" maxlength="128" bind:value={groupName}/></label>
        <button class="primary" type="submit" disabled={!ready||!!busy||state?.namesAvailable===false||!nameValid||!validLabel(groupName,64)}><Users size={19}/>Create group</button>
      </form></section>{/if}
    {#if flow!=='create'}<section class="card"><h3>Your private invitation</h3><p class="hint">Ask the owner for a private invitation. The owner will approve this phone before it can join.</p>
      <form onsubmit={event=>{event.preventDefault();if(invitationInspected)void joinGroup();}}>
        {#if flow!=='manage'}<label class="field">Your display name<input aria-label="Your name in the group" maxlength="96" bind:value={ownName} oninput={()=>ownNameDirty=true}/></label>{/if}
        <label class="field">Invitation<textarea aria-label="Group invitation" aria-invalid={!!invitationError} aria-describedby={invitationError?'invitation-error':undefined} autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="4096" bind:value={incoming} oninput={event=>invitationInput(event.currentTarget.value)} placeholder="Paste the complete invitation"></textarea></label>
        {#if invitationError}<p id="invitation-error" class="group-error" role="alert">{invitationError}</p>{/if}
        {#if !nameValid}<p class="hint" id="invitation-name-help">Enter a valid display name before inspecting an invitation.</p>{/if}
        {#if incomingInfo&&invitationInspected}<p class="hint">Joining <strong>{incomingInfo.groupName}</strong> · Invitation expires in {duration(incomingRemaining)}</p>
          <div class="help-row"><span>Group owner’s identity</span><HelpButton title="Group owner’s identity"><output class="pin">{incomingInfo.ownerId}</output><p class="hint">Check this identity with the person who sent the invitation.</p></HelpButton></div>{/if}
        {#if !invitationInspected}<button class="primary" type="button" disabled={!ready||!!busy||!nameValid} aria-describedby={!nameValid?'invitation-name-help':undefined} onclick={()=>{if(incomingInfo&&incomingRemaining>0){invitationInspected=true;invitationError='';error='';}else invitationError='Enter a complete, current invitation from the group owner.';}}>Inspect invitation</button>{:else}<button class="primary" type="submit" disabled={!ready||!!busy||state?.namesAvailable===false||!nameValid||!incomingInfo||incomingRemaining<=0}><UserPlus size={19}/>Request to join</button>{/if}
      </form></section>{/if}
  {:else if pending}
    <section class="card"><h3>{recovering?'Reconnecting to your saved group':state?.status==='pending'?'Waiting for approval':'Connecting'}</h3><p>{recovering?'Open the group on the owner phone and keep both phones on the same local network. For radio nodes, each phone uses its own node’s Wi-Fi. Your saved membership is verified before reconnecting; voice and location sharing stay off.':'The group owner needs to approve your phone. Keep both phones on the same local network. For radio nodes, each phone uses its own node’s Wi-Fi.'}</p>
      <button class="outline" disabled={leaving} onclick={()=>void leaveGroup()}>{recovering?'Cancel reconnect':'Cancel connection'}</button></section>
  {:else if state?.group&&!active}
    <section class="card"><h3>Reconnect to {state.group.name}</h3><p>Your phone remembers this group. Reconnecting leaves voice and location sharing off until you choose to use them.</p>
      <button class="primary" disabled={!ready||!!busy} onclick={()=>void reconnect()}>Reconnect group</button>{#if !owner&&state.recovery}<details><summary>Use a connection code</summary><p class="hint">If the owner moved or this Wi-Fi blocks discovery, ask them for a current connection code. This only reconnects an already approved member.</p><label class="field">Connection code<textarea aria-label="Saved group connection code" maxlength="4096" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={connectionInput}></textarea></label><button class="outline" disabled={!ready||!!busy||!validConnectionCode(connectionInput)} onclick={()=>void reconnect()}>Reconnect with code</button></details>{/if}</section>
  {/if}

  {#if state?.group}
    {#if owner&&active&&state.recovery}<section class="card"><h3>Help a saved member reconnect</h3><p class="hint">Share a connection code when this Wi-Fi blocks discovery or the group moved. It works only for a phone already approved in this group.</p><button class="outline" disabled={!ready||!!busy} onclick={()=>void createConnectionCode()}>Create connection code</button>{#if ownerCode}<label class="field">Private connection code<textarea aria-label="Private saved-member connection code" readonly value={ownerCode}></textarea></label><p class="hint">Expires in {duration(codeRemaining)}.</p><button class="outline" disabled={codeRemaining<=0} onclick={()=>void copyConnectionCode()}><Copy size={18}/>{codeCopied?'Code copied':'Copy connection code'}</button>{/if}</section>{/if}
    {#if owner&&state.pending.length}
      <section class="card"><h3>Requests to join</h3>
        {#each state.pending as request(request.id)}<div class="request"><strong>{request.name}</strong><p class="hint">Request expires in {duration(request.remainingMs)}. Compare this identity with the identity shown on their phone.</p>
          <div class="help-row"><span>Compare phone identity</span><HelpButton title="Compare phone identity"><output class="pin" aria-label={`Phone identity of ${request.name}`}>{request.id}</output></HelpButton></div>
          <div class="group-actions"><button class="primary" disabled={!ready||!!busy||request.remainingMs===0} onclick={()=>void run('Approving phone…',()=>client.approve(request.id,true))}><ShieldCheck size={18}/>Approve {request.name}</button>
            <button class="outline" disabled={!ready||!!busy} onclick={()=>void run('Declining request…',()=>client.approve(request.id,false))}>Decline</button></div>
        </div>{/each}
      </section>
    {/if}
    <div class="help-row"><span>Group connection</span><HelpButton title="Keeping the group connected"><p>Keep the owner’s phone connected to the same local network. For radio nodes, each phone uses its own node’s Wi-Fi. This version uses that phone to keep the group connected; if it disconnects, members need to reconnect.</p></HelpButton></div>
    {#if !pending}<button class="danger full" disabled={leaving} onclick={()=>confirm({kind:'leave'})}><LogOut size={19}/>Disconnect group</button>{/if}
  {/if}
  <details><summary>Offline membership exchange</summary>  {#if owner&&active}<OfflineEnrollment {client} owner={true}/>{/if}
  {#if !state?.group&&!pending&&flow!=='create'}<OfflineEnrollment {client} name={ownName} invitation={incoming}/>{/if}
</details>
</div>

<dialog bind:this={confirmDialog} aria-labelledby="group-confirm-title" oncancel={()=>confirmation=undefined} onclose={()=>{if(!leaving)confirmation=undefined;}}>
  <h2 id="group-confirm-title">{confirmation?.kind==='repair'?'Repair name metadata?':confirmation?.kind==='remove'?`Remove ${confirmation.name}?`:owner?'Disconnect this group?':'Disconnect from this group?'}</h2>
  {#if confirmation?.kind==='remove'}<p>This removes their access to new group activity. It does not erase anything already saved on their phone.</p>
  {:else if confirmation?.kind==='repair'}<p>Keep the verified current names and retire earlier name-edit records on this phone. Membership, keys, text history, voice and location sharing are preserved.</p>{#if repairExpired}<p role="status">This confirmation expired. Cancel and prepare a new repair.</p>{/if}
  {:else}<p>This phone will stop voice and location sharing and disconnect. Its saved membership, keys and messages stay on this phone for explicit reconnect.</p>{#if owner}<p>Other members will disconnect while this owner phone is unavailable. They can reconnect to their saved membership when the group is open again.</p>{/if}{/if}
  <div class="group-actions"><button class="outline" disabled={leaving} onclick={()=>confirmation=undefined}>Cancel</button>
    <button class="danger" disabled={leaving||confirmation?.kind!=='leave'&&!!busy||repairExpired||confirmation?.kind==='remove'&&!ready} onclick={()=>void confirmAction()}>{leaving?'Disconnecting…':confirmation?.kind==='repair'?'Repair metadata':confirmation?.kind==='remove'?'Remove member':'Disconnect group'}</button></div>
</dialog>

<style>
  .profile-editor>summary{font-size:0.875rem;font-weight:650;cursor:pointer;min-height:44px;display:list-item;align-content:center}.profile-editor[open]>summary{margin-bottom:16px}.member-name{font:inherit;font-weight:700;text-align:left;padding:0;background:transparent;border:0;color:inherit;min-height:32px;text-decoration:underline;text-underline-offset:3px}
  .group-panel{display:grid;gap:16px;min-width:0}.group-panel .card{margin:0;min-width:0}.group-panel h3{margin:0 0 10px}.group-heading{display:flex;align-items:center;gap:12px}.group-heading>div{flex:1;min-width:0}.group-heading h2{overflow-wrap:anywhere}.group-heading p{margin:5px 0 0}.group-panel form{display:grid;gap:12px}.group-panel .field{margin:0}.group-panel form .field{display:grid;gap:7px}.group-panel button{width:fit-content;max-width:100%}.group-panel .full{width:100%;margin:0}.group-panel textarea{width:100%;min-height:94px;resize:vertical;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:inherit;font:0.75rem ui-monospace,monospace;padding:10px;overflow-wrap:anywhere}.group-error{margin:0;color:var(--error-ink);background:var(--error-bg);padding:12px;border-radius:10px;overflow-wrap:anywhere}.pin{display:block;overflow-wrap:anywhere;word-break:break-all;font:0.75rem ui-monospace,monospace;line-height:1.65;user-select:all}.group-member{display:flex;align-items:flex-start;gap:11px;padding:14px 0;border-top:1px solid var(--line)}.member-text{flex:1;min-width:0}.member-text strong{overflow-wrap:anywhere}.member-text small{display:block;font-size:0.75rem;margin-top:4px;color:var(--muted)}.group-member .avatar{width:38px;height:38px;min-width:38px;font-size:1rem}.remove{align-self:center}.group-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.request{padding:14px 0;border-top:1px solid var(--line)}.request strong{overflow-wrap:anywhere}dialog{max-width:460px;width:calc(100% - 32px);padding:23px;border:1px solid var(--line);border-radius:18px;background:var(--card);color:inherit}dialog::backdrop{background:var(--scrim)}dialog p{line-height:1.6}dialog .danger{margin-top:0}.group-panel input{min-width:0;width:100%}
</style>
