import type {GroupMessageRecord} from '@aumanet/protocol';
import {radioSignalView} from '@aumanet/core';

/** Phone clocks are displayed as reported; these labels are not trusted ordering. */
export function messageTime(timestamp:number,locale?:string){
  const date=new Date(timestamp);
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(date):'Time unavailable';
}
export function messageDate(timestamp:number,now=Date.now(),locale?:string){
  const date=new Date(timestamp),today=new Date(now);
  if(!Number.isFinite(date.getTime()))return'Time unavailable';
  if(date.toDateString()===today.toDateString())return'Today';
  today.setDate(today.getDate()-1);if(date.toDateString()===today.toDateString())return'Yesterday';
  return new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',...(date.getFullYear()!==new Date(now).getFullYear()?{year:'numeric'}:{})}).format(date);
}
export function messageDelivery(row:GroupMessageRecord,connected:boolean,benchmarkPaused=false){
  const image=row.kind==='image';
  if(row.state==='received')return image?(row.image?.state==='available'?'Photo received':'Photo download pending'):'Received';
  if(row.state==='delivered')return image?'Photo shared · Download not confirmed':row.recipients.length===1?'Delivered to phone':'Delivered to all phones';
  if(row.state==='cancelled')return'Sending stopped';
  if(row.state==='expired')return row.acknowledgedBy.length?'Expired · Some deliveries unconfirmed':'Expired · Delivery unconfirmed';
  if(row.acknowledgedBy.length)return`Delivered to ${row.acknowledgedBy.length} of ${row.recipients.length} phones`;
  if(benchmarkPaused)return'Paused for connection maintenance';
  if(row.attempts>=row.attemptLimit)return'Delivery not confirmed';
  if(!connected)return'Waiting for connection';
  return row.attempts?'Sending…':'Saved to send';
}
/** A frozen receiver-local observation only; never infer signal from delivery. */
export function messageSignal(row:GroupMessageRecord){
  const signal=row.radioAtReceipt?.signals.find(value=>value.status==='available'&&value.rssiDbm!==undefined);
  if(!signal)return;
  const reading=radioSignalView(signal,0);
  return{value:reading.value,label:`Radio signal ${reading.value}`,description:`Node connection observation saved when this phone received the message. ${reading.direction}. ${reading.verification}. ${reading.ageAtReceipt}. RF sample age unknown. This cached reading is not an individual message measurement or delivery confirmation.`};
}
export function imageTransferActive(row:GroupMessageRecord,paused:boolean,connected:boolean,now=Date.now()){
  return !!row.image&&row.image.state==='downloading'&&!paused&&connected&&!(row.image.nextAutoAt&&row.image.nextAutoAt>now);
}
export function imageTransferStatus(row:GroupMessageRecord,paused:boolean,connected:boolean,now=Date.now()){
  const image=row.image;if(!image)return'Image';
  if(image.state==='expired')return'Image expired';
  if(paused||image.state==='cancelled')return'Image download paused';
  if(image.state==='failed')return'Image unavailable';
  if(!connected&&image.state!=='available')return'Waiting for connection';
  if(image.nextAutoAt&&image.nextAutoAt>now)return`Retrying in ${Math.max(1,Math.ceil((image.nextAutoAt-now)/1000))} s`;
  if(image.state==='downloading')return image.receivedBytes?'Receiving image':'Waiting for image data';
  return image.state==='placeholder'?'Queued for background download':'Image';
}
export function receivingRate(bytesPerSecond:number){return bytesPerSecond>=125000?`${(bytesPerSecond*8/1000000).toFixed(2)} Mbps`:`${(Math.max(0,bytesPerSecond)*8/1000).toFixed(1)} kbps`;}
