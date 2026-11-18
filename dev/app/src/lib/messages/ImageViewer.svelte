<script lang="ts">
  import {tick,onDestroy} from 'svelte';
  import {holdDarkSystemBars} from '../native-system-bars';
  import {X,Download,ZoomIn,ZoomOut,Image as ImageIcon} from '@lucide/svelte';
  export let open=false;
  export let url='';
  export let title='Group photo';
  export let caption='';
  export let time='';
  export let loading=false;
  export let error='';
  export let notice='';
  export let saving=false;
  export let canSave=false;
  export let onsave:()=>void=()=>{};
  export let onclose:()=>void=()=>{};
  let dialog:HTMLDialogElement,zoomed=false,decodeError='';
  let releaseSystemBars:(()=>void)|undefined;
  $: if(open&&!releaseSystemBars)releaseSystemBars=holdDarkSystemBars();else if(!open&&releaseSystemBars){releaseSystemBars();releaseSystemBars=undefined;}
  onDestroy(()=>releaseSystemBars?.());
  $: if(dialog){if(open&&!dialog.open){zoomed=false;dialog.showModal();void tick().then(()=>dialog.querySelector<HTMLButtonElement>('[data-viewer-close]')?.focus());}else if(!open&&dialog.open)dialog.close();}
  $: {url;decodeError='';if(!url)zoomed=false;}
</script>
<dialog class="image-viewer" bind:this={dialog} aria-labelledby="image-viewer-title" onclose={onclose} oncancel={onclose}>
  <header><div><h2 id="image-viewer-title">{title}</h2>{#if time}<p>{time}</p>{/if}</div><button class="viewer-control" data-viewer-close aria-label="Close photo" onclick={onclose}><X size={25}/></button></header>
  <div class="viewer-picture" class:zoomed aria-busy={loading}>
    {#if url}<img src={url} alt={caption||'Photo shared with the group'} onerror={()=>decodeError='This photo could not be displayed.'}/>
    {:else}<div class="viewer-placeholder" role="status"><ImageIcon size={36}/><p>{loading?'Opening photo…':'Photo unavailable'}</p></div>{/if}
  </div>
  <footer>{#if caption}<p class="viewer-caption">{caption}</p>{/if}
    {#if error||decodeError}<p class="viewer-error" role="alert">{error||decodeError}</p>{/if}{#if notice}<p class="viewer-notice" role="status">{notice}</p>{/if}
    <div class="viewer-actions"><button class="viewer-control" aria-label={zoomed?'Fit photo to screen':'Enlarge photo'} aria-pressed={zoomed} disabled={!url||loading} onclick={()=>zoomed=!zoomed}>{#if zoomed}<ZoomOut size={22}/>{:else}<ZoomIn size={22}/>{/if}<span>{zoomed?'Fit to screen':'Enlarge'}</span></button>
      <button class="viewer-control save-photo" disabled={!url||loading||saving||!canSave} onclick={onsave}><Download size={22}/>{saving?'Saving…':'Save photo'}</button></div>
    {#if !canSave&&!loading}<p class="save-unavailable">Saving photos is unavailable in this version of the app.</p>{/if}
  </footer>
</dialog>
<style>
  .image-viewer{position:fixed;inset:0;width:100dvw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--field);color:var(--ink);overflow:hidden}.image-viewer[open]{display:flex;flex-direction:column}.image-viewer::backdrop{background:var(--field)}.image-viewer header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:max(12px,env(safe-area-inset-top)) 16px 12px;flex:none;background:var(--card)}.image-viewer h2{font-size:1.0625rem;line-height:1.35;margin:0;overflow-wrap:anywhere}.image-viewer header>div{min-width:0}.image-viewer header p{margin:4px 0 0;font-size:0.75rem;color:var(--muted)}.viewer-control{display:flex;align-items:center;justify-content:center;gap:8px;min-width:44px;min-height:44px;border:1px solid var(--control-line);border-radius:12px;padding:10px 12px;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer}.viewer-control:disabled{color:var(--disabled-ink);background:var(--disabled-bg);opacity:1;cursor:default}.viewer-control:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.viewer-picture{flex:1;min-height:0;overflow:auto;display:grid;place-items:center;overscroll-behavior:contain}.viewer-picture img{display:block;width:100%;height:100%;min-height:0;max-width:100%;max-height:100%;object-fit:contain}.viewer-picture.zoomed{display:block}.viewer-picture.zoomed img{width:200%;max-width:none;max-height:none;height:auto}.viewer-placeholder{padding:20px;display:grid;justify-items:center;color:var(--muted);text-align:center}.image-viewer footer{flex:none;padding:12px 16px max(12px,env(safe-area-inset-bottom));background:var(--card)}.viewer-actions{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.viewer-caption{margin:0 0 10px;font-size:0.875rem;line-height:1.5;max-height:20dvh;overflow:auto;overflow-wrap:anywhere}.viewer-error,.viewer-notice{margin:0 0 10px;font-size:0.8125rem;line-height:1.5;color:var(--error-ink)}.viewer-notice{color:var(--success-ink)}.save-photo{background:var(--green);color:var(--on-action);border-color:var(--green)}.save-unavailable{margin:8px 0 0;font-size:0.75rem;color:var(--muted)}@media(max-height:450px){.image-viewer header,.image-viewer footer{padding:7px 12px}.image-viewer header p{display:none}.viewer-control{min-height:40px;padding:7px 10px}.viewer-caption{max-height:12dvh;margin-bottom:6px}}
</style>
