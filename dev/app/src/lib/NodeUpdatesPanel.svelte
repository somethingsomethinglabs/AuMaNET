<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import BrandIcon from './BrandIcon.svelte';
  import {onMount} from 'svelte';
  import {Download,RefreshCw,Upload,Square,CheckCircle,Router} from '@lucide/svelte';
  import type {NativeNodeUpdatesClient,NodeUpdatesView} from '@aumanet/core';
  import type {GroupSnapshot,NodeReleaseChannel} from '@aumanet/protocol';
  import {releaseChannelNames,updatePhases,updateActive,firmwareSummary,nodeReleases,updateProgress,updateError} from './node-updates-view';
  export let client:NativeNodeUpdatesClient|undefined=undefined;
  export let group:GroupSnapshot|undefined=undefined;
  export let nodeNames:Readonly<Record<string,string>>={};
  export let selectedNodeId='';
  let view:NodeUpdatesView|undefined=client?.state;
  let installDialog:HTMLDialogElement,powerConfirmed=false;
  let installReview:{scope:string;nodeId:string;nodeName:string;packageId:string;version:string;build:string;image:string}|undefined;
  const groupKey=()=>`${group?.group?.id??''}:${group?.identity.id??''}:${group?.group?.epoch??0}`;
  $: if(installReview&&installReview.scope!==groupKey()){installReview=undefined;installDialog?.close();}
  function reviewInstall(){if(!node||!cached||!release)return;powerConfirmed=false;installReview={scope:groupKey(),nodeId:node.nodeId,nodeName:name(node.nodeId),packageId:cached.packageId,version:release.version,build:release.buildId,image:release.imageSha256};installDialog.showModal();}
  async function confirmInstall(){const review=installReview;if(!review||!powerConfirmed||!client||review.scope!==groupKey()||active||view?.busy)return;await run(()=>client!.install(review.nodeId,review.packageId));if(installReview===review&&!client.state.error)installDialog.close();}
  let channel:NodeReleaseChannel='stable',branch='',selectedRelease='';
  onMount(()=>client?.subscribe(next=>view=next));
  $: snapshot=view?.snapshot;
  $: scoped=!!view?.loaded&&!view.error&&!!group?.group&&snapshot?.scope?.groupId===group.group.id&&snapshot.scope.selfId===group.identity.id&&snapshot.scope.epoch===group.group.epoch;
  $: nodes=scoped?snapshot?.nodes??[]:[];
  $: node=nodes.find(value=>value.nodeId===selectedNodeId);
  $: releases=nodeReleases(scoped?snapshot:undefined,node);
  $: visibleReleases=releases.filter(value=>value.channel===channel&&(channel!=='branch'||value.gitRef===branch));
  $: release=visibleReleases.find(value=>value.releaseDigest===selectedRelease);
  $: cached=release?snapshot?.cachedPackages.find(value=>value.releaseDigest===release.releaseDigest):undefined;
  $: operation=scoped?snapshot?.operation:undefined;
  $: active=updateActive(operation);
  $: progress=updateProgress(operation);
  $: installed=node?.identityStatus==='verified'?node.identity:undefined;
  $: sameImage=!!installed&&installed.imageSha256===release?.imageSha256;
  $: owned=!!snapshot?.owner&&scoped;
  $: if(selectedRelease&&!visibleReleases.some(value=>value.releaseDigest===selectedRelease))selectedRelease='';
  $: if(branch&&!snapshot?.branches.includes(branch))branch='';
  const name=(id:string)=>nodeNames[id]??(nodes.find(value=>value.nodeId===id)?.role==='A'?'Main node':'Following node');
  function date(seconds:number|undefined){return seconds?new Date(seconds*1000).toLocaleString():'Not checked';}
  function bytes(value:number){return value>=1048576?`${(value/1048576).toFixed(2)} MiB`:`${Math.ceil(value/1024)} KiB`;}
  async function run(work:()=>Promise<unknown>){try{await work();}catch{/* Scoped native client publishes a fixed error; never replay a command. */}}
  function chooseNode(id:string){selectedNodeId=id;selectedRelease='';}
</script>
<section class="node-updates" aria-label="Node firmware updates">
  <section class="card"><div class="update-heading"><BrandIcon name="node"/><h2>Your node</h2>{#if client&&group?.group}<label class="field node-picker">Node<select value={selectedNodeId} disabled={active} onchange={event=>chooseNode(event.currentTarget.value)}><option value="">Choose a node</option>{#each nodes as item(item.nodeId)}<option value={item.nodeId}>{name(item.nodeId)}</option>{/each}</select></label>{/if}</div>
    {#if !client}<p role="status">Wireless updates are unavailable in this app version. Your existing node details remain available.</p>
    {:else if !group?.group}<p>Connect to your approved group before checking a node’s firmware.</p>
    {:else}
      {#if view?.error}<p class="update-error" role="alert">{view.error}</p>{/if}{#if snapshot?.errorCode}<p class="update-error" role="alert">{updateError(snapshot.errorCode)}</p>{/if}{#if view?.notice}<p role="status">{view.notice}</p>{/if}
      {#if !scoped}<p role="status">{view?.loaded||view?.error?'Firmware status is unavailable. Reopen this page after checking your group connection.':'Checking firmware status…'}</p>
      {:else if !nodes.length}<p class="hint">No checked nodes are available. Keep the nodes powered and reconnect to your group.</p>
      {:else if node}
        <div class="installed-firmware"><h3 class="visually-hidden">Installed on {name(node.nodeId)}</h3><div class="firmware-hero"><span class="node-illustration"><BrandIcon name="node" size={36}/></span><div><small class="eyebrow">Currently running</small><strong class="firmware-version">{installed?.version??firmwareSummary(node)}</strong></div></div>
          {#if installed}<dl class="firmware-evidence"><div><dt>Build identity</dt><dd>{installed.buildId}</dd></div><div><dt>Image identity</dt><dd title={installed.imageSha256}>sha256:{installed.imageSha256.slice(0,10)}…{installed.imageSha256.slice(-8)}</dd></div><div><dt>Boot identity</dt><dd title={installed.bootRun}>{installed.bootRun.slice(0,8)}…{installed.bootRun.slice(-8)}</dd></div><div><dt>Battery evidence</dt><dd>Not reported · confirm external power</dd></div></dl><details class="firmware-details"><summary>Build information</summary><p class="hint">Authenticated node report · received {Math.ceil(node.observedAgeMs/1000)} seconds ago. {installed.health==='valid'?'Boot confirmed':installed.health==='pending'?'New boot is awaiting confirmation':installed.health==='rollback'?'Node reports a rollback':installed.health==='failed'?'Node reports a failed boot':'Boot health unavailable'}</p><dl><div><dt>Commit</dt><dd>{installed.commit}</dd></div><div><dt>Image SHA-256</dt><dd>{installed.imageSha256}</dd></div><div><dt>Boot identity</dt><dd>{installed.bootRun}</dd></div><div><dt>Running slot</dt><dd>{installed.runningSlot}</dd></div></dl><button class="text-button" disabled={view?.busy||active} onclick={()=>client&&void run(()=>client.refreshNode(node!.nodeId))}>Check node status</button></details>
          {:else if node.identityStatus==='unsupported'}<p class="hint">This firmware does not support wireless updates. A one-time USB setup is required; a wireless update cannot replace the bootloader or partition layout.</p>
          {:else}<p class="hint">The node’s installed version has not been verified. It will not be inferred from the phone app or a previous upload.</p>{/if}
          {#if !installed}<button class="text-button" disabled={view?.busy||active} onclick={()=>client&&void run(()=>client.refreshNode(node!.nodeId))}>Check node status</button>{/if}
        </div>
      {/if}
    {/if}
  </section>
  {#if client&&group?.group&&scoped}
    {#if operation}<section class="card update-operation" aria-live="polite"><h3>{operation.phase==='complete'&&!operation.nodeId?'Package verified and ready':updatePhases[operation.phase]}</h3><p class="hint">{operation.nodeId?name(operation.nodeId):'Package on this phone'}</p>
      {#if ['downloading','uploading'].includes(operation.phase)}{#if progress!==undefined}<progress max="100" value={progress} aria-label={operation.phase==='downloading'?'Firmware download':'Firmware upload'}></progress><p>{bytes(operation.bytes)} of {bytes(operation.totalBytes)} · {Math.floor(progress)}%</p>{:else}<p>Waiting for a measured transfer size…</p>{/if}{/if}
      {#if ['activating','waiting-reboot','confirming','unknown'].includes(operation.phase)}<p class="hint">Keep the node powered. A lost connection does not prove the update failed. Check its firmware before another installation.</p>{/if}
      {#if operation.phase==='complete'}<p><CheckCircle size={17}/>{operation.nodeId?'The native update process confirmed the selected firmware on a new boot.':'The package is verified on this phone. Nothing has been installed on a node.'}</p>{/if}
      {#if operation.phase==='rolled-back'}<p>The native update process confirmed the previous firmware. Check the node before trying a different release.</p>{/if}
      {#if operation.canCancel}<button class="outline full" onclick={()=>client&&void run(()=>client.cancel())}><Square size={17}/>Cancel this operation</button>{/if}
    </section>{/if}
    {#if node}<section class="card"><h2>Update package</h2>
      <div class="catalog-controls"><label class="field">Release catalog<select aria-label="Release channel" value={channel} disabled={view?.busy||active} onchange={event=>channel=event.currentTarget.value as NodeReleaseChannel}>{#each [{value:'stable',label:'Stable'},{value:'beta',label:'Beta'},{value:'nightly',label:'Nightly'},...(snapshot?.branches.length?[{value:'branch',label:'Git build'}]:[])] as option}<option value={option.value}>{option.label}</option>{/each}</select></label><button class="outline" disabled={view?.busy||active||channel==='branch'&&!branch} onclick={()=>client&&void run(()=>client.checkReleases(channel,channel==='branch'?branch:undefined))}><RefreshCw size={17}/>Check releases</button></div>
      <p class="hint" hidden={channel==='stable'}>{channel==='stable'?'Stable is the normal release channel. Only published, signed packages appear.':channel==='beta'?'Beta releases are for testing changes before stable release.':channel==='nightly'?'Nightly builds may contain unfinished changes.':'Git builds are development artifacts, not stable releases.'}</p>
      {#if channel==='branch'}<details open class="advanced-build"><summary>Advanced Git build selection</summary><label class="field">Advertised Git ref<select bind:value={branch} disabled={view?.busy||active}><option value="">Choose an advertised ref</option>{#each snapshot?.branches??[] as ref}<option value={ref}>{ref}</option>{/each}</select></label><p class="hint">Only advertised signed builds are offered. A branch resolves to an exact commit and image; this phone does not compile arbitrary Git URLs.</p></details>{/if}

      <p class="hint">{snapshot?.feed.status==='not-checked'?'The signed release catalog has not been checked.':snapshot?.feed.status==='unavailable'?'The release catalog is unavailable. This does not mean your firmware is up to date.':snapshot?.feed.status==='invalid'?'The catalog could not be verified. Its releases cannot be selected.':`${snapshot?.feed.source==='usb-fixture'?'Local USB test catalog':'Verified catalog'} · checked ${date(snapshot?.feed.checkedAt)}`}</p>
      {#if !owned}<p class="hint">Use the group owner phone to download or install node firmware.</p>{/if}
      {#if node}
        {#if visibleReleases.length}<label class="field release-picker">Available or cached package<select bind:value={selectedRelease} disabled={view?.busy||active}><option value="">Choose a version</option>{#each visibleReleases as item(item.releaseDigest)}<option value={item.releaseDigest}>{item.version} · {item.buildId}{snapshot?.cachedPackages.some(value=>value.releaseDigest===item.releaseDigest)?' · Cached':''}</option>{/each}</select></label>
        {:else if snapshot?.feed.status!=='not-checked'&&snapshot?.feed.status!=='unavailable'}<p class="hint">No verified {releaseChannelNames[channel]} package for this node is available in the current catalog or cache.</p>{/if}
        {#if release}<div class="release-card"><h3>{release.version}</h3><p>{release.buildId} · {bytes(release.imageBytes)}</p><p class="hint">{releaseChannelNames[release.channel]} · {date(release.issuedAt)}{release.dirtySource?' · Includes uncommitted source changes':''}</p><div class="help-row"><span>Release notes and source</span><HelpButton title="Release notes and source"><p class="release-notes">{release.notes||'Release notes were not provided.'}</p><p class="hint">{release.gitRef}</p><p class="commit">Commit {release.commit}</p></HelpButton></div></div>
          {#if cached}<p class="cached-label"><CheckCircle size={17}/>Verified package cached on this phone</p>{:else}<button class="outline full" disabled={!owned||view?.busy||active||!snapshot?.releases.some(value=>value.releaseDigest===release?.releaseDigest)} onclick={()=>client&&void run(()=>client.download(release!.releaseDigest))}><Download size={17}/>Download and verify</button>{/if}
          <p class="install-impact">Install restarts {name(node.nodeId)} and interrupts its link, calls and transfers. Keep the node powered. Check Voice afterwards and unmute explicitly when ready.</p>
          <button class="primary full" disabled={!owned||!snapshot?.canInstall||!installed||!cached||sameImage||view?.busy||active} onclick={reviewInstall}><Upload size={17}/>{sameImage?'This image is already reported':`Install on ${name(node.nodeId)}`}</button>
        {/if}
      {:else}<p class="hint">Choose a node to see its compatible packages.</p>{/if}
    </section>
    {/if}
    <details class="update-help"><summary>Details & recovery help</summary><div class="help-row"><span>Before installing</span><HelpButton title="Before installing"><p>Choose the intended node and review the release notes. Download and verify the package first; a download never installs it. Keep the phone nearby and the node on a reliable power supply. Battery level is not assumed when the hardware cannot report it.</p></HelpButton></div><div class="help-row"><span>Reconnecting or outcome unknown</span><HelpButton title="Reconnecting or outcome unknown"><p>Keep the node powered and wait for its authenticated status. Use Check node status before another installation. Do not assume a missing reply means failure, and do not repeatedly press Install.</p></HelpButton></div><div class="help-row"><span>Rollback or USB setup required</span><HelpButton title="Rollback or USB setup required"><p>A rollback is shown only when native status confirms it. Firmware without a supported update layout needs the one-time USB setup. Wireless installation cannot change the bootloader or partition table. If the node cannot boot or reconnect, use the documented USB recovery process for this board.</p></HelpButton></div></details>
  {/if}
</section>
<dialog bind:this={installDialog} aria-labelledby="install-review-title" oncancel={event=>{if(view?.busy)event.preventDefault();}}><h2 id="install-review-title">Install on {installReview?.nodeName}?</h2>{#if installReview}<dl><div><dt>Exact node</dt><dd>{installReview.nodeId}</dd></div><div><dt>Version / build</dt><dd>{installReview.version} · {installReview.build}</dd></div><div><dt>Verified image</dt><dd>{installReview.image}</dd></div></dl><p>Installation restarts this node and interrupts its link, calls and transfers. Keep it powered. A lost reply requires rechecking its boot before another installation.</p><label class="switch-row"><span>This node has suitable, reliable power</span><input type="checkbox" bind:checked={powerConfirmed} disabled={view?.busy}/></label>{#if view?.error}<p class="update-error" role="alert">{view.error}</p>{/if}<div class="live-actions"><button class="outline" disabled={view?.busy} onclick={()=>installDialog.close()}>Cancel</button><button class="primary" disabled={!powerConfirmed||view?.busy||installReview.scope!==groupKey()} onclick={()=>void confirmInstall()}>Install verified package</button></div>{/if}</dialog>
<style>.installed-firmware .firmware-version{font:2.5rem Georgia,serif;line-height:1.2;margin:16px 0}.firmware-evidence{margin:12px 0}.firmware-evidence>div{display:grid;grid-template-columns:1fr 1.6fr;gap:12px;min-height:36px;font-size:.75rem;margin:0;padding:7px 0}.firmware-evidence dd{text-align:right;margin:0;word-break:normal}.installed-firmware{border:0!important;padding:0!important}

.node-updates{min-width:0}.update-heading{display:flex;align-items:center;gap:10px}.update-heading h2{font-size:1.0625rem;margin:0;flex:1}.node-picker{max-width:150px;margin:0!important;font-size:.6875rem!important;gap:4px}.node-picker select{margin:0}.firmware-hero{display:flex;align-items:center;gap:24px;padding:14px 8px}.firmware-hero>div{min-width:0}.node-illustration{display:grid;place-items:center;width:60px;height:76px;flex:none;border:1px solid var(--control-line);border-radius:12px;background:var(--sage);color:var(--accent)}.firmware-version{display:block;overflow-wrap:anywhere}.firmware-details{margin-top:0}.catalog-controls{display:flex;align-items:flex-end;gap:12px}.catalog-controls .field{flex:1;min-width:0;margin-bottom:0}.catalog-controls button{margin-bottom:0;flex:none}.catalog-controls+.hint{margin-top:14px}h2{font-size:1.188rem}h3{font-size:0.875rem}.hint{font-size:0.75rem;line-height:1.65;color:var(--muted)}.field{font-size:0.8125rem;margin-top:15px}.field select{width:100%;min-width:0;max-width:100%;min-height:44px}.installed-firmware,.release-card{border:1px solid var(--line);padding:13px;border-radius:13px;margin-top:14px}.installed-firmware .text-button{display:inline-flex;align-items:center;gap:7px}.node-updates button{min-height:44px;white-space:normal}.node-updates summary{min-height:44px;align-content:center;font-size:0.8125rem;font-weight:650;cursor:pointer}.update-error{color:var(--error-ink);overflow-wrap:anywhere;font-size:0.8125rem}.install-impact{padding:12px;background:var(--warning-bg);color:var(--warning-ink);border-radius:12px;font-size:0.75rem;line-height:1.65}.release-notes{white-space:pre-wrap;overflow-wrap:anywhere}.commit,dd{overflow-wrap:anywhere;font-size:0.75rem}dl>div{margin:10px 0}dt{font-size:0.75rem;color:var(--muted)}dd{margin:4px 0 0}.cached-label{display:flex;align-items:center;gap:7px;font-size:0.8125rem}.update-operation progress{width:100%;accent-color:var(--ink)}.update-operation>p{font-size:0.8125rem;line-height:1.6;overflow-wrap:anywhere}.update-help p{font-size:0.75rem;line-height:1.7;color:var(--muted)}.advanced-build label{margin:8px 0}
</style>
