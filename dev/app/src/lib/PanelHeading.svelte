<script lang="ts">
  import {ArrowLeft} from '@lucide/svelte';
  import type {Component} from 'svelte';
  export let title:string;
  export let id:string;
  export let page=false;
  export let icon:Component<any>|undefined=undefined;
  export let onback:()=>void=()=>{};
</script>
<div class="panel-heading" class:page>
  <svelte:element this={page?'h1':'h2'} id={page?'live-settings-title':id} tabindex={page?-1:undefined}>{#if icon&&!page}<svelte:component this={icon} size={22}/>{/if}{title}</svelte:element>
  <div class="heading-actions"><slot/>{#if page}<button class="square" type="button" aria-label="Back to settings" onclick={onback}><ArrowLeft size={22}/></button>{/if}</div>
</div>
<style>
  .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;min-width:0}.panel-heading :global(h1),.panel-heading :global(h2){display:flex;align-items:center;gap:8px;margin:0;min-width:0;overflow-wrap:anywhere;font-size:20px;line-height:1.25}.panel-heading.page :global(h1){font-size:24px;letter-spacing:-.6px}.heading-actions{display:flex;align-items:center;flex-shrink:0;gap:4px}
</style>
