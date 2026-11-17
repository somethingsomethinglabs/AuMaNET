/** Planning arithmetic, never live telemetry or a geographic propagation model.
 * Decimal kbps / MB. See design/bandwidth-use-cases.md for derivation. */
export interface BandwidthScenario {
  uploadKbps:number; downloadKbps:number; uncertaintyPercent:number;
  members:number; talkers:number; codecKbps:number; packetMs:number;
  voiceOverheadBytes:number; gpsSeconds:number; gpsEnvelopeBytes:number;
  textsPerMinute:number; textEnvelopeBytes:number;
  hops:number; referenceHops:number; contentionPercent:number; headroomPercent:number;
  otherKbps:number; photoMB:number; mapMB:number; pageMB:number;
  donorUploadKbps:number; donorDownloadKbps:number; tunnelPercent:number;
}
export const defaultBandwidthScenario:BandwidthScenario={
  uploadKbps:130,downloadKbps:188,uncertaintyPercent:30,members:2,talkers:1,
  codecKbps:24,packetMs:20,voiceOverheadBytes:80,gpsSeconds:10,gpsEnvelopeBytes:500,
  textsPerMinute:2,textEnvelopeBytes:1000,hops:1,referenceHops:1,
  contentionPercent:10,headroomPercent:30,otherKbps:0,photoMB:.25,mapMB:10,pageMB:3,
  donorUploadKbps:1000,donorDownloadKbps:1000,tunnelPercent:10,
};
export const scenarioFormulas={
  capacity:'min(uploadKbps,downloadKbps) * (1 +/- uncertaintyPercent/100) * referenceHops/hops * (1-contentionPercent/100) * (1-headroomPercent/100)',
  voice:'(codecKbps + voiceOverheadBytes*8/packetMs) * talkers * (members-1)',
  gps:'gpsEnvelopeBytes*8/1000/gpsSeconds * members*(members-1)',
  text:'textEnvelopeBytes*8/1000 * textsPerMinute/60 * (members-1)',
  seconds:'MB*8000 / remainingKbps',
  internet:'min(remainingKbps,donorDownloadKbps,donorUploadKbps)/(1+tunnelPercent/100)',
} as const;
export function estimateBandwidth(s:BandwidthScenario){
  for(const key of Object.keys(defaultBandwidthScenario) as (keyof BandwidthScenario)[]){const value=s[key];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)throw Error(`Invalid ${key}`);}
  for(const key of ['members','talkers','hops','referenceHops'] as const)if(!Number.isInteger(s[key]))throw Error(`Invalid ${key}`);
  if(s.members<2||s.members>64||s.talkers>s.members||s.hops<1||s.hops>16||s.referenceHops<1||s.referenceHops>s.hops||s.packetMs<2.5||s.packetMs>120||s.gpsSeconds<1||s.codecKbps<6||s.codecKbps>510||
    ['uncertaintyPercent','contentionPercent','headroomPercent'].some(k=>s[k as keyof BandwidthScenario]>=100))throw Error('Scenario outside supported planning bounds');
  const voiceStreamKbps=s.codecKbps+s.voiceOverheadBytes*8/s.packetMs;
  const voiceKbps=voiceStreamKbps*s.talkers*(s.members-1);
  const gpsKbps=s.gpsEnvelopeBytes*8/1000/s.gpsSeconds*s.members*(s.members-1);
  const textKbps=s.textEnvelopeBytes*8/1000*s.textsPerMinute/60*(s.members-1);
  const baseKbps=gpsKbps+textKbps;
  const demandKbps=baseKbps+voiceKbps+s.otherKbps;
  const capacity=Math.min(s.uploadKbps,s.downloadKbps)*s.referenceHops/s.hops*(1-s.contentionPercent/100)*(1-s.headroomPercent/100);
  const capacityKbps=[capacity*(1-s.uncertaintyPercent/100),capacity*(1+s.uncertaintyPercent/100)] as const;
  const remainingKbps=capacityKbps.map(c=>Math.max(0,c-demandKbps));
  const internetKbps=remainingKbps.map(c=>Math.min(c,s.donorUploadKbps,s.donorDownloadKbps)/(1+s.tunnelPercent/100));
  const seconds=(mb:number,rates:readonly number[])=>[rates[1]!>0?mb*8000/rates[1]!:null,rates[0]!>0?mb*8000/rates[0]!:null];
  const verdict=(required:number)=>capacityKbps[0]>=required?'Fits assumed range':capacityKbps[1]>=required?'Marginal in assumed range':'Exceeds assumed capacity';
  return {confidence:'Low · assumed scenario, not a prediction',capacityKbps,voiceStreamKbps,voiceKbps,gpsKbps,textKbps,demandKbps,remainingKbps,internetKbps,
    talkerUploadKbps:voiceStreamKbps*(s.members-1),listenerDownloadKbps:voiceStreamKbps*Math.min(s.talkers,s.members-1),
    maxTalkers:capacityKbps.map(c=>Math.min(s.members,Math.max(0,Math.floor((c-baseKbps-s.otherKbps)/(voiceStreamKbps*(s.members-1)))))),
    textGpsVerdict:verdict(baseKbps+s.otherKbps),mixedVerdict:verdict(demandKbps),
    photoSeconds:seconds(s.photoMB,remainingKbps),mapSeconds:seconds(s.mapMB,remainingKbps),pageSeconds:seconds(s.pageMB,internetKbps)};
}
export function exportBandwidthScenario(s:BandwidthScenario){return JSON.stringify({schema:'aumanet.bandwidth-scenario.v1',kind:'assumption-only',units:'decimal kbps, MB, seconds',inputs:s,formulas:scenarioFormulas,result:estimateBandwidth(s),limitations:[
  'Range is user-selected sensitivity, not a statistical confidence interval.',
  'All copies assumed to share one half-duplex contention domain; hop scaling is unvalidated.',
  'Voice overhead is a conservative allowance against large-transfer TCP payload goodput, not exact airtime.',
  'Transfer times are capacity floors; image pacing, base64, RTT, retries and outages can make them longer.',
  'No latency, jitter, loss, RF sample freshness or location capability is inferred.',
]},null,2);}
