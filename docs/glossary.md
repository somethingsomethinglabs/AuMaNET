# Glossary

| Term | AuMaNET meaning |
| --- | --- |
| Node | ESP32-S3 / HaLow device linking a phone to the radio path |
| Phone-to-node Wi-Fi | Local ordinary Wi-Fi connection; separate from HaLow |
| Wi-Fi HaLow | Node-to-node radio technology in the current prototype |
| Base/AP and station | Current radio roles; the station follows the base/AP operating tuple |
| Group | Application membership and communication scope, not merely a Wi-Fi SSID |
| Owner | Current group authority for supported operations; not an internet role |
| Donor / consumer | Phone offering mobile data / phone explicitly using that offer |
| PTT | Push to talk: deliberate hold to transmit when the call/microphone is ready |
| Voice activation | Native Always on input behavior; different from a simulated speaking indicator |
| Offline map | Stored geographic coverage; independent of GPS permission/fix/sharing |
| Operating tuple | Permitted radio channel/frequency/bandwidth combination |
| Configured TX ceiling | Requested maximum setting; not measured radiated power |
| RSSI | Directional received-signal observation with its own provenance/freshness |
| Goodput | Confirmed application payload per elapsed time, after protocol overhead |
| Boot proof | Authenticated evidence of a particular running node boot; not proof of every application path |
| NVS | Node nonvolatile configuration storage; can retain credentials and counters |
| OTA | Wireless application firmware update; distinct from USB layout migration |
| Rollback | Return from an unconfirmed candidate according to a specific firmware policy |
| Release channel | Artifact selection such as Stable/Beta/Nightly; not a radio or voice channel |
| Multi-hop | Forwarding through an intermediate node; not proved by a direct two-node test |
| Prototype / supported | Working bounded development scope / explicitly accepted release combination |

See [How AuMaNET works](overview.md) for the path diagram and [Project status](capabilities.md) for what has evidence.
