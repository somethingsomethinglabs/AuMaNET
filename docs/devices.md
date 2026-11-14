# Nodes & phones

## Current node direction

The candidate assembly is plain Seeed XIAO ESP32-S3 (SKU 113991114) plus XIAO HaLow carrier (SKU 109100041). The carrier reference identifies a Quectel FGH100M-H / MM6108 radio path; inspect the actual received revision and pinned BCF instead of relying on a product family name.

Current firmware tooling checks an 8 MB ESP32-S3. The firmware [SDK lock](../dev/firmware/sdk-lock.json) pins ESP-IDF v5.4.4 and esp-halow 2.11.2-esp32-2, along with immutable component commits. A pin is a reproducible input boundary, not proof of every board revision or byte-identical cross-host builds.

## Base and field roles

The current development arrangement uses node A as the base/AP role and node B as the following station. The owner phone coordinates the special-purpose signed control workflows. Roles and credentials must match the reviewed firmware/artifact set; they are not established by renaming devices in the UI.

## Development phones

Recorded application work uses a Samsung Z Flip3 and Nothing Phone (3a) Pro. Later radio/update increments were owner-side while the Nothing phone was unavailable. Each result must retain its own device/build scope. Android emulator behavior does not establish physical Wi-Fi, VPN or audio compatibility.

Exact accepted OS versions, broad minimum-device support and a public Android distribution matrix remain open. iPhone is optional future work with no accepted install path.

## Physical references

[Board measurements](../hardware/reference/seeed-xiao-esp32s3-halow/README.md) include source provenance, holes, stack alignment and uncertainties. Model-based height/connector placement should be verified on the soldered assembly before tightening case clearances. See [Enclosures](enclosures.md) for the print boundary and [Compatibility](compatibility.md) for status.
