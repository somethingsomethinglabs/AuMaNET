<script lang="ts">
  import HelpButton from "./HelpButton.svelte";
  import {onDestroy} from 'svelte';
  import type {NativeVoiceLabClient,VoiceLabSnapshot} from '@aumanet/core';
  import {AudioLines} from '@lucide/svelte';
  type Profile='low'|'balanced'|'high';
  type PreferenceState=VoiceLabSnapshot&{readonly detectorSensitivity:number;readonly detectorProfile:Profile;readonly detectorPreferenceNotice?:string};
  type PreferenceClient=NativeVoiceLabClient;
  export let client:PreferenceClient;
  export let state:PreferenceState|undefined;
  export let sourceError='';

  let draft=50,editing=false,busy=false,error='',notice='',alive=true,operation=0;
  $: if(state&&!editing&&!busy)draft=state.detectorSensitivity;
  $: draftValid=Number.isInteger(draft)&&draft>=0&&draft<=100;
  $: selectedProfile=profileFor(draft);
  $: changed=!!state&&draft!==state.detectorSensitivity;
  $: needsSave=changed||!!state?.detectorPreferenceNotice||!!state?.voicePreferences?.needsRepair;
  $: ready=!!state&&!sourceError&&client.synchronized;
  function profileFor(value:number):Profile{return value<=33?'low':value<=66?'balanced':'high';}
  function profileName(value:Profile){return value==='low'?'Low sensitivity':value==='high'?'High sensitivity':'Balanced';}
  function choose(value:number){draft=value;editing=true;notice='';error='';}
  function discard(){if(!state)return;draft=state.detectorSensitivity;editing=false;notice='';error='';}
  async function save(){
    if(!ready||busy||!draftValid||!needsSave)return;
    const requested=draft,repairing=!!state?.detectorPreferenceNotice||!!state?.voicePreferences?.needsRepair,token=++operation;busy=true;error='';notice='';
    try{
      await client.preferences({sensitivity:requested,...(state?.voicePreferences?.needsRepair?{repair:true}:{})});
      const confirmed=client.state as PreferenceState|undefined;
      if(!alive||token!==operation)return;
      if(!confirmed||confirmed.detectorSensitivity!==requested||confirmed.detectorProfile!==profileFor(requested)||repairing&&(!!confirmed.detectorPreferenceNotice||!!confirmed.voicePreferences?.needsRepair))
        throw new Error('The saved setting could not be confirmed. Reload it before trying again.');
      if(confirmed.joined&&!confirmed.muted)
        throw new Error('The setting is saved, but microphone mute could not be confirmed. Use the voice controls to mute.');
      editing=false;draft=confirmed.detectorSensitivity;
      notice=confirmed.joined?'Sensitivity saved. Your microphone is muted; unmute when you are ready.':'Sensitivity saved for your next voice session.';
    }catch(failure){if(alive&&token===operation)error=failure instanceof Error?failure.message:'Sensitivity could not be saved.';}
    finally{if(alive&&token===operation)busy=false;}
  }
  async function reload(){
    if(busy)return;const token=++operation;busy=true;error='';notice='';
    try{
      await client.refresh();if(!alive||token!==operation)return;
      const current=client.state as PreferenceState|undefined;
      if(!current||!client.synchronized)throw new Error('The saved setting is unavailable. Please try again.');
      draft=current.detectorSensitivity;editing=false;notice='Saved setting reloaded.';
    }catch(failure){if(alive&&token===operation)error=failure instanceof Error?failure.message:'Saved setting is unavailable.';}
    finally{if(alive&&token===operation)busy=false;}
  }
  onDestroy(()=>{alive=false;++operation;});
</script>

<section class="card voice-preferences" aria-labelledby="voice-preferences-title" aria-busy={busy}>
  <div class="panel-heading"><h2 id="voice-preferences-title">Speech detection</h2><HelpButton title="Speech detection profiles"><p>Always on uses one of three profiles. Low may miss quiet speech; High may transmit background noise or nearby voices. Push to talk works independently.</p><dl><div><dt>Low</dt><dd>Saved values 0–33</dd></div><div><dt>Balanced</dt><dd>Saved values 34–66 · default 50</dd></div><div><dt>High</dt><dd>Saved values 67–100</dd></div></dl><p>Changing a profile during a call mutes your microphone. Unmute explicitly when ready.</p></HelpButton></div>
  {#if error||sourceError}<p class="preferences-error" role="alert">{error||sourceError}</p>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  {#if state?.detectorPreferenceNotice}<p class="hint" role="status">{state.detectorPreferenceNotice}</p>{/if}
  {#if !state}<p role="status">Loading saved voice settings…</p>{/if}
  <fieldset class="choice-field" aria-label="Always on voice sensitivity" disabled={!ready||busy}><legend>Always on sensitivity</legend><div class="choice-control">{#each [{label:'Low',profile:'low',value:0},{label:'Balanced',profile:'balanced',value:50},{label:'High',profile:'high',value:100}] as option}<button type="button" aria-pressed={selectedProfile===option.profile} onclick={()=>{if(selectedProfile!==option.profile)choose(option.value)}}>{option.label}</button>{/each}</div></fieldset>
  <p id="voice-sensitivity-help" class="hint">{selectedProfile==='low'?'Quiet speech may be missed.':selectedProfile==='high'?'Nearby voices and noise may trigger transmission.':'Background sounds may still trigger transmission.'}</p>
  {#if state?.joined}<p class="hint">Applying a change mutes your microphone. Unmute when ready.</p>{/if}
  {#if state&&changed}<p class="saved-setting">Saved: <strong>{profileName(state.detectorProfile)}</strong></p>{/if}
  <div class="preferences-actions"><button class="primary" disabled={!ready||busy||!draftValid||!needsSave} onclick={()=>void save()}>{busy?'Saving…':'Apply sensitivity'}</button>
    {#if changed}<button class="outline" disabled={!state||busy} onclick={discard}>Discard changes</button>{/if}</div>
  {#if error||sourceError}<button class="outline reload" disabled={busy} onclick={()=>void reload()}>Reload saved setting</button>{/if}
</section>

<style>
  .voice-preferences{min-width:0}.preferences-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:17px}.preferences-actions button{max-width:100%}.saved-setting{font-size:12px;margin-top:18px}.preferences-error{color:#9f301f;background:#fff0e7;padding:12px;border-radius:10px;overflow-wrap:anywhere}.reload{margin-top:12px}
  :global(.dark) .preferences-error{color:#ffc58e;background:#493325}
</style>
