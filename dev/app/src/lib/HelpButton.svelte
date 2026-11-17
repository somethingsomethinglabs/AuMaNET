<script lang="ts">
  import {Info,X} from '@lucide/svelte';
  export let title:string;
  export let label='';
  let dialog:HTMLDialogElement;
</script>
<button class="info-button" type="button" aria-label={label||title} aria-haspopup="dialog" onclick={()=>dialog.showModal()}><Info size={19}/></button>
<dialog class="help-dialog" bind:this={dialog} aria-label={title}>
  <div class="help-heading"><h2>{title}</h2><button class="close-help" type="button" aria-label={'Close '+title} onclick={()=>dialog.close()}><X size={21}/></button></div>
  <div class="help-content"><slot/></div>
</dialog>
<style>
  .info-button,.close-help{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:44px;min-height:44px;padding:10px;border:0;border-radius:10px;background:transparent;color:var(--muted,#657367);cursor:pointer}.info-button:hover,.close-help:hover{background:var(--soft,#f1f2e7)}.info-button:focus-visible,.close-help:focus-visible{outline:3px solid #ad6b20;outline-offset:2px}
  .help-dialog{width:calc(100% - 32px);max-width:460px;max-height:85dvh;overflow:auto;border:1px solid var(--line,#dedfd2);border-radius:20px;padding:20px;background:var(--card,#fffdf6);color:var(--ink,#173e2c)}.help-dialog::backdrop{background:#10291e88;backdrop-filter:blur(3px)}.help-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;position:sticky;top:-20px;background:var(--card,#fffdf6);z-index:1}.help-heading h2{margin:0;font-size:20px;line-height:1.25;overflow-wrap:anywhere}.help-content{font-size:13px;line-height:1.6;overflow-wrap:anywhere}.help-content :global(p){font-size:13px;line-height:1.6;margin:0 0 14px;color:var(--muted,#657367)}.help-content :global(p:last-child){margin-bottom:0}.help-content :global(output){display:block;overflow-wrap:anywhere}.help-content :global(button){max-width:100%}.help-content :global(dl){margin:0}
</style>
