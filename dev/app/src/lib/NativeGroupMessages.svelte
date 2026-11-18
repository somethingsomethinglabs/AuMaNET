<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  import HelpButton from './HelpButton.svelte';
  import {onMount,tick} from 'svelte';
  import type {NativeGroupMessagesClient} from '@aumanet/core';
  import type {NativeGroupMessagesSnapshot,GroupMessageRecord,GroupSnapshot} from '@aumanet/protocol';
  import {MessageCircle,RefreshCw,Settings,Image as ImageIcon,Radio,MapPin,CheckCheck,Info} from '@lucide/svelte';
  import {formatAccuracy} from './appearance/distance';
  import type {Units} from './appearance/preferences';
  import {messageTime,messageDate,messageDelivery,messageSignal,imageTransferStatus,imageTransferActive,receivingRate} from './messages/presentation';
  import ImageViewer from './messages/ImageViewer.svelte';
  export let client:NativeGroupMessagesClient;
  export let group:GroupSnapshot|undefined;
  export let units:Units='Metric';
  export let onconnect:()=>void=()=>{};
  export let embedded=false;
  export let active=true;
  let state:NativeGroupMessagesSnapshot|undefined=client.state;
  let pending=client.pendingSend;
  let sourceError='',error='',busy=false,alive=true,operation=0,scope='';
  let clearDialog:HTMLDialogElement;
  let container:HTMLElement;
  let settingsDialog:HTMLDialogElement;
  let detailsDialog:HTMLDialogElement,detailRow:GroupMessageRecord|undefined;
  let visibleCount=20,visibleImages=new Set<string>();
  let imageUrls:Record<string,string>={},imageErrors:Record<string,string>={},imageWorker=false;
  let transferEstimates:Record<string,string>={};
  const transferSamples=new Map<string,{at:number;bytes:number;rate:number}>();
  let observer:IntersectionObserver|undefined;
  let mediaGeneration=0;
  let viewerRow:GroupMessageRecord|undefined,viewerUrl='',viewerLoading=false,viewerError='',viewerNotice='',viewerSaving=false,viewerOperation=0;
  export function openOptions(){if(ready&&!busy)settingsDialog?.showModal();}
  $: if(!active){closeViewer();detailsDialog?.close();settingsDialog?.close();clearDialog?.close();}
  const imageVersions=new Map<string,number>();
  const imageHashes=new Map<string,string>();
  const rowKey=(row:GroupMessageRecord)=>row.senderId+':'+row.id;
  $: rows=[...(state?.history??[]),...(state?.outbox??[])].sort((a,b)=>a.createdAt-b.createdAt||a.storedAt-b.storedAt||rowKey(a).localeCompare(rowKey(b)));
  $: visibleRows=rows.slice(-visibleCount);
  function dropImage(id:string){imageHashes.delete(id);const url=imageUrls[id];if(url){URL.revokeObjectURL(url);const next={...imageUrls};delete next[id];imageUrls=next;}imageVersions.set(id,(imageVersions.get(id)??0)+1);}
  function closeViewer(){++viewerOperation;viewerRow=undefined;viewerLoading=false;viewerSaving=false;viewerError='';viewerNotice='';if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl='';}
  function clearImages(){closeViewer();mediaGeneration++;for(const url of Object.values(imageUrls))URL.revokeObjectURL(url);imageUrls={};imageErrors={};transferEstimates={};transferSamples.clear();imageVersions.clear();imageHashes.clear();visibleImages=new Set();visibleCount=20;}
  function retainCurrentImages(next:NativeGroupMessagesSnapshot|undefined){const ids=new Set([...next?.history??[],...next?.outbox??[]].map(rowKey));for(const id of Object.keys(imageUrls)){const row=[...next?.history??[],...next?.outbox??[]].find(item=>rowKey(item)===id);if(!row?.image||row.image.state!=="available"||imageHashes.get(id)!==row.image.sha256)dropImage(id);}for(const id of [...imageVersions.keys()])if(!ids.has(id)){dropImage(id);imageVersions.delete(id);mediaGeneration++;transferSamples.delete(id);}}
  async function openImage(row:GroupMessageRecord){
    if(!active||row.image?.state!=='available')return;closeViewer();viewerRow=row;viewerLoading=true;const captured=scope,token=viewerOperation;
    try{const image=await client.readImage(row);if(!alive||scope!==captured||token!==viewerOperation)return;viewerUrl=URL.createObjectURL(new Blob([new Uint8Array(image.bytes)],{type:image.mimeType}));}
    catch{if(alive&&scope===captured&&token===viewerOperation)viewerError='This photo could not be opened. Your saved messages are unchanged.';}
    finally{if(alive&&scope===captured&&token===viewerOperation)viewerLoading=false;}
  }
  async function savePhoto(){
    if(!viewerRow||viewerSaving||!client.supportsImageSave)return;const row=viewerRow,captured=scope,token=viewerOperation;viewerSaving=true;viewerError='';viewerNotice='';
    try{await client.saveImage(row);if(alive&&scope===captured&&token===viewerOperation)viewerNotice='Saved to Pictures / AuMaNET.';}
    catch(failure){if(alive&&scope===captured&&token===viewerOperation)viewerError=failure instanceof Error?failure.message:'Save could not be confirmed. Check Pictures / AuMaNET before trying again.';}
    finally{if(alive&&scope===captured&&token===viewerOperation)viewerSaving=false;}
  }
  function updateEstimates(next:NativeGroupMessagesSnapshot|undefined){
    const now=performance.now(),estimates:Record<string,string>={};
    for(const row of [...next?.history??[],...next?.outbox??[]])if(imageTransferActive(row,!!next?.deliveryPaused||!!next?.benchmarkPaused,!!next?.connected)&&row.image){
      const id=rowKey(row),previous=transferSamples.get(id),bytes=row.image.receivedBytes;
      let rate=previous?.rate??0;
      if(previous&&now>previous.at&&bytes>previous.bytes)rate=rate>0?0.5*rate+0.5*(bytes-previous.bytes)/((now-previous.at)/1000):(bytes-previous.bytes)/((now-previous.at)/1000);
      if(!previous||bytes!==previous.bytes)transferSamples.set(id,{at:now,bytes,rate});
      if(rate>0&&previous&&now-previous.at<10000){const seconds=Math.ceil((row.image.totalBytes-bytes)/rate);estimates[id]=`Recent rate ${receivingRate(rate)} · `+(seconds>=60?`About ${Math.ceil(seconds/60)} min remaining`:`About ${Math.max(1,seconds)} s remaining`);}
      else estimates[id]='Estimating time remaining…';
    }
    for(const id of transferSamples.keys())if(!Object.prototype.hasOwnProperty.call(estimates,id))transferSamples.delete(id);
    transferEstimates=estimates;
  }
  async function workImages(){
    if(imageWorker||!alive)return;imageWorker=true;const captured=scope,generation=mediaGeneration;
    try{
      for(const row of [...rows].reverse()){
        const id=rowKey(row);if(captured!==scope||generation!==mediaGeneration||!alive)break;
        if(!row.image||!visibleImages.has(id)||imageUrls[id])continue;
        try{
          if(row.image.state==='available'){
            if(Object.keys(imageUrls).length>=12)continue;
            const version=imageVersions.get(id)??0;
            const content=await client.readImage(row);if(captured!==scope||generation!==mediaGeneration||!alive)break;
            const current=[...state?.history??[],...state?.outbox??[]].find(item=>rowKey(item)===id);
            if(!visibleImages.has(id)||(imageVersions.get(id)??0)!==version||current?.image?.state!=='available'||current.image.sha256!==row.image.sha256||current.image.byteLength!==row.image.byteLength)continue;
            imageHashes.set(id,content.sha256);imageUrls={...imageUrls,[id]:URL.createObjectURL(new Blob([new Uint8Array(content.bytes)],{type:content.mimeType}))};imageErrors={...imageErrors,[id]:''};
          }
        }catch(failure){if(captured===scope&&generation===mediaGeneration&&alive)imageErrors={...imageErrors,[id]:failure instanceof Error?failure.message:'Image unavailable. Try again.'};}
      }
    }finally{imageWorker=false;}
  }
  function watchImage(node:HTMLElement,row:GroupMessageRecord){
    const id=rowKey(row);imageVersions.set(id,(imageVersions.get(id)??0)+1);node.dataset.imageKey=id;observer?.observe(node);
    return{destroy(){observer?.unobserve(node);visibleImages.delete(id);dropImage(id);}};
  }
  async function loadOlder(){const main=(container?.closest<HTMLElement>('[data-screen-scroll]')??container?.closest('main')),height=main?.scrollHeight??0,top=main?.scrollTop??0;visibleCount+=20;await tick();if(main)main.scrollTop=top+main.scrollHeight-height;}
  async function retryImage(row:GroupMessageRecord){const id=rowKey(row);imageErrors={...imageErrors,[id]:''};await run(async()=>{if(state?.deliveryPaused)await client.resumeDelivery();await client.fetchImage(row);});}
  $: selected=!!group?.group;
  $: ready=!!state?.scope&&state.storeReady&&client.synced&&!sourceError;
  $: imageSaveAvailable=!!state?.imageSaveAvailable&&client.supportsImageSave;
  const scopeKey=(value:NativeGroupMessagesSnapshot|undefined)=>value?.scope?`${value.scope.groupId}:${value.scope.selfId}:${value.scope.epoch}`:'';
  function name(id:string){return id===state?.scope?.selfId?'You':group?.members.find(member=>member.id===id)?.name??'Group member';}
  function time(value:number){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'Time unavailable';}
  function dateTime(value:number){const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():undefined;}
  function imageStatus(row:GroupMessageRecord){if(state?.benchmarkPaused&&row.image?.state!=='available'&&row.image?.state!=='expired')return'Paused for connection maintenance';return imageTransferStatus(row,!!state?.deliveryPaused||!!state?.benchmarkPaused,!!state?.connected);}
  function imageActive(row:GroupMessageRecord){return imageTransferActive(row,!!state?.deliveryPaused||!!state?.benchmarkPaused,!!state?.connected);}
  function compactDelivery(row:GroupMessageRecord){if(row.state==='received')return 'Saved';if(['unconfirmed','delivered'].includes(row.state)&&row.acknowledgedBy.length)return `${row.acknowledgedBy.length}/${row.recipients.length} stored`;return messageDelivery(row,!!state?.connected,!!state?.benchmarkPaused);}
  function receipt(row:GroupMessageRecord){
    const stored=row.kind==='image'?'Image announced':'Stored';
    if(row.state==='received')return row.kind==='image'?(row.image?.state==='available'?'Image received on this phone':'Image announcement received'):'Stored on this phone';
    if(row.state==='delivered')return row.recipients.length===1?(row.kind==='image'?'Image announced to recipient':`${stored} by recipient phone`):(row.kind==='image'?`Image announced to all ${row.recipients.length} recipients`:`${stored} by all ${row.recipients.length} recipients`);
    if(row.state==='expired')return'Expired · No further sends';
    if(row.state==='cancelled')return'Local retries stopped · Delivered copies remain';
    if(row.acknowledgedBy.length)return`${stored} by ${row.acknowledgedBy.length} of ${row.recipients.length} recipients · Others unconfirmed`;
    if(row.attempts>=row.attemptLimit)return'Not confirmed after five attempts';
    if(row.nextRetryAt)return`Awaiting receipt · Attempt ${row.attempts} of ${row.attemptLimit}${state?.connected?' · Automatic retry scheduled':' · Retry paused until connected'}`;
    return row.attempts?'Awaiting delivery confirmation':'Saved to send · Not yet attempted';
  }
  async function run(action:()=>Promise<unknown>){
    if(busy)return;const token=++operation;busy=true;error='';
    try{await action();if(alive&&token===operation)clearDialog?.close();}
    catch(failure){if(alive&&token===operation)error=failure instanceof Error?failure.message:'The message action could not be confirmed.';}
    finally{if(alive&&token===operation)busy=false;}
  }
  onMount(()=>{
    alive=true;
    const stop=client.subscribe(next=>{
      const main=(container?.closest<HTMLElement>('[data-screen-scroll]')??container?.closest('main'));
      const follow=!!main&&main.scrollHeight-main.scrollTop-main.clientHeight<120;
      // Do not drop the leading visible record when new messages arrive while
      // reading older history. Keep the same history window and append to it.
      if(scopeKey(next)===scope&&!follow)visibleCount+=Math.max(0,(next?.history.length??0)+(next?.outbox.length??0)-(state?.history.length??0)-(state?.outbox.length??0));
      const key=scopeKey(next);if(key!==scope){clearImages();detailRow=undefined;detailsDialog?.close();scope=key;++operation;busy=false;error='';clearDialog?.close();settingsDialog?.close();}
      state=next;sourceError='';retainCurrentImages(next);updateEstimates(next);
      if(detailRow){detailRow=[...next?.history??[],...next?.outbox??[]].find(row=>rowKey(row)===rowKey(detailRow!));if(!detailRow)detailsDialog?.close();}
      if(viewerRow){const current=[...next?.history??[],...next?.outbox??[]].find(row=>rowKey(row)===rowKey(viewerRow!));if(current?.image?.state!=='available'||current.image.sha256!==viewerRow.image?.sha256)closeViewer();}
      void tick().then(()=>{if(alive)void workImages();});
      if(follow)void tick().then(()=>{if(alive)main?.scrollTo({top:main.scrollHeight});});
    });
    const stopError=client.onError(message=>sourceError=message);
    const stopPending=client.subscribePending(value=>pending=value);
    const main=(container?.closest<HTMLElement>('[data-screen-scroll]')??container?.closest('main'));let previousScroll=main?.scrollTop??0,atLatest=true;
    const resize=new ResizeObserver(()=>{if(main&&main.clientHeight>0&&atLatest)main.scrollTop=main.scrollHeight;});if(main)resize.observe(main);
    const scroll=()=>{if(main&&main.clientHeight>0)atLatest=main.scrollHeight-main.scrollTop-main.clientHeight<80;if(main&&main.scrollTop<previousScroll&&main.scrollTop<100&&visibleCount<rows.length)void loadOlder();previousScroll=main?.scrollTop??0;};main?.addEventListener('scroll',scroll,{passive:true});
    observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=(entry.target as HTMLElement).dataset.imageKey!;if(entry.isIntersecting)visibleImages.add(id);else{visibleImages.delete(id);dropImage(id);}}void workImages();},{root:main,rootMargin:'80px'});
    container?.querySelectorAll<HTMLElement>('[data-image-key]').forEach(node=>observer!.observe(node));
    return()=>{alive=false;++operation;stop();stopError();stopPending();observer?.disconnect();resize.disconnect();main?.removeEventListener('scroll',scroll);clearImages();};
  });
</script>

<section bind:this={container} class="group-messages" aria-label="Group conversation" aria-busy={busy}>
  {#if !embedded}<div class="title-row conversation-heading"><div><p class="eyebrow">{group?.group?.name??'YOUR GROUP'}</p><h1>Messages</h1></div><div class="live-actions">
    <button class="square" aria-label="Conversation settings" disabled={!ready||busy} onclick={()=>settingsDialog.showModal()}><Settings size={19}/></button>
    <button class="square" aria-label="Refresh messages" disabled={!selected||busy} onclick={()=>void run(()=>client.refresh())}><RefreshCw size={20}/></button>
  </div></div>{/if}
  {#if error||sourceError||state?.error}<p class="message-error" role="alert">{error||sourceError||state?.error}</p>{/if}
  {#if !selected}<div class="empty"><MessageCircle size={40}/><p>Create a group or join with a private invitation.</p><button class="primary" onclick={onconnect}>Set up a group</button></div>
  {:else if !state?.scope}<p role="status">Loading this group’s saved messages…</p>
  {:else}
    {#if state.sync?.state==='syncing'||state.sync?.state==='failed'||!state.connected}<p class="conversation-status" role="status">{state.sync?.state==='syncing'?'Synchronizing messages…':state.sync?.state==='failed'?'History sync interrupted · Will resume when connected':'Offline · Messages saved on this phone'}</p>{/if}
    {#if state.benchmarkPaused}<p class="delivery-paused" role="status">Paused for connection maintenance. Saved messages and images stay on this phone.</p>{/if}
    {#if state.deliveryPaused}<div class="delivery-paused" role="status"><span>Automatic sending is paused. Saved messages remain on this phone.</span><button class="outline" disabled={!ready||!state.connected||busy} onclick={()=>void run(()=>client.resumeDelivery())}>Resume sending</button></div>{/if}
    {#if state.clockUncertain}<p class="message-error" role="status">This phone’s clock changed. Correct its date and time before sending or retrying.</p>{/if}
    {#if pending}<section class="card" aria-label="Unconfirmed send outcome"><h2>Send outcome not confirmed</h2><p>Your last send may already be saved. A new send is paused while its outcome is checked.</p><p class="hint">Stopping local tracking cannot recall copies already received.</p><div class="live-actions"><button class="outline" disabled={busy} onclick={()=>void run(()=>client.refresh())}>Check saved outcome</button><button class="outline" disabled={busy||!ready} onclick={()=>void run(()=>client.cancel(pending!.id))}>Stop local tracking</button></div></section>{/if}
    <div class="conversation" aria-label="Saved group history">
      {#if visibleCount<rows.length}<button class="outline older-messages" onclick={()=>void loadOlder()}>Load older messages</button>{/if}
      {#each visibleRows as row,index(row.senderId+row.id)}
      {#if index===0&&messageDate(row.createdAt)!==messageDate(Date.now())||index>0&&messageDate(visibleRows[index-1].createdAt)!==messageDate(row.createdAt)}<p class="message-date">{messageDate(row.createdAt)}</p>{/if}
      <article class="message" class:own={row.senderId===state.scope.selfId}>
        {#if row.senderId!==state.scope.selfId}<span class="message-avatar" aria-hidden="true">{name(row.senderId).trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]?.toUpperCase()).join('')}</span>{/if}
        <div class="message-card">{#if row.senderId!==state.scope.selfId}<strong class="sender-name">{name(row.senderId)}</strong>{/if}
        {#if row.image}<div class="image-message" use:watchImage={row}>
          {#if imageUrls[rowKey(row)]}<button class="open-photo" aria-label={`Open photo from ${name(row.senderId)}`} onclick={()=>void openImage(row)}><img src={imageUrls[rowKey(row)]} alt="Shared in the group" loading="lazy" width={row.image.width} height={row.image.height}/><span>Open photo</span></button>
          {:else}<div class="image-placeholder" role="status"><ImageIcon size={28}/><span>{imageStatus(row)}{imageActive(row)?` · ${Math.floor(100*row.image.receivedBytes/Math.max(1,row.image.totalBytes))}%`:''}</span>{#if imageActive(row)}<progress max={row.image.totalBytes} value={row.image.receivedBytes} aria-label="Image received"></progress>{/if}</div>{/if}
          {#if imageErrors[rowKey(row)]}<small class="message-error" role="status">{imageErrors[rowKey(row)]}</small>{/if}
          {#if imageActive(row)}<small class="transfer-estimate">{transferEstimates[rowKey(row)]??'Estimating time remaining…'}</small>{/if}
          {#if ['failed','cancelled'].includes(row.image.state)||imageErrors[rowKey(row)]}<button class="outline" disabled={!state.connected||busy} onclick={()=>void retryImage(row)}>Load image</button>{:else if imageActive(row)}<button class="text-button" onclick={()=>void run(()=>client.cancelImageTransfer(row))}>Pause image download</button>{/if}
        </div>{/if}
        {#if row.text}<div class="bubble">{row.text}</div>{/if}
        </div><div class="message-footnote"><time datetime={dateTime(row.createdAt)} title={`Sender phone time · ${time(row.createdAt)}`}>{messageTime(row.createdAt)}</time><span class="delivery-state" title={`${receipt(row)}. Delivery receipts do not mean a person has read the message.`}>{#if row.state==='delivered'}<CheckCheck size={14} aria-hidden="true"/>{/if}{compactDelivery(row)}</span>
          <button class="message-info" aria-label={`Message details from ${name(row.senderId)} at ${messageTime(row.createdAt)}`} onclick={()=>{detailRow=row;detailsDialog.showModal();}}>{#if row.sentContext?.location}<MapPin size={14} aria-hidden="true"/>{/if}<Info size={15} aria-hidden="true"/><span class="visually-hidden">Details</span></button>
        </div>

      </article>{/each}
    </div>
    {#if !state.history.length&&!state.outbox.length&&!pending}<div class="empty"><MessageCircle size={40}/><p>No saved messages for this group.</p></div>{/if}
  {/if}
</section>

<ImageViewer open={!!viewerRow} url={viewerUrl} title={viewerRow?`Photo from ${name(viewerRow.senderId)}`:'Group photo'} caption={viewerRow?.text??''} time={viewerRow?`${messageDate(viewerRow.createdAt)} · ${messageTime(viewerRow.createdAt)}`:''} loading={viewerLoading} error={viewerError} notice={viewerNotice} saving={viewerSaving} canSave={imageSaveAvailable} onsave={()=>void savePhoto()} onclose={closeViewer}/>

<dialog bind:this={detailsDialog} aria-labelledby="message-details-title"><h2 id="message-details-title">Message details</h2>{#if detailRow}<p><strong>{name(detailRow.senderId)}</strong> · {messageDate(detailRow.createdAt)} · {messageTime(detailRow.createdAt)}</p><p>{receipt(detailRow)}. This does not mean a person read it.</p>{#if detailRow.radioAtReceipt}{@const reading=messageSignal(detailRow)}{#if reading}<p class="inline-signal" aria-label={reading.description}><Radio size={15}/>{reading.label}</p><p class="hint">{reading.description}</p>{/if}{/if}{#if detailRow.sentContext?.location}{@const fix=detailRow.sentContext.location}<p class="inline-location"><MapPin size={15}/>Shared position · ±{formatAccuracy(fix.accuracyMeters,units)}</p><p>{fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}</p><p class="hint">Location shared when sent; fix {Math.ceil(fix.ageAtSendMs/1000)} seconds old. This is not the sender’s current position.</p>{/if}{/if}{#if detailRow&&state?.outbox.some(row=>row.id===detailRow?.id&&row.senderId===detailRow?.senderId)}<button class="danger" disabled={!ready||busy||!!pending} onclick={()=>void run(()=>client.cancel(detailRow!.id))}>Stop sending</button>{/if}<form method="dialog"><button class="outline">Close</button></form></dialog>

<dialog bind:this={settingsDialog} aria-labelledby="conversation-settings-title"><h2 id="conversation-settings-title">Conversation options</h2>
  <dl class="conversation-capacities"><div><dt>Text capacity</dt><dd>{state?.textByteLimit??'Unreported'} UTF-8 bytes per message</dd></div><div><dt>Draft capacity</dt><dd>4,096 UTF-8 bytes</dd></div><div><dt>Outbox / history</dt><dd>{state?.outbox.length??0} of 16 pending · {state?.history.length??0} of 128 records</dd></div><div><dt>Catch-up window</dt><dd>Up to 128 eligible messages in 24 hours</dd></div></dl><div class="help-row"><span>History &amp; privacy</span><HelpButton title="Message history & privacy">  <p>Messages synchronize when you reconnect. Up to 128 recent messages from the last 24 hours are available for catch-up. Saved local history can remain until cleared or removed under storage limits; synchronization cannot restore expired or evicted content.</p>
<p>A receipt means a phone stored a message, not that a person read it. Images download automatically in the background, at a lower rate during voice.</p><p>While location sharing is on, new messages can include your fresh position. Turning it off stops future sharing; it cannot remove positions already received. Sending never turns location sharing on.</p></HelpButton></div>
  {#if state?.historySharing?.ownerCanConfigure}<label class="switch-row"><span>Future new-member history</span><input type="checkbox" checked={state.historySharing.shareWithNewMembers} disabled={busy} onchange={event=>void run(()=>client.configureHistory({shareWithNewMembers:event.currentTarget.checked}))}/></label><p class="hint">New members can synchronize messages shared while this setting is enabled. It does not expose earlier private messages.</p>
  {:else}<p>{state?.historySharing?.shareWithNewMembers?'New members can receive history shared under the group policy.':'History is limited to the original recipients.'}</p>{/if}
  <button class="text-button" disabled={!selected||busy} onclick={()=>void run(()=>client.refresh())}>Refresh messages</button>
  <button class="outline" disabled={!ready||!state?.history.length||busy||!!pending} onclick={()=>{settingsDialog.close();clearDialog.showModal();}}>Clear local history</button>
  {#if error}<p class="message-error" role="alert">{error}</p>{/if}
  <button class="outline" onclick={()=>settingsDialog.close()}>Close</button>
</dialog>

<dialog bind:this={clearDialog} aria-labelledby="clear-group-history-title"><h2 id="clear-group-history-title">Clear local history?</h2><p>This removes saved conversation history for this group from this phone. Your draft and messages awaiting confirmation stay. Copies on other phones and nodes remain.</p><p class="hint">Delivery and duplicate-detection records are kept for their limited retention period.</p><div class="live-actions"><button class="outline" disabled={busy} onclick={()=>clearDialog.close()}>Cancel</button><button class="primary" disabled={!ready||busy||!!pending} onclick={()=>void run(()=>client.clearHistory())}>Clear history on this device</button></div></dialog>

<style>.conversation-capacities{margin-bottom:16px}.conversation-capacities>div{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:36px;font-size:.75rem}.conversation-capacities dd{margin:0;text-align:right;max-width:60%}dialog input[type=checkbox]{width:44px;min-width:44px}

  .conversation{display:flex;flex-direction:column;gap:22px;margin:0 auto;max-width:800px}.message{position:relative;max-width:92%;align-self:flex-start;margin-left:32px;min-width:0}.message.own{align-self:flex-end;margin-left:0;max-width:91%}.message-card{background:var(--card);border-radius:16px 16px 16px 4px;padding:10px 13px;overflow-wrap:anywhere}.own .message-card{background:var(--outbound);border-radius:16px 16px 4px 16px}.sender-name{display:block;font-size:0.75rem;line-height:1.5;font-weight:600;margin-bottom:5px}.bubble{font-size:0.875rem;line-height:1.5}.message-avatar{position:absolute;left:-32px;bottom:42px;background:var(--rust-bg);color:var(--rust-ink);border-radius:50%;width:28px;height:28px;display:grid;place-items:center;font-size:0.6875rem}.message:nth-of-type(3n) .message-avatar{background:var(--blue-bg);color:var(--blue-ink)}.message-footnote time{font-size:0.6875rem;flex:none}.message-date{margin:0;font-size:0.6875rem}.message-info{min-width:48px;justify-content:center}.message .image-message{border:0;border-radius:10px;margin:0 0 8px;max-width:100%}.message-footnote{font-size:0.6875rem!important;margin:4px 0 0!important;min-height:28px}.message-info{min-height:48px}.message-card .image-message img{max-height:340px}.message-info{margin-top:-8px;margin-bottom:-8px}

  .message-footnote{flex-direction:row!important;align-items:center!important;justify-content:space-between;gap:8px!important}.message.own .message-footnote{justify-content:flex-end}.message-info{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--muted);padding:0 6px;font-size:0.6875rem;min-height:48px}.inline-signal,.inline-location{display:flex;align-items:center;gap:6px}
  .message-date{text-align:center;color:var(--muted);font-size:0.6875rem;letter-spacing:.03em;margin:20px 0}.message-footnote{display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:0.6875rem;color:var(--muted);margin:6px 0 4px;line-height:1.5}.message.own .message-footnote{align-items:flex-end}.message-footnote>span{display:flex;align-items:center;gap:4px;max-width:100%;overflow-wrap:anywhere}.message-footnote :global(svg){flex-shrink:0}.message .open-photo{position:relative;padding:0;margin:0!important;border:0;border-radius:0;background:transparent;display:block;width:100%;color:var(--on-action);cursor:zoom-in}.open-photo>span{position:absolute;right:8px;bottom:8px;padding:5px 8px;background:#10291ed9;border-radius:7px;font-size:0.6875rem;font-weight:650}.open-photo:focus-visible{outline:3px solid var(--focus);outline-offset:-4px}
  .group-messages{min-width:0}.title-row,.live-actions{display:flex;align-items:center;gap:10px}.title-row{justify-content:space-between;flex-wrap:wrap}.live-actions{flex-wrap:wrap}.conversation{max-width:800px;margin:0 auto}.bubble{white-space:pre-wrap;overflow-wrap:anywhere}.message small{line-height:1.5}.message-error{color:var(--error-ink);background:var(--error-bg);padding:10px;border-radius:9px;overflow-wrap:anywhere}dialog{max-width:480px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:18px;padding:24px;background:var(--paper,var(--bg));color:var(--ink)}dialog::backdrop{background:var(--scrim)}dialog p{line-height:1.6}
  .conversation-status{font-size:0.75rem;color:var(--muted);min-height:18px}.delivery-paused{display:flex;align-items:center;gap:12px;font-size:0.75rem;flex-wrap:wrap}.image-message{width:min(100%,340px);margin:8px 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}.image-message img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain}.image-placeholder{display:flex;min-height:140px;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:var(--paper,var(--bg));padding:16px}.image-placeholder progress{max-width:100%}.image-message button{margin:8px}.older-messages{display:block;margin:12px auto}dialog label{display:flex;align-items:flex-start;gap:10px}dialog input{width:20px;min-width:20px;height:20px;flex:none;margin:3px 0}
</style>
