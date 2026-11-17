<script lang="ts">
  import HelpButton from './HelpButton.svelte';
  import {onMount, tick} from 'svelte';
  import {Capacitor} from '@capacitor/core';
  import {App} from '@capacitor/app';
  import type {NativeVoiceLabClient, VoiceLabSnapshot} from '@aumanet/core';
  import {nativeVoiceLab} from './native-voice';
  import NativeVoicePanel from './NativeVoicePanel.svelte';
  import NativeVoiceStrip from './NativeVoiceStrip.svelte';
  import NativeVoiceDeveloper from './NativeVoiceDeveloper.svelte';
  import GatewayDeveloper from './GatewayDeveloper.svelte';
  import NodeWifiPanel from './NodeWifiPanel.svelte';
  import TrustedConnectionPanel from './TrustedConnectionPanel.svelte';
  import NetworkOverview from './NetworkOverview.svelte';
  import ToolsPanel from './ToolsPanel.svelte';
  import BandwidthEstimator from './BandwidthEstimator.svelte';
  let planningRates:{uploadKbps:number;downloadKbps:number;completedAt:number}|undefined;
  import LinkQualityStatus from './LinkQualityStatus.svelte';
  import {networkOverview as networkView} from './network-overview';
  import DeviceDetails from './DeviceDetails.svelte';
  import InternetSettings from './InternetSettings.svelte';
  import NodeUpdatesPanel from './NodeUpdatesPanel.svelte';
  import NodeList from './NodeList.svelte';
  import {nativeNodeUpdates} from './native-node-updates';
  import {mergeUpdateNodes} from './node-updates-view';
  import type {NativeNodeUpdatesClient,NodeUpdatesView} from '@aumanet/core';
  import NativeRadioSettingsPanel from './NativeRadioSettingsPanel.svelte';
  import {createNativeGatewayRadioSettingsClient} from './native-gateway-radio-settings';
  import type {NativeGatewayRadioSettingsClient} from '@aumanet/core';
  import LinkBenchmarkPanel from './LinkBenchmarkPanel.svelte';
  import {nativeLinkBenchmark} from './native-link-benchmark';
  import type {LinkBenchmarkClient} from './link-benchmark';
  import {nativeInternetSharing} from './native-internet-sharing';
  import type {InternetSharingClient,InternetState} from './internet-sharing/client';
  import {networkNodes,mapNameSelection,type DeviceSelection} from './network-topology';
  import type {NativeGroupMessagesSnapshot} from '@aumanet/protocol';
  import {nativeTrustedConnection} from './native-trusted-connection';
  import type {TrustedConnectionClient,TrustedConnectionState} from '@aumanet/core';
  import {nativeNodeConnection} from './native-node-connection';
  import {wifiStatus,groupConnectionStatus,type NodeConnectionClient,type NodeConnectionState} from './node-connection';
  import NativeVoiceSettings from './NativeVoiceSettings.svelte';
  import {nativeLocation} from './native-location';
  import NativeLocationPanel from './NativeLocationPanel.svelte';
  import MapPanel from './MapPanel.svelte';
  import {groupMapMembers} from './maps/group-members';
  import {appearance} from './appearance';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import LiveSettingsOverview from './LiveSettingsOverview.svelte';
  import DiagnosticsSettings from './DiagnosticsSettings.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import './appearance/theme.css';
  import GroupPanel from './GroupPanel.svelte';
  import GroupRoster from './GroupRoster.svelte';
  import {nativeGroup} from './native-group';
  import {nativeGroupMessages} from './native-group-messages';
  import NativeGroupMessages from './NativeGroupMessages.svelte';
  import NativeGroupMessageComposer from './NativeGroupMessageComposer.svelte';
  import type {NativeGroupMessagesClient} from '@aumanet/core';
  import {LocalGroupVoiceCoordinator,joinGroupVoiceExplicit, type NativeGroupClient, type GroupSnapshot, type LocalGroupVoiceState} from '@aumanet/core';
  import {locationView, type NativeLocationClient, type LocationSnapshot} from '@aumanet/core';
  import {MapPin, MessageCircle, Mic, Network, Users, Router, Settings, ArrowLeft, Wifi, X, LocateFixed, Info} from '@lucide/svelte';
  let mapNavigation=0;
  let tab='Network', settings=false, settingsCategory='', developerOptions=false,returnToMap=false;
  let keyboardVisible=false;
  onMount(()=>{
    const viewport=window.visualViewport;let tallest=viewport?.height??innerHeight,lastWidth=innerWidth;
    const update=()=>{const height=viewport?.height??innerHeight;if(Math.abs(innerWidth-lastWidth)>40){tallest=height;lastWidth=innerWidth;}const focused=!!document.activeElement?.closest('.group-composer');if(!focused)tallest=Math.max(tallest,height);keyboardVisible=focused&&tallest-height>120;};
    viewport?.addEventListener('resize',update);window.addEventListener('resize',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
    return()=>{viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
  });
  let native=false;
  let nodeConnectionClient:NodeConnectionClient|undefined,nodeConnectionState:NodeConnectionState|undefined;
  let trustedConnectionClient:TrustedConnectionClient|undefined,trustedConnectionState:TrustedConnectionState|undefined;
  let networkOverview:NetworkOverview,networkMessages:NativeGroupMessagesSnapshot|undefined,networkMessagesError=false;
  $: nativeGroupStatus=groupConnectionStatus(groupState?.status,!!groupError);
  $: trustedStage=trustedConnectionState?.snapshot?.state;
  $: connectionTitle=trustedStage==='connected'?nativeGroupStatus:trustedStage==='connecting-node'?'Connecting node Wi-Fi':trustedStage==='connecting-group'?'Connecting group':trustedStage==='reconnecting'?'Reconnecting':trustedStage==='starting'?'Connecting':trustedStage==='attention'?'Connection needs attention':trustedStage==='stopping'?'Stopping connection':trustedConnectionState?.snapshot?.canConnect?'Ready to resume':wifiStatus(nodeConnectionState?.snapshot);
  let voiceClient:NativeVoiceLabClient|undefined, voiceState:VoiceLabSnapshot|undefined, voiceError='';
  let locationClient:NativeLocationClient|undefined, locationState:LocationSnapshot|undefined, nativeLocationError='';
  let groupClient:NativeGroupClient|undefined, groupState:GroupSnapshot|undefined, groupError='';
  let selectedDevice:DeviceSelection|undefined=undefined,detailScope='',selectedUpdateNodeId='';
  let nodeUpdatesClient:NativeNodeUpdatesClient|undefined,nodeUpdatesView:NodeUpdatesView|undefined;
  $: updateScope=nodeUpdatesView?.snapshot?.scope;
  $: firmwareNodes=nodeUpdatesView?.loaded&&!nodeUpdatesView.error&&updateScope&&updateScope.groupId===groupState?.group?.id&&updateScope.selfId===groupState?.identity.id&&updateScope.epoch===groupState?.group?.epoch?nodeUpdatesView.snapshot?.nodes??[]:[];
  $: deviceNodes=mergeUpdateNodes(networkNodes(groupState,Math.max(0,locationClock-groupReceivedAt),!!groupError),groupError?[]:firmwareNodes);
  $: {const next=`${groupState?.group?.id??''}:${groupState?.group?.epoch??0}:${groupState?.identity.id??''}`;if(next!==detailScope){detailScope=next;selectedDevice=undefined;selectedUpdateNodeId='';}}
  function showNodeUpdates(nodeId=''){selectedDevice=undefined;selectedUpdateNodeId=nodeId;openSettings('Firmware updates');}
  function showMember(id:string){const pin=id==='self'?groupState?.identity.id:id;if(pin&&(pin===groupState?.identity.id||groupState?.members.some(member=>member.id===pin)))selectedDevice={kind:'phone',id:pin};}
  let groupMessagesClient:NativeGroupMessagesClient|undefined;
  let internetClient:InternetSharingClient|undefined,internetState:InternetState|undefined;
  let benchmarkClient:LinkBenchmarkClient|undefined;
  let radioSettingsClient:NativeGatewayRadioSettingsClient|undefined;
  $: internetHeader=networkView({group:groupState,groupError,internet:internetState}).internetTitle;
  $: mapNodeMemberIds=deviceNodes.flatMap(node=>node.phones.map(phone=>phone.id===groupState?.identity.id?'self':phone.id)).filter(id=>mapNameSelection(deviceNodes,groupState?.identity.id??'',id).kind==='node');
  function showMapName(id:string){if(groupState)selectedDevice=mapNameSelection(deviceNodes,groupState.identity.id,id);}
  let groupVoice:LocalGroupVoiceCoordinator|undefined, groupVoiceState:LocalGroupVoiceState|undefined;
  async function joinVoice(){await joinGroupVoiceExplicit(()=>groupError?undefined:groupClient?.state??groupState,trustedConnectionClient,async()=>{if(!groupVoice)throw new Error('Voice is unavailable.');await groupVoice.join();});}
  let groupReceivedAt=0;
  $: mapMembers=groupMapMembers(groupState,Math.max(0,locationClock-groupReceivedAt),!!groupError);
  $: voicePeerNames=Object.fromEntries((groupState?.members??[]).map(member=>[member.id,member.name]));
  let locationReceivedAt=0, locationClock=0;
  $: if(locationState) locationReceivedAt=performance.now();
  $: ownLocationView=locationView(locationState,Math.max(0,locationClock-locationReceivedAt));
  let fix: GeolocationCoordinates | undefined, fixAt=0, clock=Date.now(), locating=false, locationError='';
  let locationSupported=false;
  let alive=true;
  let scroller: HTMLElement | undefined;
  const tabs=[['Map',MapPin],['Messages',MessageCircle],['Voice',Mic],['Group',Users],['Network',Network]] as const;
  const explain=(e: unknown)=>e instanceof Error?e.message:String(e);
  function navigate(name: string) {
    if(name==='Map')mapNavigation++;
    void voiceClient?.endPtt();
    settings=false; settingsCategory=''; developerOptions=false; tab=name;
    void tick().then(()=>scroller?.scrollTo({top:name==='Messages'?scroller.scrollHeight:0}));
  }
  function showMap(){navigate('Map');}
  function openSettings(category=''){
    returnToMap=false;void voiceClient?.endPtt();settings=true;settingsCategory=category;developerOptions=false;
    void tick().then(()=>{scroller?.scrollTo({top:0});document.getElementById('live-settings-title')?.focus();});
  }
  function openMapManagement(){openSettings('Maps & storage');returnToMap=true;}
  function backSettings(){
    void voiceClient?.endPtt();const previous=settingsCategory,wasDeveloper=developerOptions;
    if(returnToMap){returnToMap=false;settings=false;settingsCategory='';}
    else if(developerOptions)developerOptions=false;
    else if(settingsCategory)settingsCategory='';
    else settings=false;
    void tick().then(()=>{scroller?.scrollTo({top:0});
      if(!settings)document.querySelector<HTMLButtonElement>('button[aria-label="Open settings"]')?.focus();
      else if(wasDeveloper)Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent?.trim()==='Developer options')?.focus();
      else Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-category]')).find(button=>button.dataset.settingsCategory===previous)?.focus();
    });
  }
  function editProfile(){openSettings('Group & members');void tick().then(()=>{const editor=document.querySelector<HTMLDetailsElement>('.group-panel .profile-editor');if(editor){editor.open=true;editor.scrollIntoView({block:'start'});editor.querySelector<HTMLInputElement>('input')?.focus();}});}
  function locate() {
    if (!navigator.geolocation) { locationError='Geolocation is unavailable in this browser.'; return; }
    locating=true; locationError='';
    navigator.geolocation.getCurrentPosition(position=>{if(alive){fix=position.coords;fixAt=position.timestamp;clock=Date.now();locating=false;}},e=>{if(alive){locationError=e.message;locating=false;}},
      {enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  onMount(()=>{
    void appearance.load();
    native=Capacitor.getPlatform()==='android';
    nodeConnectionClient=nativeNodeConnection();
    const stopNodeConnection=nodeConnectionClient?.subscribe(value=>nodeConnectionState=value);
    trustedConnectionClient=nativeTrustedConnection();
    const stopTrustedConnection=trustedConnectionClient?.subscribe(value=>trustedConnectionState=value);
    voiceClient=nativeVoiceLab();
    locationClient=nativeLocation();
    groupClient=nativeGroup();
    groupMessagesClient=nativeGroupMessages();
    internetClient=nativeInternetSharing();
    benchmarkClient=nativeLinkBenchmark();
    radioSettingsClient=createNativeGatewayRadioSettingsClient();
    nodeUpdatesClient=nativeNodeUpdates();
    const stopNodeUpdates=nodeUpdatesClient?.subscribe(value=>nodeUpdatesView=value);
    const stopInternet=internetClient?.subscribe(value=>internetState=value);
    const stopNetworkMessages=groupMessagesClient?.subscribe(value=>{networkMessages=value;networkMessagesError=false;});
    const stopNetworkMessageErrors=groupMessagesClient?.onError(()=>networkMessagesError=true);
    const stopGroup=groupClient?.subscribe(value=>{
      groupMessagesClient?.setScope(value.group?{groupId:value.group.id,selfId:value.identity.id}:undefined);
      internetClient?.setScope(value.group?{groupId:value.group.id,selfId:value.identity.id,epoch:value.group.epoch}:undefined);
      benchmarkClient?.setScope(value.group?{groupId:value.group.id,selfId:value.identity.id,epoch:value.group.epoch}:undefined);
      nodeUpdatesClient?.setScope(value.group?{groupId:value.group.id,selfId:value.identity.id,epoch:value.group.epoch}:undefined);
      radioSettingsClient?.setScope(value.group?{groupId:value.group.id,selfId:value.identity.id,epoch:value.group.epoch}:undefined);
      groupReceivedAt=performance.now();groupState=value;groupError='';
    });
    const stopGroupErrors=groupClient?.onError(message=>groupError=message);
    if(groupClient&&voiceClient)groupVoice=new LocalGroupVoiceCoordinator(groupClient,voiceClient);
    const stopGroupVoice=groupVoice?.subscribe(value=>groupVoiceState=value);
    const stopLocation=locationClient?.subscribe(value=>{locationState=value;nativeLocationError='';});
    const stopLocationErrors=locationClient?.onError(message=>nativeLocationError=message);
    locationClock=performance.now();
    const locationClockTimer=setInterval(()=>locationClock=performance.now(),500);
    const stopVoice=voiceClient?.subscribe(value=>{voiceState=value;voiceError='';});
    const stopVoiceErrors=voiceClient?.onError(message=>voiceError=message);
    locationSupported=window.isSecureContext && !!navigator.geolocation;
    const interval=setInterval(()=>clock=Date.now(),10000);
    const listener=Capacitor.isNativePlatform()?App.addListener('backButton',()=>{const dialog=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);if(dialog)dialog.close();else if(settings)backSettings();else if(tab!=='Network')navigate('Network');else App.exitApp();}):undefined;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&settings&&!document.querySelector('dialog[open]')){event.preventDefault();backSettings();}};
    document.addEventListener('keydown',escape);
    return ()=>{alive=false;stopNodeUpdates?.();nodeUpdatesClient?.dispose();radioSettingsClient?.setScope(undefined);benchmarkClient?.dispose();stopInternet?.();internetClient?.dispose();stopNetworkMessages?.();stopNetworkMessageErrors?.();stopTrustedConnection?.();trustedConnectionClient?.dispose();stopNodeConnection?.();nodeConnectionClient?.dispose();groupMessagesClient?.setScope(undefined);stopVoice?.();stopVoiceErrors?.();stopLocation?.();stopLocationErrors?.();stopGroup?.();stopGroupErrors?.();stopGroupVoice?.();groupVoice?.dispose();clearInterval(locationClockTimer);clearInterval(interval);document.removeEventListener('keydown',escape);void listener?.then(l=>l.remove());};
  });
</script>

<div class="app-shell live-shell" class:composing={keyboardVisible} class:settings-screen={settings} class:map-screen={!settings&&tab==='Map'} class:messages-screen={!settings&&tab==='Messages'} class:voice-screen={!settings&&tab==='Voice'&&!!voiceClient} class:network-screen={!settings&&tab==='Network'} class:dark={$appearance.theme==='Dark'}>
  <header>
    {#if native}<div class="link-quality-top"><LinkQualityStatus signals={groupError||groupState?.error?[]:groupState?.radioSignals??[]} elapsedMs={Math.max(0,locationClock-groupReceivedAt)} phoneAttached={!!trustedConnectionState?.loaded&&!trustedConnectionState.error&&!!trustedConnectionState.snapshot?.attachmentAvailable} dark={$appearance.theme==='Dark'} ontest={()=>openSettings('Test connection')}/></div>{/if}
    <div class="brandline"><a href="/"><img class="brand-logo" src={$appearance.theme==='Dark'?'/brand/aumanet-mark-light.svg':'/brand/aumanet-mark.svg'} alt=""/><strong>{settings||tab==='Network'?'AuMaNET':tab==='Messages'?groupState?.group?.name||'Messages':tab}</strong></a><button class="square" aria-label={settings?'Close settings':'Open settings'} onclick={()=>{if(settings){settings=false;settingsCategory='';developerOptions=false;}else openSettings();}}>{#if settings}<X size={22}/>{:else}<Settings size={22}/>{/if}</button></div>
    <div class="live-status">{#if native}<span><Wifi size={16}/>{trustedConnectionClient&&trustedConnectionState?.snapshot?.attachmentAvailable?'Saved node Wi-Fi connected':nativeGroupStatus}</span><span>{trustedConnectionClient?trustedConnectionState?.snapshot?.voiceState==='ptt-ready'?'Push to talk ready':nativeGroupStatus:'Node identity / radio unverified'}</span>{:else}<span>Open the Android app to connect your group</span>{/if}</div>
    {#if !settings&&tab!=='Network'&&internetHeader!=='Internet sharing'}<button class="internet-active" onclick={()=>openSettings('Internet sharing')}>{internetHeader}</button>{/if}
    <p class="hint connectivity"><button class="group-link" aria-label="Open group details" onclick={()=>openSettings('Group & members')}>{groupError||groupState?.error?groupState?.group?`${groupState.group.name} · Status unavailable`:'Group status unavailable':groupState?.group?`${groupState.group.name} · ${groupState.members.filter(member=>member.connected).length} connected`: 'No group connected'}</button> · <button class="group-link" onclick={()=>openSettings('Internet sharing')}>{internetHeader}</button></p>
  </header>
  <main bind:this={scroller} class:voice-destination={!settings&&tab==='Voice'&&!!voiceClient}>
    {#if voiceError&&(settings||tab!=='Voice')}<div class="card live-error" role="alert">Native voice state unavailable: {voiceError}. Use the native notification to mute/stop if needed.</div>{/if}
    {#if settings && developerOptions}
      <div class="title-row"><h1 id="live-settings-title" tabindex="-1">Developer options</h1><button class="outline" onclick={backSettings}>Back to settings</button></div>
      {#if voiceClient}<NativeVoiceDeveloper client={voiceClient} state={voiceState} sourceError={voiceError}/>{/if}
      <GatewayDeveloper/>
    {:else if !settings&&tab==='Group'}
      <GroupRoster state={groupState} sourceError={groupError} onmember={showMember} onmanage={()=>openSettings('Group & members')}/>
    {:else if !settings&&tab==='Network'}
      <NetworkOverview identifiedNodes={deviceNodes} bind:this={networkOverview} dark={$appearance.theme==='Dark'}
        ontools={()=>openSettings('Tools & checks')}
        state={{trusted:trustedConnectionState,wifi:nodeConnectionState,group:groupState,groupError,messages:networkMessages,messagesError:networkMessagesError,internet:internetState,radioElapsedMs:Math.max(0,locationClock-groupReceivedAt)}}
        onstop={trustedConnectionClient?()=>void trustedConnectionClient?.disconnect():undefined}
        onresume={trustedConnectionClient?()=>void (trustedConnectionState?.snapshot?.state==='attention'?trustedConnectionClient?.reconnect():trustedConnectionClient?.connect()):undefined}
        ondevice={selection=>selectedDevice=selection} ongroup={()=>navigate('Group')} onmessages={()=>navigate('Messages')} oninternet={()=>openSettings('Internet sharing')} onbenchmark={()=>openSettings('Test connection')} onradiosettings={()=>openSettings('Radio settings')}>
        {#if trustedConnectionClient}<TrustedConnectionPanel compact client={trustedConnectionClient} state={trustedConnectionState??trustedConnectionClient.state} group={groupState} voiceSupported={!!voiceClient}
          onsetup={()=>{networkOverview.closeOptions();openSettings('Nodes');}}/>
        {:else}<NodeWifiPanel state={nodeConnectionState} supported={!!nodeConnectionClient} groupStatus={nativeGroupStatus}
          onrefresh={()=>void nodeConnectionClient?.refresh()} onsettings={()=>void nodeConnectionClient?.openWifiSettings()}
          ongroup={()=>{networkOverview.closeOptions();openSettings('Group & members');}}/>{/if}
      </NetworkOverview>
    {:else if settings || tab==='Network'}
      {#if !settings||!['Appearance','Notifications','Diagnostics & about'].includes(settingsCategory)}<div class="title-row"><div><h1 id={settings?'live-settings-title':undefined} tabindex="-1">{settings?settingsCategory||'Settings':'Network'}</h1></div>{#if settings&&settingsCategory}<button class="square" aria-label={returnToMap?'Back to map':'Back to settings'} onclick={backSettings}><ArrowLeft size={22}/></button>{/if}</div>{/if}
      {#if settings&&!settingsCategory}<LiveSettingsOverview profileName={groupState?.identity.name??''} groupName={groupState?.group?.name??''} onopen={openSettings} onprofile={editProfile} ondeveloper={()=>{void voiceClient?.endPtt();developerOptions=true;void tick().then(()=>{scroller?.scrollTo({top:0});document.getElementById('live-settings-title')?.focus();});}}/>{/if}
      {#if native&&trustedConnectionClient&&(!settings||settingsCategory==='Nodes')}<TrustedConnectionPanel client={trustedConnectionClient} state={trustedConnectionState??trustedConnectionClient.state} group={groupState} voiceSupported={!!voiceClient} onsetup={()=>openSettings('Nodes')}/>{/if}
      {#if native&&(!settings&&!trustedConnectionClient||settings&&settingsCategory==='Nodes')}<NodeWifiPanel state={nodeConnectionState} supported={!!nodeConnectionClient} groupStatus={nativeGroupStatus}
        onrefresh={()=>void nodeConnectionClient?.refresh()} onsettings={()=>void nodeConnectionClient?.openWifiSettings()} ongroup={()=>openSettings('Group & members')}/>{/if}
      {#if (!settings||settingsCategory==='Group & members')&&groupClient}<GroupPanel client={groupClient} state={groupState} sourceError={groupError} onleave={()=>groupVoice?.leave()} onmember={showMember}/>{/if}
      {#if settings&&settingsCategory==='Group & members'&&!groupClient}<section class="card"><h2>Group membership unavailable</h2><p>Open the Android app to create or join a verified local group and set your name.</p></section>{/if}
      {#if settings&&settingsCategory==='Appearance'}<AppearanceSettings page onback={backSettings} client={appearance}/>{/if}
      {#if settings&&settingsCategory==='Notifications'}<NotificationSettings page onback={backSettings}/>{/if}
      {#if settings&&settingsCategory==='Diagnostics & about'}<DiagnosticsSettings page onback={backSettings} group={groupState} voice={voiceState} messages={groupMessagesClient?.state} location={locationState} groupError={!!groupError} voiceError={!!voiceError} locationError={!!nativeLocationError}/>{/if}
      {#if settings&&settingsCategory==='Maps & storage'}<MapPanel managementOnly units={$appearance.units} onshowmap={showMap}/><section class="card"><h2>Local messages</h2><p>Manage saved conversation history in Messages.</p><button class="outline" onclick={()=>navigate('Messages')}>Open Messages</button></section>{/if}
      {#if settings&&settingsCategory==='Internet sharing'}<InternetSettings client={internetClient} state={internetState} group={groupState} groupUnavailable={!!groupError} onnotifications={()=>openSettings('Notifications')}/>{/if}
      {#if settings&&settingsCategory==='Test connection'}<LinkBenchmarkPanel client={benchmarkClient} group={groupState} units={$appearance.units} ontools={()=>openSettings('Tools & checks')} onplan={result=>{planningRates={uploadKbps:result.upload.goodputBitsPerSecond/1000,downloadKbps:result.download.goodputBitsPerSecond/1000,completedAt:result.completedAt};openSettings('Plan bandwidth');}}/>{/if}
      {#if settings&&settingsCategory==='Tools & checks'}<ToolsPanel onopen={category=>{if(category==='Plan bandwidth')planningRates=undefined;openSettings(category);}}/>{/if}
      {#if settings&&settingsCategory==='Plan bandwidth'}<BandwidthEstimator initialRates={planningRates}/><button class="outline" onclick={()=>openSettings('Test connection')}>Open connection tests</button><button class="outline" onclick={()=>openSettings('Tools & checks')}>All tools &amp; checks</button>{/if}
      {#if settings&&settingsCategory==='Firmware updates'}<NodeUpdatesPanel client={nodeUpdatesClient} group={groupState} nodeNames={Object.fromEntries(deviceNodes.map(node=>[node.id,node.name]))} bind:selectedNodeId={selectedUpdateNodeId}/>{/if}
      {#if settings&&settingsCategory==='Nodes'}<section class="card"><h2>Nodes in your group</h2><NodeList nodes={deviceNodes} onselect={selection=>selectedDevice=selection}/><button class="outline" onclick={()=>showNodeUpdates()}>Firmware updates</button></section>{/if}
      {#if settings&&settingsCategory==='Radio settings'}<NativeRadioSettingsPanel client={radioSettingsClient} benchmark={benchmarkClient} group={groupState}/>{/if}
      {#if settings&&settingsCategory==='Nodes'}<section class="card"><h2>Radio settings</h2><button class="outline" onclick={()=>openSettings('Radio settings')}>Open radio settings</button></section>{/if}
      {#if settings&&settingsCategory==='Nodes'}<section class="card"><h2>Test connection</h2><button class="outline" onclick={()=>openSettings('Test connection')}>Open connection test</button></section>{/if}
      {#if settings&&settingsCategory==='Location & privacy'}{#if locationClient}<NativeLocationPanel units={$appearance.units} client={locationClient} state={locationState} sourceError={nativeLocationError}
        sharingAvailable={!!groupState?.group&&['hosting','connected'].includes(groupState.status)} sharingEnabled={groupState?.sharingLocation??false}
        onsharingchange={enabled=>void groupClient?.sharing(enabled).catch(e=>groupError=explain(e))}/>{:else}<section class="card"><h2>Browser location</h2><p>Request a position for your map. Group sharing is available in the Android app.</p><button class="outline" disabled={!locationSupported||locating} onclick={locate}>{locating?'Requesting position…':'Request my position'}</button>{#if fix}<button class="outline" onclick={()=>{fix=undefined;fixAt=0;}}>Clear position from map</button>{/if}{#if locationError}<p role="alert">{locationError}</p>{/if}</section>{/if}{/if}
      {#if settings&&settingsCategory==='Voice & audio'}{#if voiceClient}<NativeVoiceSettings client={voiceClient} state={voiceState} sourceError={voiceError}/>{:else}<section class="card"><h2>Native voice unavailable</h2><p>Open the Android app to use group voice and save audio preferences.</p></section>{/if}{/if}
    {:else if tab==='Messages'}
      {#if groupMessagesClient}<NativeGroupMessages client={groupMessagesClient} group={groupState} units={$appearance.units} onconnect={()=>navigate('Network')}/>
      {:else}<section class="card"><h2>Group messages</h2><p>Open the Android app to send and receive messages with your group.</p></section>{/if}
    {:else if tab==='Map'}
      {#if locationClient}<MapPanel units={$appearance.units} fix={locationState?.fix} ageMs={ownLocationView.ageMs??Infinity} active={locationState?.status==='active'&&!!locationState.active&&!nativeLocationError}
        locationStatus={nativeLocationError||locationState?.message||locationState?.status||'Location is off'}
        members={mapMembers} group={groupState} groupElapsedMs={Math.max(0,locationClock-groupReceivedAt)} groupUnavailable={!!groupError} onmemberdetails={showMember} onmembernamedetails={showMapName} nodeMemberIds={mapNodeMemberIds} navigationToken={mapNavigation} onprivacysettings={()=>openSettings('Location & privacy')} onmanage={openMapManagement}/>
      {:else}
      <MapPanel units={$appearance.units} fix={fix?{latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy,timestamp:fixAt}:undefined} ageMs={fix?Math.max(0,clock-fixAt):Infinity} active={!!fix}
        locationStatus={locationError||'Location is off'} navigationToken={mapNavigation} onprivacysettings={()=>openSettings('Location & privacy')} onmanage={openMapManagement}/>
      {/if}
    {:else if tab==='Voice'}
      {#if voiceClient}<NativeVoicePanel client={voiceClient} state={voiceState} sourceError={voiceError||groupVoiceState?.error||''}
        channelJoined={groupState?.voiceJoined??false} joining={groupVoiceState?.working??false}
        channelName={groupState?.group?.name??'Group voice'} peerName={groupState?.members.find(member=>member.id===voiceState?.groupPeerId)?.name??'Connected phone'}
        peerNames={voicePeerNames}
        channelMembers={groupState?.members??[]} selfId={groupState?.identity.id??''}
        channelAvailable={!!groupState?.group&&!groupError&&['hosting','connected'].includes(groupState.status)}
        onjoin={groupVoice?joinVoice:undefined} onleave={groupVoice?()=>groupVoice!.leave():undefined}/>
      {:else}<section class="card"><h2>Group voice</h2><p>Group voice is available in the Android app.</p></section>{/if}
    {/if}
  </main>
  {#if !settings && tab==='Messages' && groupMessagesClient}<NativeGroupMessageComposer client={groupMessagesClient}/>{/if}
  {#if voiceClient&&voiceState&&(voiceState.joined||groupState?.voiceJoined)&&(settings||tab!=='Voice')}<NativeVoiceStrip client={voiceClient} state={voiceState} waiting={!voiceState.joined} sourceError={voiceError||groupVoiceState?.error||''} open={()=>navigate('Voice')}/>{/if}
  <nav aria-label="Primary navigation">{#each tabs as [name,Icon]}<button class:active={!settings && tab===name} aria-current={!settings && tab===name?'page':undefined} onclick={()=>navigate(name)}><span><Icon size={23}/></span>{name}</button>{/each}</nav>
</div>

<DeviceDetails {firmwareNodes} onupdate={showNodeUpdates} selection={selectedDevice} group={groupState} nodes={deviceNodes} ownFix={locationState?.fix} ownAgeMs={ownLocationView.ageMs??Infinity} ownActive={locationState?.status==='active'&&!!locationState.active&&!nativeLocationError} elapsedMs={Math.max(0,locationClock-groupReceivedAt)} groupUnavailable={!!groupError} units={$appearance.units} dark={$appearance.theme==='Dark'} onselect={selection=>selectedDevice=selection} onclose={()=>selectedDevice=undefined}/>

<style>
  .link-quality-top{float:right;margin-left:8px}.settings-screen .live-status,.settings-screen .connectivity{display:none}.settings-screen header{padding-top:10px;padding-bottom:10px}.settings-screen .brandline{margin-bottom:0}

  .group-link{border:0;padding:0;background:transparent;color:inherit;font:inherit;text-align:left;text-decoration:underline;text-underline-offset:3px}.title-row h1{overflow-wrap:anywhere}.title-row:has(#live-settings-title){gap:12px;flex-wrap:wrap}
  .live-shell.network-screen header{padding:7px 18px 7px}.live-shell.network-screen .brandline{margin-bottom:0}.network-screen .live-status,.network-screen .connectivity{display:none}.network-screen .brandline>a{margin-right:auto}.live-shell.network-screen main{padding-top:17px}
  .voice-screen header{padding:10px 12px}.voice-screen .brandline{margin-bottom:0;flex-wrap:nowrap;gap:6px}.voice-screen .brandline strong{font-size:22px}.voice-screen .brandline>a{min-width:0}.voice-screen .live-status,.voice-screen .connectivity{display:none}
  .live-shell main.voice-destination{display:flex;flex-direction:column;overflow:hidden;min-height:0}.voice-destination>.live-error{flex:none}
  .live-shell{max-width:1100px}.live-shell header{border-bottom:1px solid var(--line)}.live-status,.live-status>span{display:flex;align-items:center;gap:10px}.live-status{justify-content:space-between;flex-wrap:wrap;font-size:12px}.live-error{color:#9f301f;background:#fff0e7;padding:10px;border-radius:9px;overflow-wrap:anywhere}.live-shell .brandline{margin-bottom:10px}.live-shell main{padding-top:20px}.live-shell .card h2{font-size:20px}.live-shell .card p{line-height:1.65}.live-shell nav button{flex:1}
  @media(min-width:800px){.live-shell header{padding:22px 28px}.live-shell main{padding:24px 28px}.live-shell .title-row h1{font-size:30px}.live-shell nav{justify-content:center}.live-shell nav button{max-width:170px}}
  .connectivity{margin:8px 0 0}
  @media(max-height:450px){.live-shell{height:100dvh;margin:0;border-radius:0;border:0}.live-shell header{padding:6px 12px}.live-shell .brandline{margin-bottom:0}.live-shell .brandline strong{font-size:20px}.live-shell .live-status,.live-shell .connectivity{display:none}.live-shell main{padding:8px 12px}.live-shell nav{padding:2px 8px}.live-shell nav button{min-height:40px;flex-direction:row;justify-content:center}.live-shell nav button span{padding:3px 8px}}
  @media(max-height:320px){}
  @media(max-height:320px){.live-shell:has(:global(.group-composer)) header,.live-shell:has(:global(.group-composer)) nav{display:none}}
</style>
