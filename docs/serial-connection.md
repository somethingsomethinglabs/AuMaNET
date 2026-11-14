# USB & serial connection

USB is the physical identification, development and recovery path. It is separate from ordinary phone-to-node Wi-Fi and from the planned operator CLI.

## Identify the connection

Use a data-capable USB cable and inspect the operating system's ports before selecting a device. In the checked tooling, automatic discovery considers Espressif USB VID `303A` / PID `1001`; it refuses ambiguous selection. Other USB interfaces need an explicit port and board verification.

The repository's `dev/firmware/tools/device.py` supports `ports` and `identify`. With Python and the pinned host requirements installed, these are read-only inspection examples:

```sh
python dev/firmware/tools/device.py ports
python dev/firmware/tools/device.py identify --port YOUR_PORT
```

Replace `YOUR_PORT` with the actual port, such as the COM device shown by Windows. Identification checks for the expected 8 MB ESP32-S3 and can additionally bind the operation to an expected node identity. Tool dependencies are in [requirements.txt](../dev/firmware/tools/requirements.txt).

## Drivers and console ownership

There is no accepted cross-platform driver installation matrix yet. Determine whether the exact board exposes native Espressif USB or an external serial bridge before selecting a driver. Do not use a driver intended for an unrelated board. Close other serial monitors before a flash or smoke check; one process should own the port.

The development serial wrapper sets DTR/RTS before opening to avoid an unintended reset/boot transition. Unplugging or resetting a node can invalidate live group state. Review [recovery](device-configuration.md) before interrupting an active session.

## Still to document

Board photos, known USB identities by revision, Windows/macOS/Linux driver and permission steps, bootloader-button sequence and a clean-machine acceptance record. These are onboarding gaps, not completed installation instructions.
