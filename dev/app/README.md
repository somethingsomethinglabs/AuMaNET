# Companion application

Interactive SvelteKit + TypeScript UI prototype matching the design concepts, with locally persisted sample messages, settings and internet source choice. Map, Messages, Voice, Network and the Settings hub are implemented. Leaflet 2.0.0-beta.1 renders a bundled illustrative terrain image; this is not Getlost mapping or real geographic coverage.

From the repository root:

```powershell
npm ci
npm run dev -w @aumanet/app
npm run check -w @aumanet/app
npm run build -w @aumanet/app
npm run preview -w @aumanet/app
```

The static build is bundled into the Capacitor Android host. No backend, cloud account, real microphone, radio, GPS or internet routing is used. Pairing, firmware and device maintenance screens explicitly explain their demo behavior. Real transport/audio/background services remain behind future platform adapters. See the [application plan](../../design/android-app-plan.md).
