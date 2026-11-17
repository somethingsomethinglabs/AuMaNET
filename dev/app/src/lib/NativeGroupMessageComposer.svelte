<script lang="ts">
  import {onMount} from 'svelte';
  import type {NativeGroupMessagesClient} from '@aumanet/core';
  import {GROUP_MESSAGE_TEXT_BYTES,GROUP_MESSAGE_DRAFT_BYTES,groupMessageUtf8Bytes,type NativeGroupMessagesSnapshot} from '@aumanet/protocol';
  import {Send,ImagePlus} from '@lucide/svelte';
  import {prepareGroupImage,type PreparedGroupImage} from './messages/prepare-image';
  export let client:NativeGroupMessagesClient;
  let state:NativeGroupMessagesSnapshot|undefined=client.state,pending=client.pendingSend;
  let draft='',scope='',dirty=false,saving=false,busy=false,error='',sourceError='',saved='',alive=true,edit=0,operation=0;
  let lastWrite:Promise<unknown>=Promise.resolve();
  let picker:HTMLInputElement,previewDialog:HTMLDialogElement;
  let prepared:PreparedGroupImage|undefined,preview='',preparing=false,imageSending=false;
  let imageOperation=0;
  let preparation:AbortController|undefined;
  function clearImage(){imageOperation++;imageSending=false;preparation?.abort();preparation=undefined;prepared=undefined;if(preview)URL.revokeObjectURL(preview);preview='';previewDialog?.close();preparing=false;}
  async function chooseImage(file:File|undefined){
    if(!file)return;clearImage();const controller=new AbortController();preparation=controller;preparing=true;error='';const captured=scope;
    try{const image=await prepareGroupImage(file,controller.signal);if(!alive||captured!==scope||controller.signal.aborted)return;prepared=image;preview=URL.createObjectURL(new Blob([new Uint8Array(image.bytes)],{type:image.mimeType}));previewDialog.showModal();}
    catch(failure){if(alive&&captured===scope&&!controller.signal.aborted)error=failure instanceof Error?failure.message:'Image could not be prepared.';}
    finally{if(preparation===controller)preparing=false;if(picker)picker.value='';}
  }
  async function sendImage(){
    if(!prepared||!ready||!state?.canSendImage||imageSending||pending)return;const image=prepared,captured=scope,token=++imageOperation;imageSending=true;error='';
    try{let binary='';for(let offset=0;offset<image.bytes.length;offset+=8192)binary+=String.fromCharCode(...image.bytes.subarray(offset,offset+8192));await client.sendImage({dataBase64:btoa(binary),mimeType:image.mimeType,width:image.width,height:image.height,byteLength:image.bytes.length,sha256:image.sha256});if(alive&&scope===captured&&token===imageOperation)clearImage();}
    catch(failure){if(alive&&scope===captured&&token===imageOperation)error=failure instanceof Error?failure.message:'Image send could not be confirmed.';}
    finally{if(token===imageOperation)imageSending=false;}
  }
  const key=(value:NativeGroupMessagesSnapshot|undefined)=>value?.scope?`${value.scope.groupId}:${value.scope.selfId}:${value.scope.epoch}`:'';
  $: ready=!!state?.scope&&state.storeReady&&client.synced&&!sourceError;
  $: bytes=new TextEncoder().encode(draft).length;
  $: textLimit=state?.textByteLimit??GROUP_MESSAGE_TEXT_BYTES;
  $: sendReady=ready&&!!state?.canSend&&!pending&&!busy&&!imageSending&&!saving&&!dirty&&!!draft.trim()&&bytes<=textLimit;
  $: sendingStatus=!ready||pending?'':!state?.connected?'Reconnect to send. You can keep editing your draft.':state.clockUncertain?'Correct this phone’s date and time before sending.':state.benchmarkPaused?'Sending paused for connection maintenance.':state.deliveryPaused?'Sending paused. Resume sending above when ready.':!state.canSend?'Sending is unavailable. Your draft stays on this phone.':'';
  async function save(value:string){
    const token=++edit,captured=scope;dirty=true;error='';saved='';
    try{
      if(groupMessageUtf8Bytes(value)>GROUP_MESSAGE_DRAFT_BYTES)throw new Error(`Shorten this draft to ${GROUP_MESSAGE_DRAFT_BYTES} UTF-8 bytes to save it.`);
      saving=true;
      await client.saveDraft(value);
      if(!alive||token!==edit||captured!==scope)return;
      if(client.state?.draft!==value)throw new Error('The saved draft could not be confirmed.');
      dirty=false;saved='Saved on this phone';
    }catch(failure){if(alive&&token===edit&&captured===scope)error=failure instanceof Error?failure.message:'Draft not saved.';}
    finally{if(alive&&token===edit&&captured===scope)saving=false;}
  }
  function changed(value:string){draft=value;lastWrite=save(value);}
  async function send(){
    if(!sendReady)return;const token=++operation,captured=scope,text=draft;busy=true;error='';
    try{
      await lastWrite;
      if(captured!==scope||client.state?.draft!==text)throw new Error('Reload the saved draft before sending.');
      await client.send();
      if(!alive||token!==operation||captured!==scope)return;
      draft=client.state?.draft??'';dirty=false;saved=draft?'Saved on this phone':'';
    }catch(failure){if(alive&&token===operation&&captured===scope)error=failure instanceof Error?failure.message:'The send outcome could not be confirmed.';}
    finally{if(alive&&token===operation&&captured===scope)busy=false;}
  }
  onMount(()=>{
    alive=true;
    const stop=client.subscribe(next=>{
      const nextKey=key(next);
      if(scope!==nextKey){clearImage();scope=nextKey;++edit;++operation;draft=next?.draft??'';dirty=false;saving=false;busy=false;error='';saved=nextKey?'Saved on this phone':'';}
      else if(!dirty&&!saving&&!busy){draft=next?.draft??'';saved=nextKey?'Saved on this phone':'';}
      state=next;sourceError='';
    });
    const stopError=client.onError(message=>sourceError=message);
    const stopPending=client.subscribePending(value=>pending=value);
    return()=>{alive=false;clearImage();++operation;stop();stopError();stopPending();};
  });
</script>

<form class="composer group-composer" aria-label="Group message composer" onsubmit={event=>{event.preventDefault();void send();}}>
  <input class="file-picker" bind:this={picker} type="file" accept="image/jpeg,image/png" aria-label="Choose group image" onchange={event=>void chooseImage(event.currentTarget.files?.[0])}/>
  <button class="square attachment-button" type="button" aria-label="Attach image" disabled={!ready||!state?.canSendImage||busy||imageSending||preparing||!!pending} onclick={()=>picker.click()}><ImagePlus size={20}/></button>
  <div><input aria-label="Message group" placeholder={!state?.scope?'Choose your group in Network':state.connected?'Message your group':'Draft saved until you reconnect'} value={draft}
    oninput={event=>changed(event.currentTarget.value)} maxlength={GROUP_MESSAGE_DRAFT_BYTES} disabled={!ready||busy}/>
    {#if bytes>textLimit}<small class="invalid" role="status">This message is too long for the connected group. Shorten it before sending.</small>{:else if saving||dirty}<small>{saving?'Saving draft…':'Draft not saved'}</small>{/if}
    {#if sendingStatus}<small role="status">{sendingStatus}</small>{/if}
    {#if preparing}<small role="status">Preparing image…</small>{/if}
    {#if error||sourceError}<p class="draft-error" role="alert">{error||sourceError}</p>{/if}
    {#if dirty&&!saving&&!busy}<button class="text-button" type="button" disabled={!ready} onclick={()=>{lastWrite=save(draft);}}>Save draft again</button>{/if}
    {#if pending}<small role="status">Checking the previous send before accepting another.</small>{/if}
  </div><button class="primary square" aria-label="Send group message" type="submit" disabled={!sendReady}><Send size={20}/></button>
</form>

<dialog bind:this={previewDialog} aria-labelledby="image-preview-title" oncancel={event=>{if(imageSending)event.preventDefault();else clearImage();}}>
  <h2 id="image-preview-title">Send image to this group?</h2>
  {#if preview}<img class="image-preview" src={preview} alt="Ready to send"/>{/if}
  <p class="hint">A smaller copy will be sent with photo metadata removed. Your shared position is attached separately when location sharing is on.</p>
  {#if error}<p class="draft-error" role="alert">{error}</p>{/if}
  {#if sendingStatus}<p role="status">{sendingStatus}</p>{/if}
  <div class="image-actions"><button type="button" class="outline" disabled={imageSending} onclick={clearImage}>Cancel</button><button type="button" class="primary" disabled={!ready||!prepared||imageSending||!state?.canSendImage||!!pending} onclick={()=>void sendImage()}>{imageSending?'Sending…':'Send image'}</button></div>
</dialog>

<style>
  .group-composer{flex-shrink:0}.group-composer>div{flex:1;min-width:0}.group-composer>button{flex-shrink:0;align-self:center}.group-composer input{min-width:0}.group-composer small{font-size:11px;display:block;padding:4px;line-height:1.5}.invalid,.draft-error{color:#9f301f}.draft-error{margin:4px;font-size:12px;overflow-wrap:anywhere}.group-composer .text-button{font-size:12px;margin-left:4px}
  .file-picker{display:none}.attachment-button{align-self:center}dialog{max-width:460px;width:calc(100% - 32px);max-height:85dvh;overflow:auto;border:1px solid var(--line);border-radius:18px;padding:20px;background:var(--paper,#fbf8ef);color:var(--ink,#1d2d28)}dialog::backdrop{background:#10251fb3}.image-preview{display:block;max-width:100%;max-height:45dvh;margin:auto;object-fit:contain;border-radius:10px}.image-actions{display:flex;justify-content:flex-end;gap:10px}
  @media(min-width:800px){.group-composer{padding:14px 28px}}
  @media(max-height:450px){.group-composer{padding:6px 12px}}
</style>
