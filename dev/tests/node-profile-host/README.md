# Runtime profile C fault tests

`& dev/tests/node-profile-host/run.ps1` compiles the production `main/node_profile.c` into a native host executable using the isolated portable Zig 0.14.1 compiler under the user tools directory. Pass `-Compiler` for an existing compatible Zig executable. No global PATH, driver, SDK or USB changes occur. Output stays under ignored `dev/artifacts/node-profile-host`.

The fake headers only replace ESP/NVS/console boundary calls. Assertions exercise the actual profile implementation, not a reimplementation: missing profile, role selection, persisted/runtime distinction and reboot, create-only idempotency/conflict, exact physical target, touched/running radio guards, every record-byte corruption, short record, unavailable NVS, failed set/commit/readback. These do not establish ESP flash power-loss durability or physical radio operation.

Profile record in `amn_profile1`, key `profile`, is exactly 16 bytes: `41 4d 4e 50 31 00 00 00` magic/version, byte 8 operating role (`01` AP or `02` station), byte 9 zero, and bytes 10–15 exact ESP base Wi-Fi MAC. NVS provides its integrity checks; this record is local configuration, not cryptographic group authority or a network invitation. Group identities, private link credentials, gateway grants and counters remain in their existing namespaces.

USB commands:

- `node-profile`: schema `aumanet.node-profile.v1`, type `node_profile`; state, target MAC, persisted `role`, selected `runtime_role`, `pending_reboot`, `universal`, and command `accepted` boolean. No credentials.
- `node-profile-init EXACT_BASE_MAC A|B`: create-only; same existing role is idempotent, conflicting role fails.
- `node-profile-set EXACT_BASE_MAC A|B`: explicit valid-profile revision. Neither command replaces invalid or uncertain state, and neither works after radio initialization was touched.

Writes commit and read back before success. A changed profile applies only after reboot; RF startup is denied while `pending_reboot` is true. For a running node, explicitly turn radio-autostart off and reboot before modifying a profile, then reboot into the selected profile and explicitly restore autostart. Missing/invalid universal profiles enter USB-only setup. Legacy A/B builds keep compiled operating roles and can prepare a retained profile before universal migration.
