<script lang="ts">
  import type {NativeVoiceLabClient,VoiceLabSnapshot,VoiceLabSignal} from '@aumanet/core';
  export let client:NativeVoiceLabClient;
  export let state:VoiceLabSnapshot|undefined;
  export let sourceError='';
  let busy=false,error='',remoteText='',expectedFingerprint='',localText='';
  let signal:VoiceLabSignal|undefined;
  $: joined=!!state?.joined;
  $: connected=state?.connection==='connected'&&state.peerVerified;
  $: participants=joined?1+(connected?1:0):0;
  $: micState=!joined?'Not joined':state?.muted?'Mic muted':state?.transmitting?'Transmitting':'PTT armed · Hold to talk';
  async function run(action:()=>Promise<unknown>){
    if(busy)return;busy=true;error='';
    try{await action();}catch(e){error=e instanceof Error?e.message:String(e);}finally{busy=false;void client.refresh().catch(e=>error=e instanceof Error?e.message:String(e));}
  }
  async function leave(){error='';try{await client.stop();localText='';signal=undefined;}catch(e){error=e instanceof Error?e.message:String(e);}}
  async function control(action:()=>Promise<unknown>){try{await action();error='';}catch(e){error=e instanceof Error?e.message:String(e);}finally{void client.refresh().catch(e=>error=e instanceof Error?e.message:String(e));}}
  async function exportSignal(){
    if(!client.state?.joined)await client.start();
    const next=await client.createOffer();
    if(client.state?.joined&&client.state.sessionId===next.sessionId){signal=next;localText=JSON.stringify(next,null,2);}
  }
  async function applySignal(){
    if(remoteText.length>100000)throw new Error('Signal exceeds the lab input limit');
    const raw=JSON.parse(remoteText);
    const next=client.state?.joined?await client.applySignal(raw,expectedFingerprint):await client.joinOffer(raw,expectedFingerprint);
    if(client.state?.joined&&client.state.sessionId===next.sessionId){signal=next;localText=JSON.stringify(next,null,2);}
  }
</script>
<h2>Voice developer tools</h2>
{#if sourceError}<p class="native-error" role="alert">{sourceError}</p>{/if}
<p class="hint">Temporary local test pairing and native counters. Stop releases the microphone session.</p>
{#if error}<p class="native-error" role="alert">{error}</p>{/if}
{#if busy}<p role="status">Preparing native session… <button onclick={()=>void leave()}>Cancel / stop</button></p>{/if}
<details class="card pairing"><summary>Local test pairing</summary>
  <p>Use this setup for the first two-phone experiment. Both phones need the same local Wi-Fi. Compare the complete fingerprint through a separate trusted channel, such as the USB-connected test phone. This is a temporary bench pairing, not production group enrollment.</p>
  <button class="outline" disabled={busy} onclick={()=>void run(exportSignal)}>Create / export local signal</button>
  {#if localText}<label class="field">Local {signal?.type??'signal'}<textarea aria-label="Local voice signal" readonly value={localText}></textarea></label><label class="field">This phone’s fingerprint<input aria-label="Local voice fingerprint" readonly value={signal?.fingerprint??state?.localFingerprint??''}/></label>{/if}
  <label class="field">Peer signal<textarea aria-label="Peer voice signal" maxlength="100000" bind:value={remoteText} placeholder="Paste the intended peer’s signal"></textarea></label>
  <label class="field">Independently verified peer fingerprint<input aria-label="Verified peer fingerprint" maxlength="95" bind:value={expectedFingerprint} placeholder="Complete SHA-256 fingerprint"/></label>
  <button class="outline" disabled={busy||!remoteText||!expectedFingerprint} onclick={()=>void run(applySignal)}>{joined?'Apply verified peer signal':'Join muted using verified offer'}</button>
  <p class="hint">Signal data expires after 10 minutes for this experiment. No external STUN/TURN service is used. Leaving clears native media and the temporary peer session.</p>
</details>
{#if joined}<details class="card"><summary>Native audio diagnostics</summary>
  <p class="hint">Real native counters. Test tone substitutes a generated signal for speech while PTT is held and always re-mutes the microphone when changed. It is audio transport evidence, not a speech-quality result.</p>
  <label class="switch-row">Generate test tone while holding PTT<input type="checkbox" aria-label="Native test tone" checked={state?.probeTone??false} onchange={event=>void run(()=>client.probe(event.currentTarget.checked))}/></label>
  <div class="info-row"><span>Connection / Wi-Fi path</span><strong>{state?.connection} / {state?.pathVerified?'verified':'unverified'}</strong></div>
  <div class="info-row"><span>Microphone capture / playback</span><strong>{state?.captureActive?'active':'idle'} / {state?.playbackActive?'active':'idle'}</strong></div>
  <div class="info-row"><span>Open / zeroed capture callbacks</span><strong>{state?.openFrames} / {state?.zeroedFrames}</strong></div>
  <div class="info-row"><span>Native processing result</span><strong>{state?.processingResult}</strong></div>
  <pre>{JSON.stringify(state?.stats??{},null,2)}</pre>
  <a href="/native-voice-notices.txt">Bundled native media notices</a>
</details>{/if}
<style>
  .native-error{color:var(--error-ink);background:var(--error-bg);padding:10px;border-radius:10px;overflow-wrap:anywhere}.pairing{margin-top:16px}.pairing summary,summary{font-weight:700;cursor:pointer;min-height:32px}.pairing p{line-height:1.6}.pairing .field{margin-top:14px}textarea{width:100%;min-height:110px;resize:vertical;background:var(--bg);color:inherit;border:1px solid var(--line);border-radius:10px;padding:10px;font:0.75rem ui-monospace,monospace;overflow-wrap:anywhere}pre{max-height:220px;overflow:auto;font-size:0.6875rem;white-space:pre-wrap;overflow-wrap:anywhere}input[readonly]{font-family:ui-monospace,monospace;font-size:0.6875rem}
</style>
