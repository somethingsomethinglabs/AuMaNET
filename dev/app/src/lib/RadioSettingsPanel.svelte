<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {Radio,RefreshCw,Square} from '@lucide/svelte';
  import {radioSettingLabel,matchingRadioNodes,type RadioSettingOption,type RadioNodeView} from './radio-settings-view';
  export let supported=true,loaded=false,busy=false,available=false,owner=false,canChange=false;
  export let state='unavailable',error='',notice='',operationId='',trialRemainingMs=0;
  export let options:readonly RadioSettingOption[]=[];
  export let nodes:readonly RadioNodeView[]=[];
  export let onrefresh:()=>void=()=>{};
  export let onapply:(optionId:number)=>void=()=>{};
  export let oncancel:()=>void=()=>{};
  let width='',optionId='';
  $: widths=[...new Set(options.map(option=>option.bandwidthMHz))].sort((a,b)=>a-b);
  $: choices=options.filter(option=>String(option.bandwidthMHz)===width);
  $: proposed=options.find(option=>String(option.id)===optionId);
  $: switching=['trial','verifying','committing'].includes(state);
  $: matching=matchingRadioNodes(nodes);
  $: unchanged=!!proposed&&matching&&nodes[0].channel===proposed.channel&&nodes[0].bandwidthMHz===proposed.bandwidthMHz&&nodes[0].centerFrequencyHz===proposed.centerFrequencyHz;
  $: if(optionId&&!options.some(option=>String(option.id)===optionId))optionId='';
  const states:Record<string,string>={unavailable:'Radio status unavailable',idle:'Ready to review',refreshing:'Checking both nodes…',trial:'Trying the proposed setting',verifying:'Verifying both nodes',committing:'Saving the verified setting',applied:'Setting applied', 'rolled-back':'Previous setting restored',failed:'Change not confirmed',cancelled:'Change cancelled',unknown:'Outcome unknown · refresh status'};
  function changeWidth(value:string){width=value;if(!options.some(option=>String(option.id)===optionId&&String(option.bandwidthMHz)===value))optionId='';}
</script>
<section class="radio-settings" aria-label="Radio settings">
  <section class="card"><div class="radio-heading"><Radio size={25}/><h2>Radio settings</h2></div><p class="hint">Choose the HaLow radio channel and channel width. Transmit power is unchanged.</p>
    {#if !supported}<p role="status">Radio settings are unavailable in this app version.</p>{:else}
      {#if error}<p class="radio-error" role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
      <p class="radio-phase" role="status">{loaded?states[state]??'Radio status unavailable':'Checking radio status…'}</p>
      <button class="text-button refresh-radio" disabled={busy} onclick={onrefresh}><RefreshCw size={17}/>Refresh radio status</button>
      <div class="reported-settings"><h3>Reported by the nodes</h3>{#if matching}<strong>{radioSettingLabel(nodes[0] as Required<Pick<RadioSettingOption,'channel'|'bandwidthMHz'|'centerFrequencyHz'>>)}</strong><p class="hint">Both nodes report this setting.</p>{:else}<p class="hint">A matching current setting has not been verified on both nodes. Refresh to check it.</p>{/if}
        <details><summary>Node reports ({nodes.length})</summary>{#each nodes as node(node.id)}<div class="node-radio-report"><strong>{node.name}</strong><span>{node.channel!==undefined&&node.bandwidthMHz!==undefined&&node.centerFrequencyHz!==undefined?radioSettingLabel({channel:node.channel,bandwidthMHz:node.bandwidthMHz,centerFrequencyHz:node.centerFrequencyHz}):'Setting not reported'}</span><small>{node.reportLabel}</small></div>{:else}<p class="hint">No checked radio reports are available yet.</p>{/each}</details>
      </div>
      {#if switching}<p class="switch-warning">Preparing or verifying the change. Calls and transfers may pause while the following node finds the main node.</p>{#if trialRemainingMs>0}<p class="hint">Trial window: up to {Math.ceil(trialRemainingMs/1000)} seconds remaining. The main node rolls back an uncommitted trial when this window ends.</p>{/if}{#if operationId&&state!=='committing'}<button class="outline full" onclick={oncancel}><Square size={17}/>Cancel change</button>{/if}
      {:else}
        {#if loaded&&!owner}<p class="radio-note" role="status">Change these settings from the group owner’s phone.</p>{/if}
        {#if loaded&&owner&&!available}<p class="hint">Connect both checked nodes before changing their radio settings.</p>{/if}
        {#if loaded&&owner&&!options.length}<p class="hint">No permitted choices have been reported. Refresh status with both nodes powered and connected.</p>{/if}
        {#if owner&&options.length}<fieldset disabled={!loaded||!owner||!available||busy||!options.length}><legend>Proposed setting</legend><div class="radio-choices"><fieldset class="choice-field"><legend>Channel width</legend><div class="choice-control" aria-label="Channel width">{#each widths as value}<button type="button" aria-pressed={width===String(value)} onclick={()=>changeWidth(String(value))}>{value} MHz</button>{/each}</div></fieldset><label class="field">Radio channel<select bind:value={optionId} disabled={!width}><option value="">Choose a channel</option>{#each choices as choice(choice.id)}<option value={String(choice.id)}>Channel {choice.channel} · {new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(choice.centerFrequencyHz/1e6)} MHz</option>{/each}</select></label></div></fieldset>
        
        {#if proposed}<p class="proposal-preview"><span>Proposed</span><strong>{radioSettingLabel(proposed)}</strong></p>{/if}
        <p class="switch-warning">Both nodes must match. Applying pauses the link, calls and transfers. The main node rolls back an uncommitted trial after 30 seconds. Refresh to confirm both nodes after an unknown outcome.</p>
        <button class="primary full" disabled={!loaded||!owner||!canChange||busy||!proposed||unchanged} onclick={()=>{if(proposed)onapply(proposed.id);}}>{busy?'Applying…':unchanged?'Already reported on both nodes':'Apply to the radio link'}</button>{/if}
      {/if}
      <div class="help-row"><span>About radio changes</span><HelpButton title="About radio changes"><p>Only settings reported as permitted by the checked node firmware appear here. Channel number, center frequency and width are a single supported choice. Apply checks fresh reports from both nodes before changing anything. A proposed choice does not become the applied setting until both nodes are verified.</p><p>The following node finds the main node automatically. Cancel asks for the previous setting while a trial is still live; a committed change cannot be cancelled. After an unknown outcome, refresh the reports before trying again.</p></HelpButton></div>
    {/if}
  </section>
</section>
<style>
.radio-settings{min-width:0}.radio-heading{display:flex;align-items:center;gap:10px}.radio-heading h2{font-size:20px;margin:0}.hint{font-size:12px;line-height:1.6;color:var(--muted)}.radio-phase{font-size:14px;font-weight:700}.reported-settings{padding:14px;border:1px solid var(--line);border-radius:14px;margin:16px 0}.reported-settings h3{font-size:14px;margin:0 0 10px}.reported-settings>strong{display:block;font-size:15px;line-height:1.6;overflow-wrap:anywhere}.radio-settings summary{min-height:44px;align-content:center;cursor:pointer;font-size:13px;font-weight:650}.node-radio-report{display:grid;gap:5px;padding:12px 0;border-top:1px solid var(--line);font-size:13px}.node-radio-report span{line-height:1.5}.node-radio-report small{font-size:12px;color:var(--muted)}fieldset{border:0;padding:0;margin:18px 0;min-width:0}legend{font-size:14px;font-weight:700;margin-bottom:10px}.radio-choices{display:grid;grid-template-columns:1fr;gap:8px}.radio-choices label{min-width:0;font-size:13px}.radio-choices select{width:100%;max-width:100%;min-width:0;min-height:44px}.radio-settings button{min-height:44px;white-space:normal}.switch-warning,.radio-note{padding:12px;background:var(--warning-bg,#f4efdd);color:var(--warning-ink,#75613c);border-radius:12px;font-size:12px;line-height:1.65}.radio-error{font-size:13px;color:var(--error-ink,#9f301f);overflow-wrap:anywhere}.proposal-preview{padding:12px;border:1px dashed var(--line);border-radius:12px;display:grid;gap:5px;font-size:13px}.proposal-preview>span{font-size:12px;color:var(--muted)}.refresh-radio{display:flex;align-items:center;gap:7px;margin-top:8px}
</style>
