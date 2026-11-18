<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {tick} from 'svelte';
  import {Wifi,ShieldCheck,RefreshCw} from '@lucide/svelte';
  import type {TrustedConnectionClient,TrustedConnectionState,TrustedConnectionSnapshot,TrustedVoiceMode,GroupSnapshot} from '@aumanet/core';
  export let client:TrustedConnectionClient;
  export let state:TrustedConnectionState;
  export let group:GroupSnapshot|undefined=undefined;
  export let voiceSupported=false;
  export let compact=false;
  export let onsetup:()=>void;
  let dialog:HTMLDialogElement,reviewed:TrustedConnectionSnapshot|undefined,mode:TrustedVoiceMode='muted',shareLocation=false,notice='';
  $: snapshot=state.snapshot;
  $: active=!!snapshot?.runId;
  $: matching=!!snapshot&&group?.group?.id===snapshot.groupId&&group.identity.id===snapshot.selfId;
  $: groupName=matching?group?.group?.name:'your saved group';
  $: status=state.busy?'Preparing connection…':!state.loaded?'Checking saved connection…':snapshot?.state==='connected'?matching&&group?.status==='hosting'?'Your group is open':'Group connected':snapshot?.state==='connecting-node'?'Connecting node Wi-Fi…':snapshot?.state==='connecting-group'?'Connecting group…':snapshot?.state==='reconnecting'?'Reconnecting when your node returns…':snapshot?.state==='stopping'?'Stopping connection…':snapshot?.state==='attention'?'Connection needs attention':snapshot?.state==='starting'?'Starting connection…':snapshot?.canConnect?'Ready to resume':'Connect your trusted node';
  function same(a:TrustedConnectionSnapshot|undefined,b:TrustedConnectionSnapshot|undefined){return !!a&&!!b&&a.processId===b.processId&&a.revision===b.revision&&a.scopeDigest===b.scopeDigest;}
  async function review(){if(!snapshot?.canRemember||state.busy)return;reviewed=snapshot;mode=voiceSupported?'muted':'off';shareLocation=false;notice='';await tick();dialog.showModal();}
  async function confirm(){const chosen=reviewed;if(!chosen||!same(chosen,snapshot)){notice='Connection settings changed. Review the current connection before continuing.';dialog.close();reviewed=undefined;return;}dialog.close();reviewed=undefined;await client.rememberAndConnect(mode,chosen,shareLocation);}
  function cancel(){dialog.close();reviewed=undefined;}
</script>
<section class="card trusted-connection" class:compact aria-labelledby="trusted-connection-title" aria-busy={state.busy}>
  <div class="title-row"><h2 id="trusted-connection-title"><Wifi size={23}/>{compact?'Connection controls':'Your connection'}</h2><button class="square" aria-label="Refresh saved connection" disabled={state.busy} onclick={()=>void client.refresh()}><RefreshCw size={18}/></button></div>
  {#if !compact||snapshot?.state!=='connected'}<p class="connection-status" role="status">{status}</p>{/if}
  {#if snapshot?.state==='attention'}<p>Check your node and group connection, then reconnect.</p><div class="help-row"><span>How reconnection works</span><HelpButton title="How reconnection works"><p class="hint">The app joins your saved node Wi-Fi, verifies the current node, then restores the group. Data stays blocked until verification completes. Missing or revoked setup must be repaired first.</p></HelpButton></div>
  {:else if !active&&state.loaded}<p>Your saved group and a checked node connection are needed before you can use Resume.</p><button class="outline" onclick={onsetup}>Node connection settings</button>{/if}
  {#if active&&snapshot?.state==='connected'}
    {#if snapshot.voiceState==='ptt-ready'}<p class="ready-indicator" role="status">Push to talk ready · Hold to talk when you want to speak.</p>
    {:else if snapshot.voiceState==='muted'}<p class="hint">Voice joined · Microphone controls are on the Voice screen.</p>
    {:else if snapshot.voiceState==='pending-peer'||snapshot.voiceState==='waiting'}<p class="hint">Waiting for voice participants. Your microphone stays muted while voice reconnects.</p>
    {:else if snapshot.voiceState==='pending-foreground'}<p class="hint">Keep the app open to finish restoring voice.</p>
    {:else if snapshot.voiceState==='off'&&!compact}<p class="hint">Voice is off.</p>{/if}
  {/if}
  {#if active&&snapshot?.voiceState==='blocked'}<p class="hint" role="status">Voice needs attention. Open Voice controls to retry the call.</p>{/if}
  {#if active&&snapshot?.locationState==='sharing'}<p class="hint">Location sharing on for this group.</p>{:else if active&&snapshot?.locationState==='pending-foreground'}<p class="hint">Keep the app open to finish restoring location sharing.</p>{:else if active&&snapshot?.locationState==='blocked'}<p class="hint">Location sharing needs attention. Check its permissions in Location &amp; privacy.</p>{/if}
  {#if active&&snapshot?.state==='reconnecting'}<p class="hint">This trusted connection will resume when the node returns. A previous push-to-talk press is never resumed.</p>{/if}
  {#if state.error}<p class="connection-error" role="alert">{state.error}</p>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  <div class="connection-actions">
    {#if snapshot?.state==='attention'}<button class="primary" disabled={state.busy||!state.loaded||snapshot.configuration!=='ready'} onclick={()=>void client.reconnect()}>Reconnect</button>
    {:else if snapshot?.canConnect}<button class="primary" disabled={state.busy||!state.loaded} onclick={()=>void client.connect()}>Resume connection</button>
    {:else if snapshot?.canRemember}<button class="primary" disabled={state.busy||!state.loaded} onclick={()=>void review()}>Connect</button>{/if}
    {#if active}<button class="outline" disabled={state.busy||!state.loaded||snapshot?.state==='stopping'} onclick={()=>void client.disconnect()}>Stop connection</button>{/if}
  </div>
  {#if snapshot?.remembered}<div class="help-row"><span>Saved choices</span><HelpButton title="Saved connection choices"><p class="hint">{snapshot.voiceMode==='ptt-ready'?'Rejoin voice with Push to talk ready. Nothing is sent until a fresh press.':snapshot.voiceMode==='muted'?'Rejoin voice muted. Unmute is required before talking.':'Reconnect the group only. Voice remains off.'} Stop ends automatic recovery until you press Resume. After the app process restarts, Resume is required. {snapshot.shareLocation?'Your position can be shared with this group while this connection is active. Stopping sharing keeps it off until a later explicit Resume.':'Location sharing was not enabled by this choice.'}</p></HelpButton></div><button class="text-button forget-choice" disabled={state.busy||!state.loaded} onclick={()=>void client.forget()}>Forget saved choice</button>{/if}
</section>
<dialog class="trusted-dialog" bind:this={dialog} aria-labelledby="trusted-dialog-title" onclose={()=>reviewed=undefined}>
  <h2 id="trusted-dialog-title"><ShieldCheck size={23}/>Remember this trusted connection?</h2>
  <p>Use this phone’s checked node and {groupName}. While connected, AuMaNET can reconnect this verified group when range returns. Changed node, group or approved-member settings need another review.</p>
  <fieldset><legend>When voice returns</legend>
    {#if voiceSupported}<label><input type="radio" bind:group={mode} value="muted"/> <span><strong>Join voice muted</strong><small>Requires Unmute before talking.</small></span></label><label><input type="radio" bind:group={mode} value="ptt-ready"/> <span><strong>Use Push to talk · Ready to speak</strong><small>Rejoin voice with the microphone ready for Push to talk. Nothing is sent until a new Hold to talk press. Always on is not restored.</small></span></label>{/if}
    <label><input type="radio" bind:group={mode} value="off"/> <span><strong>Group only</strong><small>Keep voice off until I join it.</small></span></label>
  </fieldset>
  <fieldset><legend>Map sharing</legend><label><input type="checkbox" bind:checked={shareLocation}/><span><strong>Share my position with this group while connected</strong><small>Pauses when the connection is lost, then resumes only for this trusted group. You can stop sharing independently.</small></span></label></fieldset>
  <p class="hint">Android may ask to use this local Wi-Fi and for notification, microphone or location permission. Other apps can keep using cellular. The connection runs for up to two hours; its Stop control ends recovery. Your location is shared only if you selected the map option.</p>
  <div class="connection-actions"><button class="outline" onclick={cancel}>Cancel</button><button class="primary" onclick={()=>void confirm()}>Remember &amp; connect</button></div>
</dialog>
<style>
  .trusted-connection{min-width:0}.trusted-connection h2,.trusted-dialog h2{display:flex;gap:10px;align-items:center}.trusted-connection p,.trusted-dialog p{line-height:1.6}.connection-status{font-weight:700}.connection-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.connection-actions button{min-height:44px;white-space:normal;max-width:100%}.connection-error{padding:12px;border-radius:10px;background:var(--error-bg);color:var(--error-ink)}.ready-indicator{font-weight:650;color:var(--brand-ink,var(--ink))}.trusted-dialog{max-width:530px;max-height:calc(100dvh - 32px);overflow:auto;width:calc(100% - 32px);border:1px solid var(--line);border-radius:18px;padding:22px;background:var(--paper,var(--bg));color:var(--ink)}.trusted-dialog::backdrop{background:var(--scrim)}.trusted-dialog fieldset{min-width:0;width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;margin:18px 0}.trusted-dialog label{display:flex;gap:10px;align-items:flex-start;padding:10px 0;min-height:44px}.trusted-dialog label>span{flex:1;min-width:0;overflow-wrap:anywhere}.trusted-dialog input[type=radio]{flex:0 0 18px;min-width:18px;width:18px;min-height:18px;height:18px;padding:0;margin:4px 0 0;appearance:auto;accent-color:var(--green)}.trusted-dialog small{display:block;line-height:1.5;margin-top:5px}.trusted-dialog strong{overflow-wrap:anywhere}.trusted-dialog legend{font-weight:650;padding:0 6px}
.trusted-connection.compact{padding:0;border:0;background:transparent;box-shadow:none}.trusted-connection.compact .title-row{margin-bottom:8px}.trusted-connection.compact h2{font-size:0.875rem;color:var(--muted)}.trusted-connection.compact .connection-actions{margin-top:10px}.trusted-connection.compact .connection-actions button{flex:1}
.forget-choice{color:var(--muted);padding-inline:0;font-size:0.75rem}
</style>
