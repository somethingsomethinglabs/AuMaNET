import type { ConnectivitySnapshot } from '@aumanet/protocol';

/** Platform boundary for design spikes; real implementations remain unproven. */
export interface ConnectivityAdapter {
  readonly source: 'simulated' | 'device';
  snapshot(): Promise<ConnectivitySnapshot>;
}

export type { ConnectivitySnapshot } from '@aumanet/protocol';
export {UsbBenchAdapter} from './usb-bench.js';
export {WebBluetoothAdapter, type WebBluetooth, type BluetoothSnapshot, type BluetoothState} from './web-bluetooth.js';
export {NativeBluetooth, type NativeBleClient} from './native-bluetooth.js';
export {CompanionMessages, type MessageWorkspaceStore, type MessageWorkspace, type PendingMessage} from './companion-messages.js';
export {IndexedDbMessageStore} from './indexeddb-messages.js';
export {NativeVoiceLabClient,voicePttReadiness,type VoicePttReadiness,type VoicePttReadinessReason,type NativeVoiceLabBridge,type VoiceLabSnapshot,type VoiceLabSignal} from './native-voice-lab.js';
export {NativeLocationClient, type NativeLocationBridge, type LocationSnapshot, type LocationFix, locationView, LOCATION_STALE_MS} from './native-location.js';
export {NativeGroupClient, type NativeGroupBridge, type GroupSnapshot, type GroupMember, type GroupFix, type GroupSignal} from './native-group.js';
export {LocalGroupVoiceCoordinator, type LocalGroupVoiceState} from './local-group-voice.js';
export {joinGroupVoiceExplicit} from './explicit-group-voice.js';
export {TrustedConnectionClient,parseTrustedConnection,type TrustedConnectionBridge,type TrustedConnectionSnapshot,type TrustedConnectionState,type TrustedVoiceMode} from './trusted-connection.js';
export {radioSignalView,radioSignalStrengthColor,RADIO_READ_STALE_MS} from './radio-signal.js';
export type {RadioSignal} from '@aumanet/protocol';
export {NativeGroupMessagesClient, GroupMessageOutcomeUnknownError, type NativeGroupMessagesBridge, type PendingGroupMessageSend, type NativeGroupMessagesSnapshot, type GroupMessagesScope, type GroupMessageRecord, type GroupMessageLookup, type GroupImageSaveResult} from './native-group-messages.js';
export * from './native-gateway-radio-settings.js';
export * from './native-node-updates.js';
export * from './node-client-registry.js';
export * from './node-lan-allocator.js';
export * from './node-direct-routes.js';
export * from './relay-recovery-policy.js';
