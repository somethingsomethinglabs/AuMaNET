import {GATEWAY_RADIO_CAPABILITY_FRESH_MS,type GatewayRadioSettingsSnapshot} from '@aumanet/protocol';

/** Presentation values projected from checked native capabilities/readbacks.
 * This layer never creates an option or treats a proposed value as applied. */
export interface RadioSettingOption{readonly id:number;readonly channel:number;readonly operatingClass:number;readonly globalOperatingClass:number;readonly bandwidthMHz:number;readonly centerFrequencyHz:number;}
export interface RadioNodeView{readonly id:string;readonly name:string;readonly channel?:number;readonly bandwidthMHz?:number;readonly centerFrequencyHz?:number;readonly fresh:boolean;readonly associated:boolean;readonly reportLabel:string;}
export function radioSettingLabel(value:Pick<RadioSettingOption,'channel'|'bandwidthMHz'|'centerFrequencyHz'>){return`Channel ${value.channel} · ${value.bandwidthMHz} MHz · ${new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(value.centerFrequencyHz/1e6)} MHz`;}
export function matchingRadioNodes(nodes:readonly RadioNodeView[]){if(nodes.length!==2||nodes.some(node=>!node.fresh||!node.associated||node.channel===undefined||node.bandwidthMHz===undefined||node.centerFrequencyHz===undefined))return false;const[a,b]=nodes;return a.channel===b.channel&&a.bandwidthMHz===b.bandwidthMHz&&a.centerFrequencyHz===b.centerFrequencyHz;}

export function radioChangeBlocker(snapshot:GatewayRadioSettingsSnapshot){
  if(snapshot.canChange||!snapshot.owner)return '';
  if(snapshot.state==='unknown')return 'Verify which channel is active before starting another trial.';
  if(snapshot.errorCode==='RADIO_OPERATION_STORAGE_UNAVAILABLE')return 'The app cannot open its radio operation record. Radio changes are unavailable.';
  if(snapshot.errorCode==='RADIO_REPORTS_UNAVAILABLE')return 'The app could not check both nodes. Keep both nodes powered and refresh radio status.';
  if(!snapshot.fieldSessionId)return 'Resume the saved connection from Tools before changing the channel.';
  if(snapshot.nodes.length!==2)return 'Keep both nodes powered and refresh radio status to get a report from each node.';
  if(snapshot.nodes.some(node=>node.reportAgeMs>=GATEWAY_RADIO_CAPABILITY_FRESH_MS))return 'The node reports have expired. Refresh radio status before starting a trial.';
  if(snapshot.nodes.some(node=>node.role==='ap'&&!node.canChangeAP))return 'The main node reports that radio changes are unavailable. Refresh radio status to check again.';
  return 'Radio changes are temporarily unavailable. End any active connection test or shared internet session, then refresh radio status.';
}
