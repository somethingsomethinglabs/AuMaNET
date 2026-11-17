import type {GroupSnapshot,NativeGroupMessagesSnapshot} from '@aumanet/protocol';
import type {TrustedConnectionState} from '@aumanet/core';
import type {NodeConnectionState} from './node-connection';
import {radioSignalView} from '@aumanet/core';
import type {InternetState} from './internet-sharing/client';

export interface NetworkOverviewInput {
  readonly trusted?:TrustedConnectionState;
  readonly wifi?:NodeConnectionState;
  readonly group?:GroupSnapshot;
  readonly groupError?:string;
  readonly messages?:NativeGroupMessagesSnapshot;
  readonly messagesError?:boolean;
  readonly radioElapsedMs?:number;
  readonly internet?:InternetState;
}
/** Presentation only. OS attachment, approved group and message intent are distinct facts. */
export function networkOverview(input:NetworkOverviewInput){
  const {trusted,wifi,group,messages}=input;
  const connection=trusted?.loaded&&!trusted.error?trusted.snapshot:undefined;
  const groupKnown=!!group&&!input.groupError&&!group.error;
  const groupLive=groupKnown&&!!group.group&&['hosting','connected'].includes(group.status);
  const matching=!!group?.group&&connection?.groupId===group.group.id&&connection.selfId===group.identity.id;
  const wifiAttached=!!matching&&!!connection?.attachmentAvailable;
  const stage=matching?connection?.state:undefined;
  const attached=wifiAttached&&stage==='connected'&&groupLive&&!connection?.hasError;
  const verifying=wifiAttached&&!attached&&['starting','connecting-node','connecting-group','reconnecting','connected'].includes(stage??'');
  const nodeTitle=attached?'Your node · Connected':verifying?'Node Wi-Fi connected · Verifying':stage==='reconnecting'?'Reconnecting to your node':
    stage==='connecting-node'||stage==='starting'?'Connecting to your node':stage==='stopping'?'Stopping connection':
    stage==='attention'?'Connection needs attention':connection&&matching?'Your node · Disconnected':
    !wifi?.error&&wifi?.snapshot?.wifi==='available'?'Wi-Fi available · Node unverified':'Node connection not confirmed';
  const nodeDetail=attached?'Connected to your node’s Wi-Fi':verifying?(stage==='connecting-group'?'Node Wi-Fi connected · waiting for group connection.':'Your phone is on node Wi-Fi. Checking the node and group connection.'):stage==='reconnecting'?'Your saved connection will resume when it returns.':
    stage==='connecting-node'||stage==='starting'?'Joining your saved node Wi-Fi.':stage==='stopping'?'Stopping your saved connection.':
    stage==='connecting-group'?'Verifying your group connection.':stage==='attention'?'Reconnect, or open Connection details to review your saved choice.':
    connection?.canConnect?'Resume your saved node connection.':'Open Connection details to set up your node.';
  const connectedMembers=groupLive?group!.members.filter(member=>member.connected).length:0;
  const groupTitle=group?.group?.name??(groupKnown?'No group selected':'Group status unavailable');
  const groupDetail=groupLive?(group!.status==='hosting'&&connectedMembers<=1?'Group open · Waiting for another phone':
    `${connectedMembers} ${connectedMembers===1?'member':'members'} connected`):groupKnown&&group?.group?(wifiAttached&&stage==='connecting-group'?'Waiting for connection':'Saved group · Disconnected'):
    groupKnown?'Create or join a group':group?.group?'Connection status unavailable':'Open group settings to check';
  const radioSignals=groupLive?group?.radioSignals??[]:[];
  const selectedRadio=radioSignals.find(signal=>signal.status==='available')??radioSignals.find(signal=>signal.status==='unavailable')??radioSignals[0];
  const radio=selectedRadio?radioSignalView(selectedRadio,input.radioElapsedMs??0):undefined;
  const radioValue=radio?.value??'Unavailable';
  const radioDetail=radio?`${radio.direction} · ${radio.status==='stale'?'Stale report · ':''}${radio.age}`:'No authenticated radio report';
  const messageScope=groupKnown&&!!group?.group&&messages?.scope?.groupId===group.group.id&&messages.scope.selfId===group.identity.id&&messages.scope.epoch===group.group.epoch;
  let transferTitle='Transfer status unavailable',transferDetail='Open Messages to view saved messages and images.';
  if(messageScope&&messages?.storeReady&&!messages.error&&!input.messagesError){
    if(messages.benchmarkPaused){transferTitle='Paused for connection maintenance';transferDetail='Saved messages and images stay on this phone.';}
    else if(messages.deliveryPaused){transferTitle='Transfers paused';transferDetail='Saved messages and images stay on this phone.';}
    else if(!messages.connected){transferTitle='Transfers waiting';transferDetail='Delivery resumes when the group reconnects.';}
    else if(messages.sync.state==='syncing'){transferTitle='Messages syncing';transferDetail='Catching up with your connected group.';}
    else if(messages.sync.state==='failed'){transferTitle='Transfers need attention';transferDetail='Open Messages to check delivery.';}
    else if(messages.sync.state==='paused'){transferTitle='Transfers paused';transferDetail='Open Messages to check delivery.';}
    else if([...messages.history,...messages.outbox].some(row=>row.image?.state==='downloading')){
      transferTitle='Image transfer in progress';transferDetail='Open Messages for progress and stop controls.';
    }else if(messages.outbox.some(row=>['queued','unconfirmed'].includes(row.state))){
      transferTitle='Messages pending';transferDetail='Open Messages to check delivery and receipts.';
    }else{transferTitle='Transfers ready';transferDetail='Background delivery is enabled for this group.';}
  }
  const internet=input.internet,observedInternet=internet?.snapshot;
  const internetScoped=!!internet?.loaded&&groupKnown&&!!group?.group&&observedInternet?.scope?.groupId===group.group.id&&observedInternet.scope.selfId===group.identity.id&&observedInternet.scope.epoch===group.group.epoch;
  let internetTitle='Internet sharing',internetDetail='Open to check availability';
  if(internet?.error||internet&&!internet.loaded)internetDetail='Status unavailable';
  else if(observedInternet&&!observedInternet.available)internetDetail='Unavailable on this phone';
  else if(internetScoped&&observedInternet){
    const sharing=observedInternet.donation.state==='sharing',using=observedInternet.consumption.state==='connected';
    internetTitle=sharing&&using?'Sharing & using internet':sharing?'Sharing mobile data':using?'Using shared internet':'Internet sharing';
    internetDetail=observedInternet.donation.error||observedInternet.consumption.error?'Needs attention':sharing||using?'Open for usage and Stop controls':['starting','reconnecting'].includes(observedInternet.consumption.state)||observedInternet.donation.state==='starting'?'Connecting…':'Off';
  }
  const nodePhase=attached?'connected':verifying||['starting','connecting-node','connecting-group','reconnecting'].includes(stage??'')?'connecting':stage==='stopping'?'stopping':stage==='attention'||stage==='off'?'disconnected':'unknown';
  const wifiPhase=wifiAttached?'connected':nodePhase==='connecting'?'connecting':nodePhase==='disconnected'?'disconnected':nodePhase==='stopping'?'stopping':'unknown';
  const groupPhase=groupLive?'connected':nodePhase==='connecting'?'connecting':groupKnown&&!!group?.group?'disconnected':'unknown';
  const groupPhaseLabel=groupLive?'Connected':groupPhase==='connecting'?'Waiting for group':groupPhase==='disconnected'?'Disconnected':'Not confirmed';
  const needsAttention=stage==='attention'||!!matching&&!!connection?.hasError&&!attached;
  const summaryTitle=needsAttention?'Connection needs attention':attached?'Connected':wifiAttached&&nodePhase==='connecting'?(stage==='connecting-group'||stage==='connected'?'Waiting for group':'Checking your node…'):stage==='reconnecting'?'Reconnecting…':nodePhase==='connecting'?'Connecting to your node…':stage==='stopping'?'Disconnecting…':stage==='off'?'Not connected':'Check your node connection';
  const summaryDetail=needsAttention?(wifiAttached?'Your node Wi-Fi is connected. Open Connection details to review the connection.':'Open Connection details to review your saved connection and try again.'):attached?'':wifiAttached&&nodePhase==='connecting'?(stage==='connecting-group'||stage==='connected'?'Node Wi-Fi connected. Waiting for group.':'Node Wi-Fi connected. Verifying your node.'):stage==='off'?(connection?.remembered?'':'Set up your node to get connected.'):stage==='stopping'?'Ending this connection. Your saved choice will be kept.':nodePhase==='connecting'?'Your saved connection will resume when it’s available.':'Open Connection details to set up or check your node.';
  const summaryPhase=needsAttention?'attention':nodePhase;
  return{summaryTitle,summaryDetail,summaryPhase,needsAttention,wifiPhase:needsAttention&&!wifiAttached?'unknown':wifiPhase,groupPhase,groupPhaseLabel,wifiAttached,nodePhase,nodeTitle,nodeDetail,attached,nodeTone:attached?'connected':verifying?'neutral':stage==='reconnecting'||stage==='attention'?'attention':'neutral',
    groupTitle,groupDetail,groupLive,connectedMembers,transferTitle,transferDetail,radioSignals,radioValue,radioDetail,
    internetTitle,internetDetail,
    active:!!connection?.runId,canStop:!!connection?.runId&&!!trusted?.loaded&&!trusted.busy,
    busy:!!trusted?.busy};
}
