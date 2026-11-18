<script lang="ts">



  import {radioSettingLabel,matchingRadioNodes,type RadioSettingOption,type RadioNodeView} from './radio-settings-view';

  export let supported=true,loaded=false,busy=false,available=false,owner=false,canChange=false;

  export let state='unavailable',error='',notice='',operationId='',trialRemainingMs=0,changeBlocker='';

  export let options:readonly RadioSettingOption[]=[];

  export let nodes:readonly RadioNodeView[]=[];

  export let onrefresh:()=>void=()=>{};
  export let onverify:(()=>void)|undefined=undefined;

  export let onapply:(optionId:number)=>void=()=>{};

  export let oncommit:()=>void=()=>{};

  export let oncancel:()=>void=()=>{};

  let optionId='',savedProposal='';

  $: if(savedProposal&&savedProposal!==optionId)savedProposal='';

  $: proposed=options.find(option=>String(option.id)===optionId);
  $: proposalSaved=!!proposed&&savedProposal===optionId;

  $: switching=['trial','verifying','awaiting-commit','committing'].includes(state);
  $: refreshing=state==='refreshing';

  $: matching=matchingRadioNodes(nodes);

  $: unchanged=!!proposed&&matching&&nodes[0].channel===proposed.channel&&nodes[0].bandwidthMHz===proposed.bandwidthMHz&&nodes[0].centerFrequencyHz===proposed.centerFrequencyHz;

  $: if(optionId&&!options.some(option=>String(option.id)===optionId))optionId='';

  const states:Record<string,string>={unavailable:'Radio status unavailable',idle:'Ready to review',refreshing:'Checking both nodes…',trial:'Trying the proposed setting',verifying:'Verifying both nodes','awaiting-commit':'Verified trial · awaiting your commitment',committing:'Saving the verified setting',applied:'Setting applied', 'rolled-back':'Previous setting restored',failed:'Change not confirmed',cancelled:'Change cancelled',unknown:'Outcome unknown · refresh status'};


</script>

<section class="radio-settings" aria-label="Radio settings">

  <section class="card"><div class="radio-heading"><h2>Current channel</h2><span class="pill" class:unknown={!matching}>{matching?'Matching reports':'Unverified'}</span></div>

    {#if !supported}<p role="status">Radio settings are unavailable in this app version.</p>{:else}

      {#if error}<p class="radio-error" role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}

      <dl class="current-radio"><div><dt>Applied channel</dt><dd>{matching?`Channel ${nodes[0].channel}`:'Not verified'}</dd></div><div><dt>Centre / width</dt><dd>{matching?`${nodes[0].centerFrequencyHz!/1e6} MHz · ${nodes[0].bandwidthMHz} MHz`:'Unavailable'}</dd></div><div><dt>Reports</dt><dd>{matching?'Fresh associated reports agree':'Refresh to verify both nodes'}</dd></div></dl>

      <details class="reported-settings"><summary>Node reports ({nodes.length})</summary>{#each nodes as node(node.id)}<div class="node-radio-report"><strong>{node.name}</strong><span>{node.channel!==undefined&&node.bandwidthMHz!==undefined&&node.centerFrequencyHz!==undefined?radioSettingLabel({channel:node.channel,bandwidthMHz:node.bandwidthMHz,centerFrequencyHz:node.centerFrequencyHz}):'Setting not reported'}</span><small>{node.reportLabel}</small></div>{/each}</details>

      {#if loaded&&!owner}<p class="hint" role="status">Change these settings from the group owner’s phone.</p>{/if}

      {#if loaded&&owner&&!options.length}<p class="hint">No permitted choices have been reported. Refresh status with both nodes powered and connected.</p>{/if}

    {/if}

  </section>

  {#if supported}<section class="card"><div class="radio-heading"><h2>Apply channel</h2><span class="pill unknown" role="status">{loaded?states[state]??'Unavailable':'Checking…'}</span></div>

    {#if owner&&options.length&&!switching}
      <label class="field">Proposed channel<select aria-label="Proposed channel" bind:value={optionId} disabled={!loaded||!available||busy||switching}><option value="">Choose a permitted setting</option>{#each options as choice(choice.id)}<option value={String(choice.id)}>{radioSettingLabel(choice)}</option>{/each}</select></label>
      <button class="outline" disabled={!proposed||proposalSaved||busy||switching} onclick={()=>savedProposal=optionId}>Save proposal</button>
    {/if}
    {#if proposalSaved&&proposed&&!unchanged}
      <p class="hint" role="status">Proposal saved for {radioSettingLabel(proposed)}.</p>
    {/if}

    {#if loaded&&owner&&state==='unknown'&&onverify}
      <p>Verify both nodes to check which channel is active. This pauses transfers and may end group calls.</p>
      <button class="primary full" disabled={busy} onclick={onverify}>Verify current channel</button>
    {/if}

    {#if switching}
      {#if state==='awaiting-commit'}
        <p role="status">Both nodes verified the trial. Commit now to keep the proposed channel.</p>
      {/if}
      {#if trialRemainingMs>0}<p class="hint">Trial window: up to {Math.ceil(trialRemainingMs/1000)} seconds remaining.</p>{/if}
      {#if state==='awaiting-commit'}<button class="primary full" disabled={busy||trialRemainingMs<=0} onclick={oncommit}>Commit verified setting</button>{/if}
      {#if operationId&&state!=='committing'}<button class="outline full" onclick={oncancel}>Cancel change</button>{/if}
    {:else}
      {#if loaded&&owner&&!refreshing&&changeBlocker&&!(state==='unknown'&&onverify)}
        <p class="hint" role="status">{changeBlocker}</p>
      {:else if loaded&&canChange&&proposalSaved&&!unchanged&&!refreshing&&!busy}
        <p class="hint">Begin the trial and stay here to commit as soon as both nodes verify the channel.</p>
      {/if}
      {#if owner&&options.length}
        <button class="primary full" disabled={!loaded||!canChange||busy||refreshing||unchanged||!proposalSaved} onclick={()=>{if(proposed)onapply(proposed.id);}}>{unchanged?'Already reported on both nodes':'Begin bounded trial'}</button>
      {/if}
      <button class="text-button full" disabled={busy||refreshing} onclick={onrefresh}>Refresh radio status</button>
    {/if}

    <p class="hint">A trial pauses transfers and may end group calls. Keep both nodes powered. An uncommitted setting rolls back after 30 seconds.</p>

    <details><summary>How trials work</summary><p class="hint">Only permitted settings reported by checked node firmware are offered. A proposal does not change a node. Beginning a trial checks fresh reports before pausing the link. Transmission power is unchanged.</p><p class="hint">Both nodes must verify the same trial before you can commit. The following node finds the main node automatically. Cancel asks for the previous setting during a live trial; a committed change cannot be cancelled. After a missing reply or expired window, refresh to confirm both nodes before another attempt.</p></details>

  </section>{/if}

</section>

<style>.radio-settings{min-width:0}.radio-heading{display:flex;gap:12px;align-items:center;justify-content:space-between}.radio-heading h2{font-size:1.0625rem;margin:0}.radio-heading .pill{max-width:55%;text-align:right}.pill.unknown{color:var(--unknown-ink);background:var(--unknown-bg)}.current-radio{margin:8px 0 16px}.current-radio>div{display:flex;gap:12px;justify-content:space-between;padding:10px 0}.current-radio dd{text-align:right;margin:0;font-size:.75rem}.reported-settings{margin:12px 0 20px}.node-radio-report{display:grid;gap:5px;padding:12px 0;border-top:1px solid var(--line);font-size:.8125rem}.node-radio-report span{line-height:1.5}.node-radio-report small{font-size:.75rem;color:var(--muted)}.radio-error{color:var(--error-ink);font-size:.8125rem;overflow-wrap:anywhere}.hint{margin-top:14px}.radio-settings .full{margin-top:10px}.radio-settings select{font-weight:400}</style>
