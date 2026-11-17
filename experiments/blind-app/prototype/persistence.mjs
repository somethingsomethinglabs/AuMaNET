import {clone, transition} from './model.mjs';

// Privacy stops and cancellation must still take effect if device storage fails.
const localStops = new Set([
  'mute', 'release', 'leaveVoice', 'receiveAudio', 'voiceInterruption',
  'disconnect', 'forget', 'cancelRequest', 'stopLocation', 'clearLocation',
  'revokeLocation', 'stopOffer', 'stopInternet', 'pausePhoto', 'pauseArea',
  'cancelFirmware', 'rollbackRadio', 'stopTest', 'restart', 'nodeLoss',
  'manualMap', 'tick', 'fault'
]);

export function persistTransition(previous, action, params, writeState, now=Date.now()) {
  const next = transition(previous, action, params, now);
  try {
    if (next.faults.write && action !== 'fault') throw new Error('Simulated storage failure');
    if (writeState(next) === false) throw new Error('Storage write failed');
    return {state:next, ok:true};
  } catch {
    const stopLocally = localStops.has(action) ||
      (['testPermission', 'record', 'experiment', 'lease'].includes(action) && params.value === false);
    const state = stopLocally ? next : clone(previous);
    if (action === 'draft') state.draft = {...next.draft, state:'error'};
    if (action === 'retryDraft' || action === 'send') state.draft.state = 'error';
    if (action === 'preferences') state.preferences.state = 'failed';
    if (action === 'identity') state.nameSave = 'uncertain';
    state.notice = action === 'send'
      ? 'Message was not sent: device storage could not save it. Your draft is still here. Retry saving the draft before sending again.'
      : ['draft', 'retryDraft'].includes(action)
        ? 'Draft could not be saved. Your text is still here in this window; keep it open and retry saving.'
        : stopLocally
          ? 'Applied in this window only: device storage could not save the change.'
          : 'Change was not saved: device storage is unavailable. Your previous saved state is unchanged.';
    return {state, ok:false};
  }
}
