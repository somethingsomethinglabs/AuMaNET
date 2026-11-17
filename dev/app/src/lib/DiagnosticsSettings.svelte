<script lang="ts">
  import PanelHeading from './PanelHeading.svelte';
  export let page=false;
  export let onback:()=>void=()=>{};
  import HelpButton from "./HelpButton.svelte";
  import {onDestroy,onMount} from 'svelte';
  import {FileDown,Info,RefreshCw} from '@lucide/svelte';
  import {DiagnosticsClient,DiagnosticDownload,DIAGNOSTIC_FILENAME,DIAGNOSTIC_LIMITS,saveDiagnosticCollection,type DiagnosticExportBridge,type DiagnosticCollection,type DiagnosticComponent,type DiagnosticEvidence,type DiagnosticObservation} from './diagnostics';
  import {Capacitor,registerPlugin} from '@capacitor/core';
  import {nativeDiagnostics} from './native-diagnostics';
  export let client:DiagnosticsClient|undefined=undefined;
  export let exportBridge:DiagnosticExportBridge|undefined=Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AuMaNETDiagnosticsExport')?registerPlugin<DiagnosticExportBridge>('AuMaNETDiagnosticsExport'):undefined;
  export let group:unknown=undefined;
  export let voice:unknown=undefined;
  export let messages:unknown=undefined;
  export let node:unknown=undefined;
  export let location:unknown=undefined;
  export let nodeConnected=false;
  export let groupError=false;
  export let voiceError=false;
  export let messagesError=false;
  export let nodeError=false;
  export let locationError=false;
  // Evidence is set on the injected client, never inferred from a device name.
  export let evidence:DiagnosticEvidence='runtime';
  const fallback=nativeDiagnostics(),downloads=new DiagnosticDownload();
  const labels:Record<DiagnosticComponent,string>={node:'Phone to node',group:'Local group',messages:'Group text storage',voice:'Native voice',location:'Location service'};
  let activeClient:DiagnosticsClient,busy=false,alive=true,operation=0,error='',notice='',href='',copyAvailable=false;
  let collection:DiagnosticCollection|undefined;
  let saving=false,saveOperation=0;
  let seenGroup:unknown,seenVoice:unknown,seenMessages:unknown,seenNode:unknown,seenLocation:unknown;
  let groupAt:number|undefined,voiceAt:number|undefined,messagesAt:number|undefined,nodeAt:number|undefined,locationAt:number|undefined;
  $: activeClient=client??fallback;
  $: if(group!==seenGroup){seenGroup=group;groupAt=performance.now();}
  $: if(voice!==seenVoice){seenVoice=voice;voiceAt=performance.now();}
  $: if(messages!==seenMessages){seenMessages=messages;messagesAt=performance.now();}
  $: if(node!==seenNode){seenNode=node;nodeAt=performance.now();}
  $: if(location!==seenLocation){seenLocation=location;locationAt=performance.now();}
  onMount(()=>{copyAvailable=typeof navigator.clipboard?.writeText==='function';});
  function observation(state:unknown,receivedAt:number|undefined,failed:boolean):DiagnosticObservation{return {state,failed,...(receivedAt===undefined?{}:{receivedAt})};}
  async function collect(){
    if(busy||saving)return;const token=++operation;busy=true;error='';notice='';downloads.clear();href='';collection=undefined;
    try{
      const result=await activeClient.collect({group:observation(group,groupAt,groupError),voice:observation(voice,voiceAt,voiceError),messages:observation(messages,messagesAt,messagesError),
        node:{...observation(node,nodeAt,nodeError),connected:nodeConnected},location:observation(location,locationAt,locationError)});
      if(!alive||token!==operation)return;
      if(evidence==='fixture'&&result.report.evidence!=='fixture')throw new Error('fixture-client-required');
      collection=result;
      try{if(!exportBridge)href=downloads.prepare(result);}catch{error='Local downloads are unavailable here. You can select and copy the reviewed JSON below.';}
      notice='Redacted report ready. Review it before saving or sharing.';
    }catch{if(alive&&token===operation)error='The report could not be collected. Refresh to try again; no connection or permission was changed.';}
    finally{if(alive&&token===operation)busy=false;}
  }
  function clear(){++operation;++saveOperation;saving=false;busy=false;activeClient.clear();downloads.clear();href='';collection=undefined;error='';notice='Report cleared from this screen.';}
  async function save(){
    const selected=collection,bridge=exportBridge;if(!selected||!bridge||saving)return;
    const token=++saveOperation;saving=true;error='';notice='';
    try{const name=await saveDiagnosticCollection(bridge,selected);if(alive&&token===saveOperation&&collection===selected)notice=`Saved to Downloads/AuMaNET/${name}`;}
    catch{if(alive&&token===saveOperation&&collection===selected)error='File saving could not be confirmed. Check Downloads/AuMaNET before saving again, or copy the reviewed JSON.';}
    finally{if(alive&&token===saveOperation)saving=false;}
  }
  async function copy(){
    const selected=collection;if(!selected||!copyAvailable)return;
    try{await navigator.clipboard.writeText(selected.json);if(alive&&collection===selected)notice='Reviewed JSON copied. Choose where to share it.';}
    catch{if(alive&&collection===selected)error='Copy is unavailable here. Select the reviewed JSON below to copy it manually.';}
  }
  function age(value:number|null){return value===null?'Unknown':value>=DIAGNOSTIC_LIMITS.ageMs?'7 days or more':value<1000?'Less than 1 second':`${Math.floor(value/1000)} seconds`;}
  function bytes(value:number|undefined){return value===undefined?'Unknown':value>=1024**3?`${(value/1024**3).toFixed(2)} GiB`:`${Math.floor(value/1024)} KiB`;}
  onDestroy(()=>{alive=false;++operation;++saveOperation;activeClient?.cancel();fallback.cancel();downloads.dispose();});
</script>

<section class="card diagnostics-settings" aria-labelledby={page?'live-settings-title':'diagnostics-title'} aria-busy={busy||saving}>
  <PanelHeading title="Diagnostics & about" id="diagnostics-title" icon={Info} {page} {onback}/>
  <p class="hint">Collect a local status report without joining, reconnecting, requesting permissions or starting a test.</p>
  <div class="diagnostic-actions"><button class="primary" disabled={busy||saving} onclick={()=>void collect()}><RefreshCw size={16}/>{busy?'Collecting…':collection?'Refresh report':'Collect report'}</button>
    {#if collection||busy}<button class="outline" onclick={clear}>{busy?'Cancel collection':'Clear report'}</button>{/if}</div>
  {#if error}<p class="diagnostic-error" role="alert">{error}</p>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  {#if !collection}<p class="hint">Reports include version numbers, availability and bounded counts. Names, identities, messages, invites, keys, addresses and location coordinates are excluded.</p>{/if}
  {#if collection}
    {#if collection.report.evidence==='fixture'}<p class="diagnostic-fixture" role="status">Fixture report — supplied test data, not physical device evidence.</p>{/if}
    <dl class="about-values"><div><dt>Web package</dt><dd>{collection.report.webPackageVersion}</dd></div>
      <div><dt>Android package</dt><dd>{collection.report.native.metadata?.app.state==='available'?`${collection.report.native.metadata.app.version} · code ${collection.report.native.metadata.app.versionCode}`:'Not available'}</dd></div>
      <div><dt>Android API</dt><dd>{collection.report.native.metadata?.androidApi??'Not available'}</dd></div>
      <div><dt>App storage volume free</dt><dd>{bytes(collection.report.native.metadata?.volume.availableBytes)}</dd></div>
      <div><dt>App storage volume capacity</dt><dd>{bytes(collection.report.native.metadata?.volume.totalBytes)}</dd></div></dl>
    <p class="hint">Volume capacity is the filesystem containing app files, not space used by AuMaNET. Unavailable values have not been measured.</p>
    <div class="diagnostic-components">{#each collection.report.components as component}<details><summary>{labels[component.component]} <span>{component.availability}</span></summary>
      <p class="hint">Time since this screen received supplied state: {age(component.receivedAgeMs)}. The original measurement age is unknown; a supplied snapshot may already be cached.</p>
      {#if component.facts.length}<dl class="about-values">{#each component.facts as fact}<div><dt>{fact.label}</dt><dd>{typeof fact.value==='boolean'?(fact.value?'Yes':'No'):fact.value}</dd></div>{/each}</dl>{/if}
    </details>{/each}</div>
    <div class="help-row"><span>Registered native capabilities</span><HelpButton title="Registered native capabilities"><ul>{#each collection.report.capabilities as capability}<li>{capability.capability}: {capability.available===null?'Not reported':capability.available?'Registered':'Not registered'}</li>{/each}</ul><p class="hint">Registration reports availability, not successful hardware acceptance.</p></HelpButton></div>
    <div class="help-row"><span>Web implementation contracts</span><HelpButton title="Web implementation contracts"><ul>{#each collection.report.webImplementationContracts as contract}<li><code>{contract}</code></li>{/each}</ul></HelpButton></div>
    <div class="help-row"><span>Bounded collection events</span><HelpButton title="Bounded collection events"><p class="hint">Only fixed diagnostic collection codes are retained in memory. System and component logs are not collected.</p>
      {#if collection.report.logs.gap}<p class="hint" role="status">Log gap: {collection.report.logs.dropped} older collection events were dropped from the {DIAGNOSTIC_LIMITS.events}-event limit.</p>{/if}
      <ol>{#each collection.report.logs.events as event}<li><code>{event.code}</code> · {age(event.ageMs)} ago</li>{/each}</ol></HelpButton></div>
    <label class="review-label" for="diagnostics-reviewed-json">Reviewed JSON · {collection.bytes} bytes / {DIAGNOSTIC_LIMITS.bytes}-byte limit</label>
    <textarea id="diagnostics-reviewed-json" class="diagnostic-json" readonly rows="12" value={collection.json} spellcheck="false" aria-describedby="diagnostic-export-help"></textarea>
    <p id="diagnostic-export-help" class="hint">Saving exports exactly the JSON shown above. No automatic upload occurs. A status report does not establish speech quality, security or physical acceptance.</p>
    <div class="diagnostic-actions">{#if exportBridge}<button class="outline diagnostic-save" disabled={saving} onclick={()=>void save()}><FileDown size={16}/>{saving?'Saving reviewed JSON…':'Save reviewed JSON'}</button>{:else if href}<a class="button outline diagnostic-save" href={href} download={DIAGNOSTIC_FILENAME} target="_blank" rel="noopener noreferrer" onclick={()=>notice='Download requested. Saving depends on this app’s browser; the reviewed JSON remains available below.'}><FileDown size={16}/>Save reviewed JSON</a>{/if}
      <button class="outline" disabled={!copyAvailable} onclick={()=>void copy()}>Copy reviewed JSON</button></div>
  {/if}
  <div class="help-row"><span>Recovery steps</span><HelpButton title="Recovery steps"><p class="hint">Refresh this report to collect again. If a component is unavailable, open its page and use its explicit reconnect or retry controls. For a voice interruption, keep the microphone muted and use Leave, then Join when ready. This page does not change sessions or clear local history.</p></HelpButton></div>
</section>

<style>
  .diagnostics-settings{min-width:0}.diagnostic-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}.diagnostic-actions button,.diagnostic-save{display:inline-flex;align-items:center;justify-content:center;gap:7px;max-width:100%;white-space:normal}.diagnostic-save{padding:11px 16px;border-radius:9px;min-height:44px;text-decoration:none;border:1px solid var(--line,#cdd7cc);font-size:14px;font-weight:650;color:var(--ink,#153525);background:var(--card,#fff)}.about-values{font-size:13px;margin:14px 0}.about-values>div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:9px 0;border-bottom:1px solid var(--line,#dde4db)}.about-values dt,.about-values dd{min-width:0;overflow-wrap:anywhere}.about-values dd{margin:0;font-weight:650}.diagnostics-settings details{margin-top:12px;min-width:0}.diagnostics-settings summary{min-height:44px;cursor:pointer;padding:11px 0;font-size:13px;font-weight:650}.diagnostics-settings summary span{font-weight:400;margin-left:8px;color:var(--muted)}.diagnostics-settings li{font-size:12px;overflow-wrap:anywhere;margin:8px 0}.diagnostics-settings code{font-size:11px;overflow-wrap:anywhere}.diagnostic-error,.diagnostic-fixture{font-size:13px;padding:12px;border-radius:9px;overflow-wrap:anywhere}.diagnostic-error{background:var(--error-bg,#fff0e7);color:var(--error-ink,#9f301f)}.diagnostic-fixture{background:var(--sage,#eef4e9);font-weight:650}.review-label{display:block;font-size:12px;font-weight:650;margin:20px 0 9px}.diagnostic-json{display:block;width:100%;box-sizing:border-box;resize:vertical;max-height:500px;min-height:180px;font:11px/1.5 monospace;padding:12px;white-space:pre;overflow:auto;color:var(--ink,#153525);background:var(--card,#fff);border:1px solid var(--line,#cdd7cc);border-radius:9px}
</style>
