# ADR-0002: Shared UI and Android host

Status: **accepted UI direction; production host conditional**, 6 November 2026. Authority: owner selections recorded in the [Android plan](../android-app-plan.md) and [design overview](../README.md). Capacitor's implemented prototype is evidence of packaging, not a final native-service decision.

## Context and decision

Use SvelteKit and TypeScript for the shared UI. Leaflet 2.0 is the selected map-renderer direction, currently pinned to 2.0.0-beta.1. A Capacitor Android shell now hosts the static UI and handles native Back. Retain that prototype for development while validating native transport/audio/location and lifecycle boundaries before selecting it for production.

## Alternatives and limits

A web-only app cannot establish the required native background and all-app networking behaviour. A different native host remains possible if Capacitor integration fails. Renderer selection does not select a Getlost raster container, tile preparation, download/import or licence/attribution workflow. The bundled terrain is illustrative.

## Evidence and consequences

EV-UI records browser/emulator checks and prior build success, all with sample data. The Android manifest currently declares internet access; no production microphone/location/VPN service is implemented. W04 validates physical phone connectivity; W06 establishes bridge/lifecycle/security; W08 proves maps/location. A UI reload should reconcile native state when those services exist; the prototype does not demonstrate this.

Reopen the host or renderer decision if native lifecycle, map correctness/storage, size or performance cannot meet the requirements. Record exact dependency/build revisions in future evidence before promoting compatibility.
