<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {ChevronRight,Image as ImageIcon,Info,Router,Smartphone,Users,X,CircleCheck,CircleHelp,CircleAlert,LoaderCircle,Radio,Gauge} from '@lucide/svelte';
  import RadioSignalDetails from './RadioSignalDetails.svelte';
  import BandwidthEstimator from './BandwidthEstimator.svelte';
  import {networkOverview,type NetworkOverviewInput} from './network-overview';
  import {networkNodes,type DeviceSelection,type NetworkNode} from './network-topology';
  export let state:NetworkOverviewInput={};
  export let dark=false;
  export let identifiedNodes:readonly NetworkNode[]|undefined=undefined;
  export let onstop:(()=>void)|undefined=undefined;
  export let onresume:(()=>void)|undefined=undefined;
  export let ongroup:()=>void;
  export let onmessages:()=>void;
  export let oninternet:()=>void;
  export let onbenchmark:()=>void=()=>{};
  export let ontools:(()=>void)|undefined=undefined;
  export let onradiosettings:()=>void=()=>{};
  export let ondevice:((selection:DeviceSelection)=>void)|undefined=undefined;
  let options:HTMLDialogElement,radioDetails:HTMLDialogElement,scenarioDetails:HTMLDialogElement;
  $: view=networkOverview(state);
  $: nodes=identifiedNodes??networkNodes(state.group,state.radioElapsedMs??0,!!state.groupError);
  $: ownNode=nodes.find(node=>node.yours);
  $: peers=nodes.filter(node=>!node.yours);
  $: phaseLabel=({connected:'Connected',connecting:'Connecting…',stopping:'Stopping…',disconnected:'Disconnected',unknown:'Not confirmed'} as Record<string,string>)[view.nodePhase];
  function inspectPhone(){if(state.group)ondevice?.({kind:'phone',id:state.group.identity.id});}
  function inspectNode(){if(ownNode&&ondevice)ondevice({kind:'node',id:ownNode.id});else openOptions();}
  function openOptions(){options.showModal();}
  function openDetail(action:()=>void){options.close();action();}
  export function closeOptions(){options?.close();}
</script>

<section class="network-overview" aria-labelledby="network-overview-title">
  <h1 id="network-overview-title">Network</h1>
  <section class="your-connection" aria-label="Your connection">
    <div class="connection-summary" data-phase={view.summaryPhase} role="status" aria-atomic="true">
      {#key view.summaryPhase}
        <span class="summary-symbol" aria-hidden="true">
          {#if view.needsAttention}<CircleAlert size={24}/>{:else if view.attached}<CircleCheck size={24}/>{:else if ['connecting','stopping'].includes(view.summaryPhase)}<LoaderCircle class="progress-symbol" size={24}/>{:else}<CircleHelp size={24}/>{/if}
        </span>
      {/key}
      <div><h2>{view.summaryTitle}</h2>{#if view.summaryDetail}<p>{view.summaryDetail}</p>{/if}</div>
    </div>
    <div class="connection-path" class:has-peers={peers.length>0} aria-label={peers.length?'Your phone, your node and identified radio nodes':'Your phone and your node'}>
      {#if state.group&&ondevice}
        <button class="path-stop phone-stop" onclick={inspectPhone} aria-label="View your phone details"><span class="device-symbol"><Smartphone size={34}/></span><span>Your phone</span></button>
      {:else}
        <div class="path-stop phone-stop"><span class="device-symbol"><Smartphone size={34}/></span><span>Your phone</span></div>
      {/if}
      <span class="path-link" role="img" data-phase={view.wifiPhase} aria-label={'Node Wi-Fi: '+(view.wifiAttached?'connected':phaseLabel)}>{#if view.wifiAttached}<CircleCheck size={15}/>{/if}</span>
      <button class="path-stop" data-phase={view.needsAttention?'attention':view.nodePhase} onclick={inspectNode} aria-label={ownNode?'View your node details':view.wifiAttached?'View connection details':'Set up your node'}><span class="device-symbol"><Router size={36}/></span><span>{ownNode||view.wifiAttached?'Your node':'Set up node'}</span></button>
      {#if peers.length}
        <span class="path-link" role="img" data-phase="unknown" aria-label="Radio connection not confirmed"></span>
        <button class="path-stop" data-phase="unknown" disabled={!ondevice} onclick={()=>ondevice?.({kind:'nodes'})} aria-label="View other nodes"><span class="device-symbol"><Router size={34}/></span><span>{peers.length} {peers.length===1?'other node':'other nodes'}</span></button>
      {/if}
    </div>
    {#if onresume&&state.trusted?.loaded&&(state.trusted.snapshot?.canConnect||state.trusted.snapshot?.state==='attention')}
      <button class="primary resume-node" disabled={state.trusted.busy} onclick={onresume}>{state.trusted.snapshot?.state==='attention'?'Try again':'Connect'}</button>
    {/if}
  </section>
  <div class="network-facts">
    <button class="fact-row" aria-label="Groups &amp; members" onclick={ongroup}><Users size={22}/><span><strong>Groups &amp; members</strong><small><span>{view.groupTitle}</span>{#if !['Open group settings to check','Create or join a group'].includes(view.groupDetail)} · <span>{view.groupDetail}</span>{/if}</small></span><ChevronRight size={18}/></button>
    <button class="fact-row internet-fact" onclick={oninternet}><Info size={22}/><span><strong>{view.internetTitle}</strong>{#if !['Open to check availability','Open for usage and Stop controls'].includes(view.internetDetail)}<small>{view.internetDetail}</small>{/if}</span><ChevronRight size={18}/></button>
    <button class="fact-row transfer-fact" onclick={onmessages}><ImageIcon size={22}/><span><strong>{view.transferTitle}</strong>{#if !['Transfers ready','Transfer status unavailable'].includes(view.transferTitle)}<small>{view.transferDetail}</small>{/if}</span><ChevronRight size={18}/></button>
    <button class="fact-row manage-connection" aria-label="Connection details" onclick={openOptions}><Router size={22}/><span><strong>Connection details</strong></span><ChevronRight size={18}/></button>
    <button class="fact-row" onclick={()=>scenarioDetails.showModal()}><Gauge size={22}/><span><strong>Plan bandwidth</strong><small>Text, positions, voice and downloads · estimates</small></span><ChevronRight size={18}/></button>
    {#if ontools}<button class="fact-row" onclick={ontools}><Gauge size={22}/><span><strong>Tools &amp; checks</strong><small>Connection tests, radio, voice and diagnostics</small></span><ChevronRight size={18}/></button>{/if}
  </div>
</section>

<dialog class="network-options-dialog live-appearance-dialog" class:dark bind:this={options} aria-labelledby="network-options-title">
  <div class="options-heading"><h2 id="network-options-title">Connection details</h2><button class="square" aria-label="Close node connection" onclick={()=>options.close()}><X size={21}/></button></div>
  {#if state.trusted}<div class="connection-stages" aria-label="Connection checks">
    <div data-phase={view.wifiPhase}><span>Node Wi-Fi</span><strong>{view.wifiAttached?'Connected':phaseLabel}</strong></div>
    <div data-phase={view.groupPhase}><span>Group session</span><strong>{view.groupPhaseLabel}</strong></div>
  </div>{/if}
  <div class="connection-controls"><slot/></div>
  <div class="detail-tools">
    <button class="fact-row" disabled={!ondevice} aria-label="Open nodes and phones" onclick={()=>openDetail(()=>ondevice?.({kind:'nodes'}))}><Router size={22}/><span><strong>Nodes &amp; phones</strong>{#if nodes.length}<small>{nodes.length} radio nodes identified</small>{/if}</span><ChevronRight size={18}/></button>
    <button class="fact-row radio-fact" aria-label="Open radio signal details" onclick={()=>openDetail(()=>radioDetails.showModal())}><Radio size={22}/><span><strong>Radio signal · {view.radioValue}</strong><small>{view.radioSignals.length?'Last-known node reading':'No node reading available'}</small></span><ChevronRight size={18}/></button>
    <button class="fact-row radio-settings-fact" onclick={()=>openDetail(onradiosettings)}><Radio size={22}/><span><strong>Radio settings</strong></span><ChevronRight size={18}/></button>
    <button class="fact-row benchmark-fact" onclick={()=>openDetail(onbenchmark)}><Gauge size={22}/><span><strong>Test connection</strong><small>Phone-to-phone speed</small></span><ChevronRight size={18}/></button>
  </div>
  {#if onstop&&view.active&&!$$slots.default}<button class="stop-connection" disabled={!view.canStop} onclick={onstop}>Stop connection</button>{/if}
</dialog>

<dialog class="network-options-dialog live-appearance-dialog" class:dark bind:this={radioDetails} aria-labelledby="network-radio-title">
  <div class="options-heading"><h2 id="network-radio-title">Radio signal</h2><button class="square" aria-label="Close radio signal details" onclick={()=>radioDetails.close()}><X size={21}/></button></div>
  <RadioSignalDetails signals={view.radioSignals} elapsedMs={state.radioElapsedMs??0}/>
  <div class="help-row"><span>About radio readings</span><HelpButton title="About radio readings"><p class="detail-note">This is the signal between radio nodes, separate from your phone’s Wi-Fi. Numbers closer to zero mean a stronger signal. The radio keeps a last-known reading; its sample age is unknown. A signal reading does not confirm message delivery.</p></HelpButton></div>
</dialog>

<dialog class="network-options-dialog live-appearance-dialog" class:dark bind:this={scenarioDetails} aria-labelledby="network-scenario-title">
  <div class="options-heading"><h2 id="network-scenario-title">Plan bandwidth</h2><button class="square" aria-label="Close bandwidth estimator" onclick={()=>scenarioDetails.close()}><X size={21}/></button></div>
  <BandwidthEstimator/>
</dialog>

<style>
  .network-overview{max-width:650px;margin:0 auto;color:inherit}h1{font-size:26px;font-weight:750;letter-spacing:-.7px;margin:0 0 22px}
  .connection-summary{display:flex;gap:11px;align-items:flex-start;min-height:52px}.summary-symbol{display:flex;padding-top:2px;color:var(--muted);flex-shrink:0}.connection-summary h2{font-size:22px;line-height:1.2;letter-spacing:-.45px;margin:0;font-weight:700}.connection-summary p{font-size:13px;line-height:1.5;color:var(--muted);margin:7px 0 0;max-width:42ch}
  [data-phase="connected"]{--state-color:#367b3e}[data-phase="attention"]{--state-color:#b13a35}[data-phase="connecting"],[data-phase="stopping"]{--state-color:#90611e}[data-phase="unknown"],[data-phase="disconnected"]{--state-color:var(--muted)}
  .connection-summary[data-phase="connected"] .summary-symbol{color:var(--state-color);animation:confirm .45s ease-out}.connection-summary[data-phase="attention"] .summary-symbol{color:var(--state-color)}
  .connection-summary :global(.progress-symbol){animation:spin 1.4s linear infinite}
  .connection-path{display:grid;grid-template-columns:90px minmax(44px,1fr) 90px;gap:8px;align-items:center;max-width:390px;margin:12px auto 16px;padding:12px 12px 20px}
  .connection-path.has-peers{grid-template-columns:minmax(0,1fr) 30px minmax(0,1fr) 30px minmax(0,1fr);gap:4px;max-width:none;padding-inline:0}
  .path-stop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;min-width:0;min-height:88px;padding:0;border:0;background:transparent;color:inherit}.path-stop:is(button){cursor:pointer}.path-stop:disabled{cursor:default}.path-stop>span:last-child{font-size:12px;font-weight:600;line-height:1.3;text-align:center;overflow-wrap:anywhere}.device-symbol{display:flex;align-items:center;justify-content:center;width:54px;height:48px;color:var(--ink)}
  .path-stop[data-phase="unknown"] .device-symbol,.path-stop[data-phase="disconnected"] .device-symbol{color:var(--muted)}.path-stop[data-phase="attention"] .device-symbol{color:var(--state-color)}
  .path-link{height:2px;position:relative;display:flex;align-items:center;justify-content:center;margin-bottom:25px;background:repeating-linear-gradient(90deg,var(--muted) 0 4px,transparent 4px 8px)}.path-link[data-phase="connected"]{background:var(--state-color);color:var(--state-color)}.path-link :global(svg){background:var(--card,#faf8ef);border-radius:50%;box-shadow:0 0 0 3px var(--card,#faf8ef);flex-shrink:0}
  .resume-node{width:100%;margin:0 0 16px}.network-facts{border-top:0}.fact-row{display:flex;gap:12px;align-items:center;width:100%;min-height:64px;padding:13px 0;border:0;border-bottom:1px solid var(--line);background:transparent;color:inherit;text-align:left;cursor:pointer}.fact-row>span{flex:1;min-width:0;overflow-wrap:anywhere}.fact-row :global(svg){flex-shrink:0}.fact-row strong{font-size:14px;font-weight:650;line-height:1.3}.fact-row small{display:block;font-size:12px;line-height:1.45;color:var(--muted);margin-top:3px}.path-stop:focus-visible,.fact-row:focus-visible{outline:3px solid #ad6b20;outline-offset:2px;border-radius:8px}
  .network-options-dialog{max-width:520px;width:calc(100% - 28px);max-height:85dvh;overflow:auto;padding:20px;color:var(--ink,#173e2c);background:var(--card,#fffdf6);border:1px solid var(--line,#dedfd2);border-radius:20px}.network-options-dialog::backdrop{background:#10291e80;backdrop-filter:blur(3px)}.options-heading{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}.options-heading h2{font-size:21px;margin:0}.options-heading button{flex-shrink:0}
  .connection-stages{display:grid;gap:9px;font-size:12px}.connection-stages>div{display:flex;gap:12px;align-items:center;justify-content:space-between}.connection-stages span{color:var(--muted)}.connection-stages strong{font-weight:600;color:var(--state-color)}.detail-note{font-size:12px;color:var(--muted);line-height:1.6;margin:13px 0 18px}.detail-tools{border-top:1px solid var(--line)}.stop-connection{width:100%;min-height:44px;margin-top:14px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;font-size:13px}
  :global(.dark) [data-phase="connected"]{--state-color:#a5d88b}:global(.dark) [data-phase="attention"]{--state-color:#ff9d95}:global(.dark) [data-phase="connecting"],:global(.dark) [data-phase="stopping"]{--state-color:#f1c477}
  @keyframes spin{to{transform:rotate(360deg)}}@keyframes confirm{from{transform:scale(.8);opacity:.4}to{transform:scale(1);opacity:1}}
  @media(prefers-reduced-motion:reduce){.connection-summary :global(.progress-symbol),.connection-summary[data-phase="connected"] .summary-symbol{animation:none}}
  @media(max-width:350px){.connection-summary h2{font-size:20px}.network-options-dialog{padding:14px}.connection-path{padding-inline:0;grid-template-columns:82px minmax(30px,1fr) 82px}}
  .options-heading{position:sticky;top:-20px;z-index:2;padding:10px 0;background:var(--card,#fffdf6);box-shadow:0 -12px 0 var(--card,#fffdf6)}
  .connection-controls{margin-top:18px}.detail-tools{margin-top:20px}
  @media(max-width:350px){.options-heading{top:-14px}}
  @media(max-width:350px){.connection-path.has-peers{grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1fr)}}
</style>
