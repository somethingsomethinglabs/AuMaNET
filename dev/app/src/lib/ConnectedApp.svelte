<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  import DestinationList from './DestinationList.svelte';
  import {observeSheets} from './sheets';
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
  import {networkOverview as networkView} from './network-overview';
  import BandwidthEstimator from './BandwidthEstimator.svelte';
  let planningRates:{uploadKbps:number;downloadKbps:number;completedAt:number}|undefined;
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
  import {nativeVectorMaps,type VectorMapsClient,type MapBounds,type DownloadRequest} from './maps/vector/downloads';
  export let mapClient:VectorMapsClient|undefined=nativeVectorMaps();
  /** Dependency injection for isolated service-contract tests; no fixture is
   * imported by a product route or packaged in the Android application. */
  export let services:{group?:NativeGroupClient;messages?:NativeGroupMessagesClient;voice?:NativeVoiceLabClient;location?:NativeLocationClient;internet?:InternetSharingClient;benchmark?:LinkBenchmarkClient;updates?:NativeNodeUpdatesClient;radio?:NativeGatewayRadioSettingsClient;node?:NodeConnectionClient;trusted?:TrustedConnectionClient;coordinator?:LocalGroupVoiceCoordinator}={};
  let mapDownloadIntent:{token:number;request?:DownloadRequest}|undefined,downloadIntentToken=0;
  function chooseOfflineArea(request?:DownloadRequest){const selected=request??(mapDownloadCenter?{...mapDownloadCenter,radiusKm:5,name:'Weekend area',terrain:true}:undefined);navigate('Map');mapDownloadIntent={token:++downloadIntentToken,request:selected};}
  let mapNavigation=0,mapFocusBounds:MapBounds|undefined,mapDownloadCenter:{latitude:number;longitude:number}|undefined;
  let tab='Messages', settings=false, settingsCategory='', developerOptions=false,returnToMap=false;
  let root:HTMLDivElement,voiceSettingsDialog:HTMLDialogElement,locationDialog:HTMLDialogElement,servicesDialog:HTMLDialogElement,searchDialog:HTMLDialogElement;
  let settingsQuery='',serviceError='';
  $: settingsSearch=[...toolGroups.flatMap(group=>group.rows),{label:'Display · appearance & distance units',icon:'sun',target:'Appearance'},{label:'Notifications',icon:'bell',target:'Notifications'},{label:'Voice settings · input, audio output & sensitivity',icon:'mic',target:'Voice & audio'},{label:'Your location · permission & privacy',icon:'location',target:'Location & privacy'},{label:'Group membership, name & invitations',icon:'people',target:'Group & members'}].filter(row=>settingsQuery.trim().toLocaleLowerCase().split(/\s+/).every(term=>(row.label+' '+row.target).toLocaleLowerCase().includes(term)));
  async function stopService(action:()=>Promise<unknown>){serviceError='';try{await action();}catch{serviceError='The stop outcome could not be confirmed. Recheck the relevant service or its Android notification.';}}
  let appHeight='100dvh',initialScope=false,mapVisited=false;
  const backStack:{category:string;developer:boolean;tab:string}[]=[];
  const scrollPositions=new Map<string,number>();
  $: pageTitle=settings?developerOptions?'Advanced tools':({'Maps & storage':'Offline maps','Internet sharing':'Shared internet','Test connection':'Connection tests','Plan bandwidth':'Capacity planner','Firmware updates':'Firmware','Group & members':'Group settings','Diagnostics & about':'Diagnostics','Voice & audio':'Voice settings','Location & privacy':'Your location'}[settingsCategory]??settingsCategory)||'Settings':tab==='Messages'?groupState?.group?.name||'Messages':tab;
  $: toolGroups=[{title:'Network',rows:[{label:'Connection',icon:'wifi',target:'Connection',value:connectionTitle},{label:'Shared internet',icon:'globe',target:'Internet sharing',value:internetHeader==='Internet sharing'?'Off':internetHeader},{label:'Offline maps',icon:'download',target:'Maps & storage'}]},{title:'Devices',rows:[{label:'Nodes',icon:'node',target:'Nodes',value:deviceNodes.length?String(deviceNodes.length)+' identified':'Unverified'},{label:'Firmware',icon:'download',target:'Firmware updates'},{label:'Radio settings',icon:'radio',target:'Radio settings'}]},{title:'Tools',rows:[{label:'Connection tests',icon:'test',target:'Test connection'},{label:'Capacity planner',icon:'leaf',target:'Plan bandwidth'},{label:'Diagnostics',icon:'shield',target:'Diagnostics & about'},{label:'Settings',icon:'settings',target:''},{label:'Advanced tools',icon:'code',target:'Advanced tools'}]}];
  let keyboardVisible=false;
  onMount(()=>{
    const viewport=window.visualViewport;let tallest=viewport?.height??innerHeight,lastWidth=innerWidth;
    const update=()=>{const height=viewport?.height??innerHeight;appHeight=height+'px';if(Math.abs(innerWidth-lastWidth)>40){tallest=height;lastWidth=innerWidth;}const focused=!!document.activeElement?.closest('.group-composer');if(!focused)tallest=Math.max(tallest,height);keyboardVisible=focused&&tallest-height>120;};
    update();const stopSheets=observeSheets(root);
    viewport?.addEventListener('resize',update);window.addEventListener('resize',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
    return()=>{stopSheets();viewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
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
  let messageHistory:NativeGroupMessages;
  let internetClient:InternetSharingClient|undefined,internetState:InternetState|undefined;
  let benchmarkClient:LinkBenchmarkClient|undefined;
  let radioSettingsClient:NativeGatewayRadioSettingsClient|undefined;
  $: internetHeader=networkView({group:groupState,groupError,internet:internetState}).internetTitle;
  $: mapNodeMemberIds=deviceNodes.flatMap(node=>node.phones.map(phone=>phone.id===groupState?.identity.id?'self':phone.id)).filter(id=>mapNameSelection(deviceNodes,groupState?.identity.id??'',id).kind==='node');
  function showMapName(id:string){if(groupState)selectedDevice=mapNameSelection(deviceNodes,groupState.identity.id,id);}
  let groupVoice:LocalGroupVoiceCoordinator|undefined, groupVoiceState:LocalGroupVoiceState|undefined;
  const currentVoiceGroup=()=>groupError?undefined:groupClient?.state??groupState;
  $: voiceGroupScope=JSON.stringify([groupState?.processId,groupState?.identity.id,groupState?.group?.id,groupState?.group?.epoch]);
  async function joinVoice(isCurrent?:()=>boolean){
    await joinGroupVoiceExplicit(()=>isCurrent&&!isCurrent()?undefined:currentVoiceGroup(),trustedConnectionClient,async()=>{
      if(!groupVoice)throw new Error('Voice is unavailable.');
      await groupVoice.join(isCurrent);
    });
  }
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
  const tabs=[['Messages','chat'],['Voice','mic'],['Map','map'],['People','people'],['Tools','kit']] as const;
  const explain=(e: unknown)=>e instanceof Error?e.message:String(e);
  function saveScroll(){const pane=root?.querySelector<HTMLElement>('[data-screen-scroll]:not([hidden])');if(pane)scrollPositions.set(pane.dataset.screenScroll!,pane.scrollTop);}
  async function restoreScroll(focus=false){await tick();const pane=root?.querySelector<HTMLElement>('[data-screen-scroll]:not([hidden])');if(pane){const key=pane.dataset.screenScroll!;pane.scrollTop=scrollPositions.get(key)??(key==='Messages'?pane.scrollHeight:0);}if(focus)root?.querySelector<HTMLElement>('#screen-title')?.focus({preventScroll:true});}
  function navigate(name:string){
    if(name==='Network'){openSettings('Connection');return;}
    if(name==='Group')name='People';
    saveScroll();if(name==='Map')mapVisited=true;void voiceClient?.endPtt();settings=false;settingsCategory='';developerOptions=false;tab=name;backStack.length=0;
    void restoreScroll();
  }
  function showMap(bounds?:MapBounds){navigate('Map');mapFocusBounds=bounds;}
  function openSettings(category=''){
    saveScroll();backStack.push({category:settingsCategory,developer:developerOptions,tab:settings?'':tab});
    returnToMap=false;void voiceClient?.endPtt();settings=true;settingsCategory=category;developerOptions=category==='Advanced tools';
    void restoreScroll(true);
  }
  function openMapManagement(center?:{latitude:number;longitude:number}){mapDownloadCenter=center;openSettings('Maps & storage');returnToMap=true;}
  function backSettings(){
    saveScroll();void voiceClient?.endPtt();const previous=backStack.pop();
    if(previous){settings=!previous.tab;tab=previous.tab||tab;settingsCategory=previous.category;developerOptions=previous.developer;}
    else{settings=false;settingsCategory='';developerOptions=false;}
    void restoreScroll(true);
  }
  function editProfile(){openSettings('Group & members');void tick().then(()=>{const editor=root?.querySelector<HTMLDetailsElement>('.group-panel .profile-editor');if(editor){editor.open=true;editor.scrollIntoView({block:'start'});editor.querySelector<HTMLInputElement>('input')?.focus();}});}
  $: if(typeof document!=='undefined'){
    document.documentElement.dataset.theme=$appearance.theme==='Dark'?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',$appearance.theme==='Dark'?'#20362C':'#fffef8');
  }
  function openVoiceSettings(){void voiceClient?.endPtt();voiceSettingsDialog?.showModal();}
  function locate() {
    if (!navigator.geolocation) { locationError='Geolocation is unavailable in this browser.'; return; }
    locating=true; locationError='';
    navigator.geolocation.getCurrentPosition(position=>{if(alive){fix=position.coords;fixAt=position.timestamp;clock=Date.now();locating=false;}},e=>{if(alive){locationError=e.message;locating=false;}},
      {enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  onMount(()=>{
    void appearance.load();
    native=Capacitor.getPlatform()==='android';
    nodeConnectionClient=services.node??nativeNodeConnection();
    const stopNodeConnection=nodeConnectionClient?.subscribe(value=>nodeConnectionState=value);
    trustedConnectionClient=services.trusted??nativeTrustedConnection();
    const stopTrustedConnection=trustedConnectionClient?.subscribe(value=>trustedConnectionState=value);
    voiceClient=services.voice??nativeVoiceLab();
    locationClient=services.location??nativeLocation();
    groupClient=services.group??nativeGroup();
    groupMessagesClient=services.messages??nativeGroupMessages();
    internetClient=services.internet??nativeInternetSharing();
    benchmarkClient=services.benchmark??nativeLinkBenchmark();
    radioSettingsClient=services.radio??createNativeGatewayRadioSettingsClient();
    nodeUpdatesClient=services.updates??nativeNodeUpdates();
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
      if(!initialScope){initialScope=true;if(!value.group&&!['connecting','pending'].includes(value.status))openSettings('Set up a group');}
    });
    const stopGroupErrors=groupClient?.onError(message=>groupError=message);
    if(groupClient&&voiceClient)groupVoice=services.coordinator??new LocalGroupVoiceCoordinator(groupClient,voiceClient);
    const stopGroupVoice=groupVoice?.subscribe(value=>groupVoiceState=value);
    const stopLocation=locationClient?.subscribe(value=>{locationState=value;nativeLocationError='';});
    const stopLocationErrors=locationClient?.onError(message=>nativeLocationError=message);
    locationClock=performance.now();
    const locationClockTimer=setInterval(()=>locationClock=performance.now(),500);
    const stopVoice=voiceClient?.subscribe(value=>{voiceState=value;voiceError='';});
    const stopVoiceErrors=voiceClient?.onError(message=>voiceError=message);
    locationSupported=window.isSecureContext && !!navigator.geolocation;
    const interval=setInterval(()=>clock=Date.now(),10000);
    const listener=Capacitor.isNativePlatform()?App.addListener('backButton',()=>{const dialog=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);if(dialog)dialog.requestClose();else if(settings)backSettings();else if(tab!=='Messages')navigate('Messages');else App.exitApp();}):undefined;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&settings&&!document.querySelector('dialog[open]')){event.preventDefault();backSettings();}};
    document.addEventListener('keydown',escape);
    return ()=>{alive=false;stopNodeUpdates?.();nodeUpdatesClient?.dispose();radioSettingsClient?.setScope(undefined);benchmarkClient?.dispose();stopInternet?.();internetClient?.dispose();stopNetworkMessages?.();stopNetworkMessageErrors?.();stopTrustedConnection?.();trustedConnectionClient?.dispose();stopNodeConnection?.();nodeConnectionClient?.dispose();groupMessagesClient?.setScope(undefined);stopVoice?.();stopVoiceErrors?.();stopLocation?.();stopLocationErrors?.();stopGroup?.();stopGroupErrors?.();stopGroupVoice?.();groupVoice?.dispose();clearInterval(locationClockTimer);clearInterval(interval);document.removeEventListener('keydown',escape);void listener?.then(l=>l.remove());};
  });
</script>

<svelte:head><meta name="theme-color" content="#fffef8"/></svelte:head>
<div bind:this={root} class="app-shell live-shell" class:dark={$appearance.theme==='Dark'} class:composing={keyboardVisible} style:height={appHeight}>
  <header class="app-bar">
    {#if settings}<button class="square" aria-label="Back" onclick={backSettings}><BrandIcon name="back"/></button>{/if}
    <div class="app-heading"><h1 id="screen-title" tabindex="-1">{pageTitle}</h1>
      {#if !settings&&tab==='Messages'}<button class="connection-subtitle" onclick={()=>openSettings('Group & members')}>{groupError?'Group status unavailable':groupState?.group?`${groupState.members.filter(member=>member.connected).length} of ${groupState.members.length} connected`:'No group connected'}<BrandIcon name="chevron" size={12}/></button>
      {:else if !settings&&tab==='Voice'}<small>{groupState?.group?.name??'No group connected'}</small>{/if}
    </div>
    <button class="square connection-action" aria-label={'Connection: '+connectionTitle} title={connectionTitle} onclick={()=>openSettings('Connection')}><BrandIcon name="wifi"/></button>
    {#if !settings&&tab==='Messages'}<button class="square" aria-label="Conversation options" onclick={()=>messageHistory?.openOptions()}><BrandIcon name="more"/></button>
    {:else if !settings&&tab==='Voice'}<button class="square" aria-label="Voice settings" onclick={openVoiceSettings}><BrandIcon name="settings"/></button>
    {:else if !settings&&tab==='People'}<button class="square" aria-label="Group options" onclick={()=>openSettings('Group & members')}><BrandIcon name="more"/></button>
    {:else if !settings&&tab==='Tools'}<button class="square" aria-label="Active services" onclick={()=>servicesDialog.showModal()}><BrandIcon name="bell"/></button>{:else if settings&&!settingsCategory}<button class="square" aria-label="Find settings" onclick={()=>searchDialog.showModal()}><BrandIcon name="search"/></button>{/if}
  </header>
  {#if voiceClient&&voiceState&&(voiceState.joined||groupState?.voiceJoined)&&(settings||tab!=='Voice')}<NativeVoiceStrip client={voiceClient} state={voiceState} waiting={!voiceState.joined} sourceError={voiceError||groupVoiceState?.error||''} open={()=>navigate('Voice')} onleave={groupVoice?()=>groupVoice!.leave():()=>voiceClient!.stop()}/>{/if}
  {#if internetHeader!=='Internet sharing'}<button class="service-strip" onclick={()=>openSettings('Internet sharing')}><BrandIcon name="globe" size={16}/>{internetHeader}<BrandIcon name="chevron" size={16}/></button>{/if}
  {#if groupState?.sharingLocation}<button class="service-strip" onclick={()=>servicesDialog.showModal()}><BrandIcon name="location" size={16}/>{nativeLocationError?'Location sharing · status unavailable':'Sharing location'}<span>Controls</span></button>{/if}
  <main class="screen-host">
    <section class="screen messages-pane" data-screen-scroll="Messages" hidden={settings||tab!=='Messages'} aria-label="Messages" tabindex="-1">
      {#if groupMessagesClient}<NativeGroupMessages bind:this={messageHistory} embedded active={!settings&&tab==='Messages'} client={groupMessagesClient} group={groupState} units={$appearance.units} onconnect={()=>openSettings('Set up a group')}/>
      {:else}<div class="empty"><BrandIcon name="chat" size={40}/><h2>No conversation available</h2><p>Open the Android app to connect your group. Saved messages stay on their device.</p><button class="primary" onclick={()=>openSettings('Set up a group')}>Set up a group</button></div>{/if}
    </section>
    <section class="screen voice-pane" data-screen-scroll="Voice" hidden={settings||tab!=='Voice'} aria-label="Voice" tabindex="-1">
      {#if voiceClient&&tab==='Voice'&&!settings}{#key voiceGroupScope}<NativeVoicePanel client={voiceClient} state={voiceState} sourceError={voiceError||groupVoiceState?.error||''} channelJoined={groupState?.voiceJoined??false} joining={groupVoiceState?.working??false} channelName={groupState?.group?.name??'Group voice'} peerName={groupState?.members.find(member=>member.id===voiceState?.groupPeerId)?.name??'Connected phone'} peerNames={voicePeerNames} channelMembers={groupState?.members??[]} selfId={groupState?.identity.id??''} channelAvailable={!!groupState?.group&&!groupError&&['hosting','connected'].includes(groupState.status)} onjoin={groupVoice?joinVoice:undefined} onleave={groupVoice?()=>groupVoice!.leave():undefined} getGroup={currentVoiceGroup} onsettings={openVoiceSettings}/>{/key}
      {:else if !voiceClient}<div class="empty"><BrandIcon name="muted" size={48}/><h2>Voice is off</h2><p>Group voice requires the Android app.</p></div>{/if}
    </section>
    <section class="screen map-pane" hidden={settings||tab!=='Map'} aria-label="Map">
      {#if mapVisited}{#if locationClient}<MapPanel {mapClient} units={$appearance.units} fix={locationState?.fix} ageMs={ownLocationView.ageMs??Infinity} active={locationState?.status==='active'&&!!locationState.active&&!nativeLocationError} sharing={groupState?.sharingLocation??false} locationStatus={nativeLocationError||locationState?.message||locationState?.status||'Location is off'} members={mapMembers} group={groupState} groupElapsedMs={Math.max(0,locationClock-groupReceivedAt)} groupUnavailable={!!groupError} onmemberdetails={showMember} onmembernamedetails={showMapName} nodeMemberIds={mapNodeMemberIds} navigationToken={mapNavigation} downloadIntent={mapDownloadIntent} focusBounds={mapFocusBounds} onprivacysettings={()=>locationDialog.showModal()} onmanage={openMapManagement}/>
      {:else}<MapPanel {mapClient} units={$appearance.units} fix={fix?{latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy,timestamp:fixAt}:undefined} ageMs={fix?Math.max(0,clock-fixAt):Infinity} active={!!fix} locationStatus={locationError||'Location is off'} navigationToken={mapNavigation} downloadIntent={mapDownloadIntent} focusBounds={mapFocusBounds} onprivacysettings={()=>locationDialog.showModal()} onmanage={openMapManagement}/>{/if}{/if}
    </section>
    <section class="screen" data-screen-scroll="People" hidden={settings||tab!=='People'} aria-label="People" tabindex="-1"><GroupRoster state={groupState} sourceError={groupError} onmember={showMember} onmanage={()=>openSettings(groupState?.group?'Group & members':'Set up a group')} onnodes={()=>openSettings('Nodes')} nodeCount={deviceNodes.length}/></section>
    <section class="screen" data-screen-scroll="Tools" hidden={settings||tab!=='Tools'} aria-label="Tools" tabindex="-1"><DestinationList groups={toolGroups} onopen={openSettings}/></section>
    {#if settings}<section bind:this={scroller} class="screen secondary-screen" data-screen-scroll={'settings:'+settingsCategory} aria-label={pageTitle} tabindex="-1">
      {#if voiceError}<p class="live-error" role="alert">Voice status unavailable: {voiceError}. Use the active-service notification to mute or stop if needed.</p>{/if}
      {#if developerOptions}
        {#if voiceClient}<NativeVoiceDeveloper client={voiceClient} state={voiceState} sourceError={voiceError}/>{/if}<GatewayDeveloper/>
      {:else if !settingsCategory}
        <AppearanceSettings client={appearance}/><NotificationSettings/>
        <DestinationList groups={[{title:'Profile & groups',rows:[{label:groupState?.identity.name||'Your profile',icon:'people',target:'Group & members'},{label:'Create or join a group',icon:'people',target:'Set up a group'}]},{title:'Privacy & audio',rows:[{label:'Voice settings',icon:'mic',target:'Voice & audio'},{label:'Your location',icon:'location',target:'Location & privacy'}]},{title:'About',rows:[{label:'Diagnostics',icon:'shield',target:'Diagnostics & about'}]}]} onopen={openSettings}/>
        <div class="identity-brand"><img src={$appearance.theme==='Dark'?'/brand/logo-lockup-reverse.svg':'/brand/logo-lockup-primary.svg'} alt="AuMaNET"/></div>
      {:else if settingsCategory==='Connection'}
        <NetworkOverview identifiedNodes={deviceNodes} bind:this={networkOverview} compact dark={$appearance.theme==='Dark'} ontools={()=>navigate('Tools')} state={{trusted:trustedConnectionState,wifi:nodeConnectionState,group:groupState,groupError,messages:networkMessages,messagesError:networkMessagesError,internet:internetState,radioElapsedMs:Math.max(0,locationClock-groupReceivedAt)}} onstop={trustedConnectionClient?()=>void trustedConnectionClient?.disconnect():undefined} onresume={trustedConnectionClient?()=>void (trustedConnectionState?.snapshot?.state==='attention'?trustedConnectionClient?.reconnect():trustedConnectionClient?.connect()):undefined} ondevice={selection=>selectedDevice=selection} ongroup={()=>openSettings('Group & members')} onmessages={()=>navigate('Messages')} oninternet={()=>openSettings('Internet sharing')} onbenchmark={()=>openSettings('Test connection')} onradiosettings={()=>openSettings('Radio settings')}>
          {#if trustedConnectionClient}<TrustedConnectionPanel compact client={trustedConnectionClient} state={trustedConnectionState??trustedConnectionClient.state} group={groupState} voiceSupported={!!voiceClient} onsetup={()=>{networkOverview.closeOptions();openSettings('Nodes');}}/>{:else}<NodeWifiPanel state={nodeConnectionState} supported={!!nodeConnectionClient} groupStatus={nativeGroupStatus} onrefresh={()=>void nodeConnectionClient?.refresh()} onsettings={()=>void nodeConnectionClient?.openWifiSettings()} ongroup={()=>openSettings('Group & members')}/>{/if}
        </NetworkOverview>
      {:else if settingsCategory==='Set up a group'}
        <p class="hint">Create a group or join with an invitation.</p><DestinationList groups={[{title:'',rows:[{label:'Create group',icon:'plus',target:'Create group'},{label:'Join with invitation',icon:'lock',target:'Join a group'},{label:'Open offline map',icon:'map',target:'Open map'}]}]} onopen={target=>target==='Open map'?navigate('Map'):openSettings(target)}/>
      {:else if ['Group & members','Create group','Join a group'].includes(settingsCategory)}
        {#if groupClient}<GroupPanel client={groupClient} state={groupState} sourceError={groupError} flow={settingsCategory==='Create group'?'create':settingsCategory==='Join a group'?'join':'manage'} onleave={()=>groupVoice?.leave()} onmember={showMember}/>{:else}<div class="empty"><BrandIcon name="people" size={40}/><h2>Group setup unavailable</h2><p>Open the Android app to create or join a private group.</p></div>{/if}
      {:else if settingsCategory==='Appearance'}<AppearanceSettings client={appearance}/>
      {:else if settingsCategory==='Notifications'}<NotificationSettings/>
      {:else if settingsCategory==='Diagnostics & about'}<DiagnosticsSettings group={groupState} voice={voiceState} messages={groupMessagesClient?.state} location={locationState} groupError={!!groupError} voiceError={!!voiceError} locationError={!!nativeLocationError}/><div class="identity-brand"><img src={$appearance.theme==='Dark'?'/brand/logo-lockup-reverse.svg':'/brand/logo-lockup-primary.svg'} alt="AuMaNET"/></div>
      {:else if settingsCategory==='Maps & storage'}<MapPanel {mapClient} managementOnly onchoosearea={chooseOfflineArea} downloadCenter={mapDownloadCenter} units={$appearance.units} onshowmap={showMap}/>
      {:else if settingsCategory==='Internet sharing'}<InternetSettings client={internetClient} state={internetState} group={groupState} groupUnavailable={!!groupError} onnotifications={()=>openSettings('Notifications')}/>
      {:else if settingsCategory==='Test connection'}<LinkBenchmarkPanel client={benchmarkClient} group={groupState} units={$appearance.units} ontools={()=>navigate('Tools')} onplan={result=>{planningRates={uploadKbps:result.upload.goodputBitsPerSecond/1000,downloadKbps:result.download.goodputBitsPerSecond/1000,completedAt:result.completedAt};openSettings('Plan bandwidth');}}/>
      {:else if settingsCategory==='Plan bandwidth'}<BandwidthEstimator initialRates={planningRates}/>
      {:else if settingsCategory==='Firmware updates'}<NodeUpdatesPanel client={nodeUpdatesClient} group={groupState} nodeNames={Object.fromEntries(deviceNodes.map(node=>[node.id,node.name]))} bind:selectedNodeId={selectedUpdateNodeId}/>
      {:else if settingsCategory==='Nodes'}<div class="people-tabs"><button onclick={()=>navigate('People')}>People</button><button aria-current="page">Nodes · {deviceNodes.length}</button></div><NodeList nodes={deviceNodes} onselect={selection=>selectedDevice=selection}/><details><summary>Node connection & setup</summary>{#if trustedConnectionClient}<TrustedConnectionPanel client={trustedConnectionClient} state={trustedConnectionState??trustedConnectionClient.state} group={groupState} voiceSupported={!!voiceClient} onsetup={()=>openSettings('Connection')}/>{/if}<NodeWifiPanel state={nodeConnectionState} supported={!!nodeConnectionClient} groupStatus={nativeGroupStatus} onrefresh={()=>void nodeConnectionClient?.refresh()} onsettings={()=>void nodeConnectionClient?.openWifiSettings()} ongroup={()=>openSettings('Group & members')}/></details>
      {:else if settingsCategory==='Radio settings'}<NativeRadioSettingsPanel client={radioSettingsClient} benchmark={benchmarkClient} group={groupState}/>
      {:else if settingsCategory==='Location & privacy'}{@render locationControls()}
      {:else if settingsCategory==='Voice & audio'}{#if voiceClient}<NativeVoiceSettings client={voiceClient} state={voiceState} sourceError={voiceError}/>{:else}<p>Voice settings require the Android app.</p>{/if}
      {/if}
    </section>{/if}
  </main>
  <div class="composer-slot" hidden={settings||tab!=='Messages'}>{#if groupMessagesClient}<NativeGroupMessageComposer active={!settings&&tab==='Messages'} client={groupMessagesClient}/>{/if}</div>
  <nav aria-label="Primary navigation">{#each tabs as [name,icon]}<button class:active={tab===name} aria-current={tab===name?'page':undefined} onclick={()=>navigate(name)}><BrandIcon name={icon} size={22}/><span>{name}</span></button>{/each}</nav>
  <dialog bind:this={voiceSettingsDialog} aria-labelledby="voice-settings-title"><h2 id="voice-settings-title">Voice settings</h2>{#if voiceClient}<NativeVoiceSettings client={voiceClient} state={voiceState} sourceError={voiceError}/>{/if}</dialog>
  <dialog bind:this={locationDialog} aria-label="Your location">{@render locationControls()}</dialog>
  <dialog bind:this={searchDialog} aria-labelledby="settings-search-title"><h2 id="settings-search-title">Find settings</h2><label class="field">Search settings<input type="search" aria-label="Search settings" bind:value={settingsQuery}/></label>{#if settingsQuery}<button class="text-button" onclick={()=>{settingsQuery='';searchDialog.querySelector<HTMLInputElement>('input')?.focus();}}>Clear search</button>{/if}<DestinationList groups={[{title:'',rows:settingsSearch}]} onopen={target=>{searchDialog.close();openSettings(target);}}/>{#if !settingsSearch.length}<p role="status">No settings match “{settingsQuery}”.</p>{/if}</dialog>
  <dialog bind:this={servicesDialog} aria-labelledby="active-services-title"><h2 id="active-services-title">Active services</h2><div class="service-row"><span>Voice<small>{voiceError?'Status unavailable':voiceState?.joined?voiceState.muted?'Muted':'Joined':groupState?.voiceJoined?'Waiting for members':'Off'}</small></span>{#if voiceClient&&(voiceState?.joined||groupState?.voiceJoined)}<button class="outline" onclick={()=>void stopService(()=>voiceClient!.mute(true))}>Mute</button><button class="danger" onclick={()=>void stopService(()=>groupVoice?groupVoice.leave():voiceClient!.stop())}>Leave</button>{/if}</div><div class="service-row"><span>Location publication<small>{groupState?.sharingLocation?'Sharing':groupError?'Status unavailable':'Off'}</small></span>{#if groupClient&&groupState?.sharingLocation}<button class="danger" onclick={()=>void stopService(()=>groupClient!.sharing(false))}>Stop sharing</button>{/if}</div><div class="service-row"><span>Own position<small>{nativeLocationError?'Status unavailable':locationState?.active?'Acquiring':'Off'}</small></span>{#if locationClient&&locationState?.active&&!groupState?.sharingLocation}<button class="outline" onclick={()=>void stopService(()=>locationClient!.stop())}>Stop acquiring</button>{/if}</div><div class="service-row"><span>Internet<small>{internetHeader==='Internet sharing'?internetState?.loaded?'Off':'Unreported':internetHeader}</small></span>{#if internetClient&&internetState?.snapshot?.donation.sessionId}<button class="danger" onclick={()=>void stopService(()=>internetClient!.stopSharing())}>Stop donation</button>{/if}{#if internetClient&&internetState?.snapshot?.consumption.sessionId}<button class="danger" onclick={()=>void stopService(()=>internetClient!.stopConsuming())}>Stop using</button>{/if}</div>{#if serviceError}<p class="live-error" role="alert">{serviceError}</p>{/if}<p class="hint">Microphone, received sound, private location, publication and internet use remain separate choices.</p></dialog>
  <DeviceDetails {firmwareNodes} onupdate={showNodeUpdates} selection={selectedDevice} group={groupState} nodes={deviceNodes} ownFix={locationState?.fix} ownAgeMs={ownLocationView.ageMs??Infinity} ownActive={locationState?.status==='active'&&!!locationState.active&&!nativeLocationError} elapsedMs={Math.max(0,locationClock-groupReceivedAt)} groupUnavailable={!!groupError} units={$appearance.units} dark={$appearance.theme==='Dark'} onselect={selection=>selectedDevice=selection} onclose={()=>selectedDevice=undefined}/>
</div>
{#snippet locationControls()}
  {#if locationClient}<NativeLocationPanel units={$appearance.units} client={locationClient} state={locationState} sourceError={nativeLocationError} sharingAvailable={!groupError&&!!groupState?.group&&['hosting','connected'].includes(groupState.status)} sharingEnabled={groupState?.sharingLocation??false} onsharingchange={async enabled=>{if(!groupClient)throw new Error('Group connection is unavailable.');await groupClient.sharing(enabled);}}/>
  {:else}<section><h2>Your location</h2><p class="hint">Location stays private until you share it. Group sharing requires the Android app.</p><button class="outline" disabled={!locationSupported||locating} onclick={locate}>{locating?'Finding position…':'Find my position'}</button>{#if fix}<button class="outline" onclick={()=>{fix=undefined;fixAt=0;}}>Clear last position</button>{/if}{#if locationError}<p role="alert">{locationError}</p>{/if}</section>{/if}
{/snippet}
