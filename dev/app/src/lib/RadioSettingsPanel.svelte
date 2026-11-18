<script lang="ts">
  import {radioSettingLabel,matchingRadioNodes,type RadioSettingOption,type RadioNodeView} from './radio-settings-view';

  export let supported=true,loaded=false,busy=false,operator=false,canChange=false,explicitCommit=true;
  export let state='unavailable',error='',notice='',operationId='',trialRemainingMs=0,changeBlocker='';
  export let options:readonly RadioSettingOption[]=[];
  export let nodes:readonly RadioNodeView[]=[];
  export let onrefresh:()=>void=()=>{};
  export let onverify:(()=>void)|undefined=undefined;
  export let onapply:(optionId:number)=>void=()=>{};
  export let oncommit:()=>void=()=>{};
  export let oncancel:()=>void=()=>{};

  let optionId='',savedProposal='';
  $: proposed=options.find(option=>String(option.id)===optionId);
  $: if(savedProposal&&savedProposal!==optionId)savedProposal='';
  $: proposalSaved=!!proposed&&savedProposal===optionId;
  $: channelLabel=explicitCommit?'Proposed channel':'New channel';
  $: if(optionId&&!options.some(option=>String(option.id)===optionId))optionId='';
  $: switching=['trial','verifying','awaiting-commit','committing'].includes(state);
  $: refreshing=state==='refreshing';
  $: matching=matchingRadioNodes(nodes);
  $: lastPair=loaded&&!switching&&state!=='unknown'&&matchingRadioNodes(nodes,false)?nodes[0]:undefined;
  $: lastAgeSeconds=Math.ceil(Math.max(0,...nodes.map(node=>node.reportAgeMs??0))/1000);
  $: unchanged=!!proposed&&matching&&nodes[0].channel===proposed.channel&&nodes[0].bandwidthMHz===proposed.bandwidthMHz&&nodes[0].centerFrequencyHz===proposed.centerFrequencyHz;

  const states:Record<string,string>={
    refreshing:'Checking both nodes…',trial:'Trying the selected channel',verifying:'Verifying both nodes',
    'awaiting-commit':'Trial verified',committing:'Saving the verified channel',
    applied:'Channel applied','rolled-back':'Previous channel restored',failed:'Change could not start',
    cancelled:'Change cancelled',unknown:'Channel not confirmed'
  };

  function reportText(node:RadioNodeView) {
    const {channel,bandwidthMHz,centerFrequencyHz}=node;
    if(channel===undefined||bandwidthMHz===undefined||centerFrequencyHz===undefined)return 'Setting not reported';
    return radioSettingLabel({channel,bandwidthMHz,centerFrequencyHz});
  }
</script>

<section class="radio-settings" aria-label="Radio settings">
  <section class="card">
    <h2>Radio channel</h2>
    {#if !supported}
      <p role="status">Radio settings are unavailable in this app version.</p>
    {:else}
      {#if error}<p class="radio-error" role="alert">{error}</p>{/if}
      {#if notice}<p role="status">{notice}</p>{/if}
      {#if lastPair}
        <p><strong>{reportText(lastPair)}</strong></p>
        {#if matching}<p class="hint">Verified on both nodes.</p>
        {:else}<p class="hint">Last verified on both nodes {lastAgeSeconds} s ago.</p>{/if}
      {:else if state==='unknown'}
        <p class="hint">Verify both nodes to find which channel is active.</p>
      {:else if !switching}
        <p class="hint">{refreshing?'Requesting fresh node reports…':'Refresh radio status to check both nodes.'}</p>
      {/if}
      <button class="outline" disabled={busy||refreshing||switching} onclick={onrefresh}>Refresh radio status</button>
      {#if nodes.length}
        <details class="reported-settings">
          <summary>Node reports ({nodes.length})</summary>
          {#each nodes as node(node.id)}
            <div class="node-radio-report"><strong>{node.name}</strong><span>{reportText(node)}</span><small>{node.reportLabel}</small></div>
          {/each}
        </details>
      {/if}
    {/if}
  </section>

  {#if supported&&(operator||changeBlocker)}
    <section class="card">
      <h2>Apply channel</h2>
      {#if loaded&&states[state]}<p role="status">{states[state]}</p>{/if}

      {#if loaded&&operator&&state==='unknown'&&onverify}
        <p class="hint">This check pauses transfers and may end group calls.</p>
        <button class="primary full" disabled={busy} onclick={onverify}>Verify current channel</button>
      {:else if switching}
        {#if trialRemainingMs>0}<p class="hint">Trial window up to {Math.ceil(trialRemainingMs/1000)} seconds remaining.</p>{/if}
        {#if state==='awaiting-commit'&&trialRemainingMs>0}
          <p role="status">Both nodes verified the trial. Commit now to keep the selected channel.</p>
          <button class="primary full" disabled={busy} onclick={oncommit}>Commit verified setting</button>
        {/if}
        {#if operationId&&state!=='committing'}<button class="outline full" onclick={oncancel}>Cancel change</button>{/if}
      {:else}
        {#if !refreshing&&changeBlocker}<p class="hint" role="status">{changeBlocker}</p>{/if}
        {#if operator&&options.length}
          <label class="field">{channelLabel}
            <select aria-label={channelLabel} bind:value={optionId} disabled={!loaded||busy}>
              <option value="">Choose a permitted setting</option>
              {#each options as choice(choice.id)}<option value={String(choice.id)}>{radioSettingLabel(choice)}</option>{/each}
            </select>
          </label>
          {#if explicitCommit}
            <button class="outline" disabled={!proposed||proposalSaved||busy} onclick={()=>savedProposal=optionId}>Save proposal</button>
            {#if proposalSaved&&proposed&&!unchanged}
              <p class="hint" role="status">Proposal saved for {radioSettingLabel(proposed)}.</p>
            {/if}
            <p class="hint">The trial pauses transfers and may end group calls. Commit once both nodes verify the trial. An uncommitted setting rolls back after 30 seconds.</p>
          {:else}
            <p class="hint">The app saves the channel after both nodes verify it. Applying pauses transfers and may end group calls.</p>
          {/if}
          <button class="primary full" disabled={!loaded||!canChange||busy||refreshing||unchanged||!proposed||explicitCommit&&!proposalSaved} onclick={()=>{if(proposed)onapply(proposed.id);}}>
            {unchanged?'Already reported on both nodes':explicitCommit?'Begin bounded trial':'Apply selected channel'}
          </button>
        {/if}
      {/if}
    </section>
  {/if}
</section>

<style>
  .radio-settings{min-width:0}
  h2{font-size:1.0625rem;margin:0 0 12px}
  .reported-settings{margin-top:12px}
  .node-radio-report{display:grid;gap:5px;padding:12px 0;border-top:1px solid var(--line);font-size:.8125rem}
  .node-radio-report small{font-size:.75rem;color:var(--muted)}
  .radio-error{color:var(--error-ink);font-size:.8125rem;overflow-wrap:anywhere}
  .full{margin-top:10px}
  select{font-weight:400}
</style>
