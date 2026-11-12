"""Validate immutable SDK inputs and optionally record artifact provenance."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / "sdk-lock.json").read_text())
idf, halow = map(Path, sys.argv[1:3])
paths = {
    "esp_idf": idf,
    "esp_halow": halow,
    "mm_iot_sdk": halow / "halow/components/mm-iot-sdk",
    "morse_firmware": halow / "halow/components/firmware/morse-firmware",
    "lwip": idf / "components/lwip/lwip",
}
for key, path in paths.items():
    commit = subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
    if commit != lock[key]["commit"]:
        sys.exit(f"{key} commit mismatch: {commit}")
    if subprocess.call(["git", "-C", str(path), "diff", "--quiet", "HEAD", "--"]):
        sys.exit(f"{key} contains tracked modifications; refusing an unrecorded SDK change")

def sources():
    files = list((root / "main").rglob("*")) + list((root / "tools").rglob("*")) + list((root / "gateway").rglob("*"))
    files += [root / name for name in ("CMakeLists.txt", "sdkconfig.defaults", "partitions.csv", "sdk-lock.json", "Invoke-Board.ps1")]
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(files) if path.is_file() and "__pycache__" not in path.parts}

if len(sys.argv) > 3 and sys.argv[3] == "--snapshot":
    Path(sys.argv[4]).write_text(json.dumps({"source_sha256": sources()}, indent=2) + "\n")
elif len(sys.argv) > 3:
    build, destination = map(Path, sys.argv[3:5])
    hashes = sources()
    before_path = build / "source-before.json"
    if not before_path.is_file() or json.loads(before_path.read_text())["source_sha256"] != hashes:
        sys.exit("Firmware source changed during build; no stable artifact acceptance")
    project = json.loads((build / "project_description.json").read_text())
    information = {
        "sdk": lock,
        "source_sha256": hashes,
        "source_stable": True,
        "version": project["project_version"],
        "sdkconfig_sha256": hashlib.sha256((build / "sdkconfig").read_bytes()).hexdigest(),
        "compiler": subprocess.check_output(["xtensa-esp-elf-gcc", "--version"], text=True).splitlines()[0],
        "build_python": sys.version,
        "python_packages": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions()},
        "note": "Private local development artifact. SDK configuration and image may contain bench credentials."
    }
    overlay_path = build / "gateway-components/overlay/patch-manifest.json"
    if overlay_path.is_file():
        information["gateway_overlay"] = json.loads(overlay_path.read_text())
        commands = json.loads((build / "compile_commands.json").read_text())
        for relative in ("core/ipv4/ip4.c", "core/ipv4/etharp.c", "netif/ethernet.c", "core/pbuf.c"):
            matches = [entry for entry in commands if entry["file"].endswith("/lwip/src/" + relative)]
            if len(matches) != 1 or "/gateway-components/lwip/" not in matches[0]["file"] or "aumanet_gateway_build.h" not in matches[0]["command"]:
                sys.exit("Gateway build did not use the isolated overlay and common pbuf ABI")
        netif_matches = [entry for entry in commands if entry["file"].endswith("/esp_netif/lwip/esp_netif_lwip.c")]
        if len(netif_matches) != 1 or "/gateway-components/esp_netif/" not in netif_matches[0]["file"] or "aumanet_gateway_build.h" not in netif_matches[0]["command"]:
            sys.exit("Gateway build did not use the pinned single-IP esp_netif overlay")
    (destination / "build-info.json").write_text(json.dumps(information, indent=2) + "\n")
