# Voice & audio

The Android prototype has native group voice. The browser design demo's speaking states are simulated; local browser microphone recording is not the native group-call implementation.

## Join and choose a route

Open **Voice**, join with the microphone muted and inspect the audio output. Choose the intended speaker, earpiece or available Android call endpoint. Selecting an output keeps the microphone muted; unmute separately when ready.

Paired Bluetooth devices appear only when Android makes them available for call audio. A paired name alone does not prove the microphone/output route is active. Check both directions by listening on the actual devices.

## Choose an input mode

- **Push to talk:** unmute as required, hold **Hold to talk** to speak and release to stop.
- **Always on:** uses native voice activation in the current app; inspect the actual microphone state and environment.
- **Mute:** stops your microphone contribution while retaining channel participation.
- **Leave:** ends your channel participation. It is different from mute and from stopping the entire node/group connection.

The voice strip keeps call controls available on other tabs. A joined channel, available route and confirmed audio path are separate observations.

## After interruptions

Connection tests, radio changes and firmware maintenance coordinate pauses where supported. Calls return muted. After recovery, confirm the route and microphone state before assuming speech is being sent. Earlier development stages needed manual route reselection on Samsung; identify the actual installed build when investigating a recurrence.

## Acceptance still needed

Two-phone native media checks are recorded, but sustained human listening quality, broad headset/OS compatibility, field interference and all lifecycle conditions remain separate. Local notes record owner-confirmed watch audio on the Nothing phone; that is not a general watch support claim. See the [voice design](../design/voice-audio-plan.md) for further engineering requirements.
