# ADR-0005: Native voice and adaptive playout

Status: **proposed implementation**, 6 November 2026. Authority: owner-confirmed voice semantics in [discovery](../../discovery/README.md); implementation recommendation in the [voice plan](../voice-audio-plan.md).

## Context and proposed decision

Prototype native Android libwebrtc with Opus, APM and NetEq on isolated ordinary Wi-Fi first. Native code would own capture/playout, audio routes and joined-session lifecycle; Svelte would issue commands and display snapshots/events. Nodes forward encrypted media rather than mix or denoise it. Evaluate adaptive bounded receive queues and pitch-preserving playback adjustments, with concealment/FEC and explicit degraded states.

## Alternatives and limits

Browser audio is insufficient evidence for durable native operation. RNNoise, Silero and personalized target-speaker isolation remain separate comparisons, not installed/selected capabilities. Denoising or VAD does not establish isolation of one speaker from another. No native distribution/revision, model, processing hook, final fan-out topology or numeric performance budget is accepted here.

## Evidence and consequences

W07 follows A1–A11 and V-01–V-12: authentication, mute/PTT/Always on, first-word retention, jitter/loss/outages, audio routes, screen-off, concurrency and energy. W10 repeats real voice under multi-hop and internet load. EV-AUDIO is pending; EV-UI proves only simulated controls.

Select a reproducible library revision with usable hooks, ABI coverage and licences after the spike. Reopen on integration failure, missed speech/privacy gates, unbounded delay or excessive CPU/power. Record target changes explicitly; no seconds-old audio replay or hidden talker suppression to create an apparent pass.
