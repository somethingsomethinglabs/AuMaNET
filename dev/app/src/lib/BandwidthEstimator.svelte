<script lang="ts">
  import {defaultBandwidthScenario,estimateBandwidth,exportBandwidthScenario,type BandwidthScenario} from './bandwidth-scenario';
  import {Capacitor,registerPlugin} from '@capacitor/core';
  import {saveScenarioJson,type ScenarioExportBridge} from './scenario-export';
  export let initialRates:{uploadKbps:number;downloadKbps:number;completedAt:number}|undefined=undefined;
  let scenario={...defaultBandwidthScenario,...(initialRates?{uploadKbps:initialRates.uploadKbps,downloadKbps:initialRates.downloadKbps}:{})};
  let exportedJson='';
  let exporting=false,exportNotice='';
  const fields:{key:keyof BandwidthScenario;label:string;step?:number}[]=[
    {key:'uploadKbps',label:'Upload rate · kbit/s'},{key:'downloadKbps',label:'Download rate · kbit/s'},
    {key:'uncertaintyPercent',label:'Sensitivity range (±%)'},{key:'members',label:'Phones in the group'},
    {key:'talkers',label:'Concurrent talkers'},{key:'codecKbps',label:'Voice encoder ceiling (kbps)'},
    {key:'packetMs',label:'Assumed voice packet interval (ms)',step:2.5},{key:'voiceOverheadBytes',label:'Voice overhead allowance (bytes / packet)'},
    {key:'gpsSeconds',label:'GPS update interval (seconds)'},{key:'gpsEnvelopeBytes',label:'GPS envelope allowance (bytes)'},
    {key:'textsPerMinute',label:'Group texts / minute (all senders)'},{key:'textEnvelopeBytes',label:'Text envelope allowance (bytes)'},
    {key:'hops',label:'Scenario hops (shared airtime)'},{key:'referenceHops',label:'Hops already in goodput measurement'},
    {key:'contentionPercent',label:'Additional contention reduction (%)'},{key:'headroomPercent',label:'Reserved headroom (%)'},
    {key:'otherKbps',label:'Other shared traffic (kbps)'},{key:'photoMB',label:'Photo size (decimal MB)',step:.05},
    {key:'mapMB',label:'Map download (MB)',step:.1},{key:'pageMB',label:'Web page transfer (MB)',step:.1},
    {key:'donorUploadKbps',label:'Donor mobile upload (kbps)'},{key:'donorDownloadKbps',label:'Donor mobile download (kbps)'},
    {key:'tunnelPercent',label:'Extra internet tunnel allowance (%)'},
  ];
  const commonKeys:readonly (keyof BandwidthScenario)[]=['uploadKbps','downloadKbps','members','talkers'];
  function calculate(value:BandwidthScenario){try{return {result:estimateBandwidth(value),error:''};}catch{return {result:undefined,error:'Enter finite non-negative values. Use 2–64 members, whole talkers ≤ members, 1–16 hops, reference hops ≤ scenario hops, GPS ≥1 s, codec 6–510 kbps, packet interval 2.5–120 ms and percentages below 100.'};}}
  $: calculation=calculate(scenario);
  const range=(v:readonly number[])=>v.map(n=>n.toFixed(1)).join('–');
  const time=(v:readonly (number|null)[])=>v.map(n=>n===null?'no capacity':n<60?`${n.toFixed(0)} s`:`${(n/60).toFixed(1)} min`).join(' – ');
  async function download(){
    if(exporting)return;
    const report=JSON.parse(exportBandwidthScenario(scenario));if(initialRates)report.startingMeasurement={...initialRates,kind:'historical',note:'Original test rates before scenario edits; not current path capacity.'};exportedJson=JSON.stringify(report,null,2);exportNotice='';exporting=true;
    try{
      if(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('AuMaNETScenarioExport')){
        const name=await saveScenarioJson(registerPlugin<ScenarioExportBridge>('AuMaNETScenarioExport'),exportedJson);exportNotice=`Saved to Downloads/AuMaNET/${name}`;
      }else{
        const blob=new Blob([exportedJson],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='aumanet-bandwidth-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);exportNotice='Download requested. If no file appears, copy the JSON below.';
      }
    }catch(error){exportNotice=error instanceof Error?error.message:'File saving could not be confirmed. Check Downloads/AuMaNET or copy the JSON below.';}finally{exporting=false;}
  }
</script>
<section aria-label="Bandwidth scenario estimator">
  {#if initialRates}<p><strong>Starting from a historical connection test</strong> · {new Date(initialRates.completedAt).toLocaleString()}. These rates describe that test's path and conditions, not current capacity. Other inputs remain assumptions; repeat tests and include failures.</p>{/if}
  <div class="planner-toolbar"><button class="outline" disabled={exporting||!!calculation.error} onclick={download}>{exporting?'Saving…':'Export scenario'}</button></div>
  {#if calculation.result}{@const result=calculation.result}<div class="capacity-summary"><small>ESTIMATED AVAILABLE CAPACITY</small><strong class="capacity-value">{Math.round((result.capacityKbps[0]+result.capacityKbps[1])/2)} <span>kbit/s</span></strong><p>Estimate from the inputs below. Not a live measurement.</p><div class="capacity-stats"><span><b>{result.maxTalkers.join('–')}</b><small>ARITHMETIC TALKERS</small></span><span><b>{Math.round(result.demandKbps)}</b><small>DEMAND · kbit/s</small></span><span><b>{Math.round((result.remainingKbps[0]+result.remainingKbps[1])/2)}</b><small>LEFT · kbit/s</small></span></div></div>{/if}
  <div class="card"><h2>Scenario</h2>
  <div class="scenario-inputs">{#each fields.filter(f=>commonKeys.includes(f.key)) as field}<label>{field.label}<input type="number" min="0" step={field.step??1} bind:value={scenario[field.key]}/></label>{/each}</div>
  <details><summary>Traffic, reserve & transfer sizes</summary><div class="scenario-inputs">{#each fields.filter(f=>!commonKeys.includes(f.key)) as field}<label>{field.label}<input type="number" min="0" step={field.step??1} bind:value={scenario[field.key]}/></label>{/each}</div></details>
  <button class="primary" onclick={()=>{scenario={...scenario};}}>Calculate</button></div>
  {#if calculation.error}<p role="alert">{calculation.error}</p>{:else if calculation.result}
    {@const r=calculation.result}
    <details class="scenario-results"><summary>Calculated details</summary><div aria-live="polite">
      <p><strong>{r.confidence}</strong></p>
      <p>Shared planning capacity: <strong>{range(r.capacityKbps)} kbps</strong></p>
      <p>Text + GPS: <strong>{r.textGpsVerdict}</strong>. With voice: <strong>{r.mixedVerdict}</strong>.</p>
      <p>Demand: {r.demandKbps.toFixed(1)} kbps · voice {r.voiceKbps.toFixed(1)}, GPS {r.gpsKbps.toFixed(1)}, text {r.textKbps.toFixed(1)}. Talker upload {r.talkerUploadKbps.toFixed(1)} kbps; listener download up to {r.listenerDownloadKbps.toFixed(1)} kbps.</p>
      <p>Talkers fitting arithmetic: {r.maxTalkers.join('–')} · requires latency/loss trials.</p>
      <dl><dt>Photo capacity floor</dt><dd>{time(r.photoSeconds)}</dd><dt>Map capacity floor</dt><dd>{time(r.mapSeconds)}</dd><dt>Page through donor, capacity floor</dt><dd>{time(r.pageSeconds)}</dd></dl>
      <p>Photo pacing and base64 make actual transfers slower. Active voice limits image chunks to one per 2 seconds; a 0.25 MB photo needs at least about 122 seconds at that pacing. Map figures describe a download; prepared offline maps need no radio data.</p>
    </div></details>
    {#if exportNotice}<p role="status">{exportNotice}</p>{/if}
    {#if exportedJson}<p>JSON from your export action is below. If this app cannot save a download, select and copy it. Export again after changing inputs.</p><label>Exported scenario JSON<textarea readonly rows="8" value={exportedJson}></textarea></label>{/if}
  {/if}
  <details><summary>Assumptions and quality checks</summary><p>One shared half-duplex contention domain, pairwise voice copies, GPS/text fanout to every other member. Capacity uses the slower direction and scales by reference hops / scenario hops. Multi-hop scaling is unproven. Overhead is a conservative allowance against TCP bulk goodput. Sensitivity bounds are chosen by you, not confidence intervals.</p><p>Voice screening targets: mouth-to-ear delay ≤150 ms, jitter ≤30 ms and loss ≤1%; minimum trial limits 400 ms / 60 ms / 3%. These are planning thresholds, not measured here. Bursty loss or a one-second outage can interrupt speech even when average speed fits. Text can queue through outages; positions become stale. Measure both directions under the mixed workload before relying on it.</p><p>Distance alone cannot predict throughput. Terrain, obstructions, antenna geometry and interference require calibrated path evidence. No signal bars, SNR or location guarantee are derived from these inputs.</p></details>
</section>
<style>.planner-toolbar{display:flex;justify-content:flex-end;margin-bottom:16px}.capacity-summary{padding:24px 16px;background:var(--session);color:var(--session-ink);border-radius:16px;margin-bottom:14px}.capacity-summary p,.capacity-summary small{color:inherit}.capacity-summary>small{font-size:.6875rem;letter-spacing:1px}.capacity-value{display:block;font:italic 2.5rem Georgia,serif;margin:12px 0}.capacity-value span{font:400 .6875rem Arial,sans-serif}.capacity-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border-top:1px solid var(--control-line);padding-top:16px;margin-top:16px}.capacity-stats b{display:block;font:1.5rem Georgia,serif}.capacity-stats small{display:block;font-size:.6875rem}.scenario-inputs{grid-template-columns:repeat(2,minmax(0,1fr))!important;margin-bottom:16px}.scenario-inputs label{font-size:.8125rem;font-weight:600}.scenario-inputs input{font-size:1rem;min-height:48px;border-radius:14px}.card>details{margin-bottom:12px}

  section{font-size:0.8125rem;line-height:1.55}p{color:var(--muted)}.scenario-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}label{display:flex;flex-direction:column;gap:4px;font-size:0.75rem}input{width:100%;box-sizing:border-box;min-height:42px;background:var(--surface,#fff);color:inherit;border:1px solid var(--line);border-radius:8px;padding:8px}.scenario-results{margin:18px 0;padding:12px;border:1px solid var(--line);border-radius:10px}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}dd{margin:0}details{margin-top:18px}summary{cursor:pointer}
</style>
