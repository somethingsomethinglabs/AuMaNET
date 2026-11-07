> **Historical baseline — superseded 6 November 2026.** This Pi/Heltec/OpenMANET material is retained for reference. Its “current” choices, purchasing restrictions and build steps do not apply to the active ESP32-S3/HaLow investigation. Read the [current handbook](../docs/index.md) or [archive context](../docs/archive.md).

# HaLow antenna shortlist: voice and data, practical range

Reviewed 2026-11-05. AliExpress-only purchasing; exact listings, landed costs and received antenna performance remain unverified. These are engineering candidates rather than a completed purchase selection. GPS antennas are separate and cannot substitute for HaLow antennas.

## Two interchangeable sets

| Set | Candidate | Intended use |
|---|---|---|
| A: compact mobile | **Heltec GT-800 whip**, correct 915 MHz option; manufacturer specifies 863-928 MHz and 50 ohms | Default portable/vehicle-group antenna to evaluate. Compact omnidirectional antenna avoids needing to aim at moving peers. Published gain in the actual installed configuration still needs checking; no invented dBi or range claim. |
| B: elevated camp/relay | **Heltec fiberglass omni, 900-930 MHz / 5.5 dBi / N male option** | Mount on a supported short mast at camp, with an appropriate short low-loss feed. Keep mechanical weight off the radio's SMA port. Higher-gain omni is a tradeoff in vertical coverage, not an unconditional range improvement in gullies or on slopes. |

The [GT-800 manufacturer page](https://heltec.org/project/gt-800-whip-antenna/) explicitly includes HaLow use. The [fiberglass product page](https://heltec.org/project/fiberglass-omni-antennas/) mixes several variants and contains inconsistent generic details; require the selected antenna's gain/pattern/dimensions and matching listing before ordering. Do not select its 868-only option. A [MikroTik 915 Omni](https://mikrotik.com/product/915_omni_antenna), documented at 5.2 dBi with mounting/feed accessories, is a technical comparison only; AliExpress sourcing and relative price are not established.

These are two alternative single-antenna setups for the same radio, not a two-antenna MIMO system. Start with one compact antenna per pilot node and one mast kit to test as a relay. A directional panel/Yagi can be evaluated later for a fixed known path, but would not serve dispersed moving vehicles in every direction. Do not buy a vague high-gain antenna on its dBi label alone.

## Connector and mounting plan

Proposed enclosure interface: **standard SMA female bulkhead**, with SMA-male compact whip. Internally use the exact micro-coax plug matching the received HC01P V2 socket, with a short flexible pigtail. The photos and Heltec feeder catalogue suggest U.FL/IPEX generation 1 as a candidate; verify socket dimensions and mating part rather than treating all IPEX connectors as interchangeable. [Heltec feeder reference](https://heltec.org/project/ipex1-to-sma-antenna-feeder-cable-rf113-10mm/).

For the N-male fiberglass option, the remote cable needs N-female at the antenna and SMA-male at the enclosure bulkhead. Confirm pin/socket and thread at both ends; SMA and RP-SMA are different. Strain-relieve the mast feed and use the selected sealing system, not an unsupported heavy antenna on a miniature connector. Mount vertically, clear of bodies/metalwork, and keep GPS separate. A roof mount's ground-plane requirements follow its antenna design.

Turn off radio power before antenna changes. Do not operate an enabled transmitter with an open RF port. No splitter is included. Characterise feed loss at the operating band and minimise cable length; raising a radio nearer the antenna can be better than a long thin coax run.

## Range and Australian operating gate

Use a documented antenna match across the **entire occupied HaLow channel**, not just a resonance at 915 MHz. Verify return loss/VSWR in the installed state, ideally with a calibrated antenna analyser; a good VSWR alone does not prove gain or efficiency. A LoRa-labelled passive antenna can be a candidate if its frequency coverage, impedance, radiation and connector suit the HaLow channel; LoRa branding alone establishes none of these.

No antenna is inherently high-speed. Assess voice/data goodput, loss and delay alongside reach. Test the narrowest supported/compliant channel that meets application demand, with 1/2/4 MHz as evaluation widths rather than approved presets. Do not assume 8 MHz or maximum PHY rate gives the best useful distance. Record channel, MCS, power and traffic load in each trial.

[ACMA guidance](https://www.acma.gov.au/licences/low-interference-potential-devices-lipd-class-licence) and the current applicable class-licence provision must be checked for the exact waveform/equipment. Each antenna needs its own power profile: **EIRP = conducted power + antenna gain - feed loss**, in dB units. Example only: 27 dBm + 5.5 dBi - 1 dB = 31.5 dBm; that calculation does not establish permission to operate there. Do not retain maximum TX power automatically after fitting the mast antenna. No approved Australian TX settings or guaranteed distance are stated yet.

## GPS antenna is a separate selection

The preferred DIY GPS receiver is the **assembled LC76G breakout**. Begin with its supplied compatible antenna and verify whether the offer includes it. The receiver, antenna bias, connector, coax and external placement must agree. A bare GNSS antenna connected to Pi GPIO cannot generate location data. See [GPS wiring and power-board comparison](diy-selection.md).

## Purchase/field acceptance

Obtain matching AliExpress listing captures for both antenna variants and pigtails. Confirm band, gain evidence, impedance, RF connector, dimensions, mounting and cable attenuation. First test two matching compact antennas, then change one end to the mast kit while holding location and settings constant. Repeat in open ground, forest and gullies with bidirectional messages and voice. Record failures and installed height; no general kilometre promise is appropriate before those trials.
