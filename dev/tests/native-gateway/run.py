#!/usr/bin/env python3
"""Compile actual pinned lwIP and gateway packet checks; no sockets/devices/RF.

Run in Linux/WSL with GCC and OpenSSL development headers already installed.
Nothing is downloaded and the SDK checkout is never patched.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idf", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = (args.output or repo / "dev/artifacts/gateway-host").resolve()
    idf = args.idf.resolve()
    source = repo / "dev/firmware/gateway"
    tests = repo / "dev/tests/native-gateway"
    module_spec = importlib.util.spec_from_file_location("gateway_overlay", source / "prepare_lwip.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    manifest = module.generate(idf, output / "overlay")
    lwip = idf / "components/lwip/lwip/src"
    sources = [tests / "GatewayPacketTest.c", tests / "crypto_openssl.c", source / "gateway.c"]
    sources += [output / "overlay" / name for name in ("ip4.c", "etharp.c", "ethernet.c", "pbuf.c")]
    sources += [lwip / "core" / name for name in
                ("init.c", "def.c", "mem.c", "memp.c", "netif.c", "inet_chksum.c", "ip.c", "stats.c", "ipv4/ip4_addr.c")]
    executable = output / "GatewayPacketTest"
    flags = ["-D_GNU_SOURCE", "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
             "-Wno-unused-parameter", "-fsanitize=address,undefined", "-fno-sanitize-recover=all",
             "-fno-omit-frame-pointer", "-include", str(source / "include/aumanet_gateway_build.h"),
             "-I" + str(tests), "-I" + str(source / "include"), "-I" + str(lwip / "include")]
    subprocess.run(["gcc", *flags, *map(str, sources), "-lcrypto", "-o", str(executable)], check=True)
    environment = dict(os.environ, ASAN_OPTIONS="detect_leaks=1:halt_on_error=1", UBSAN_OPTIONS="halt_on_error=1")
    run = subprocess.run([str(executable)], text=True, capture_output=True, env=environment)
    (output / "cases.log").write_text(run.stderr)
    run.check_returncode()
    result = json.loads(run.stdout)
    if result.get("result") != "PASS" or result.get("physical") is not False:
        raise ValueError("Unexpected host result")
    # Compile the same policies with ONLY the old SDK transmit guard restored.
    # Its real custom RX + warmed-ARP case must reproduce the physical drop.
    fixed_ip4 = (output / "overlay/ip4.c").read_text()
    fixed_guard = "#if 1 /* AuMaNET gateway: retain SDK REF-to-RAM ownership without enabling NAPT. */"
    if fixed_ip4.count(fixed_guard) != 1:
        raise ValueError("REF forwarding guard was not unique")
    old_ip4 = output / "ip4-before-ref-fix.c"
    old_ip4.write_text(fixed_ip4.replace(fixed_guard, "#if ESP_LWIP && IP_NAPT", 1))
    negative_sources = [old_ip4 if path == output / "overlay/ip4.c" else path for path in sources]
    negative_binary = output / "GatewayRefNegativeControl"
    subprocess.run(["gcc", *flags, "-DAG_EXPECT_REF_DROP=1", *map(str, negative_sources), "-lcrypto", "-o", str(negative_binary)], check=True)
    negative_run = subprocess.run([str(negative_binary)], text=True, capture_output=True, env=environment)
    (output / "ref-negative-cases.log").write_text(negative_run.stderr)
    negative_run.check_returncode()
    negative = json.loads(negative_run.stdout)
    if negative.get("result") != "PASS" or negative.get("refNegativeControl") is not True or negative.get("customRxFrees") != 1:
        raise ValueError("Expected pre-fix custom RX failure was not reproduced")
    negative.update({"meaning": "Old guard drops real custom PBUF_REF forwarding with warmed ARP; driver memory freed once",
                     "binarySha256": hashlib.sha256(negative_binary.read_bytes()).hexdigest(),
                     "ip4Sha256": hashlib.sha256(old_ip4.read_bytes()).hexdigest(), "sanitizers": ["address", "undefined"]})
    (output / "ref-negative-result.json").write_text(json.dumps(negative, indent=2)+"\n")
    result["refForwarding"] = {"oldGuardDropReproduced": True, "customRxDriverFrees": result["customRxFrees"],
                               "warmedArpBothDirections": True, "copiedMetadataExpiryRevokePartitionFenced": True,
                               "naptEnabled": False, "forcedHeaderGrowth": False}
    acquisition_source = tests / "GatewayAcquisitionNegativeTest.c"
    acquisition_binary = output / "GatewayAcquisitionNegativeTest"
    subprocess.run(["gcc", *flags, str(acquisition_source), *map(str, sources[1:]), "-lcrypto", "-o", str(acquisition_binary)], check=True)
    acquisition_run = subprocess.run([str(acquisition_binary)], text=True, capture_output=True, env=environment)
    (output / "acquisition-negative-cases.log").write_text(acquisition_run.stderr)
    acquisition_run.check_returncode()
    acquisition_result = json.loads(acquisition_run.stdout)
    if acquisition_result.get("result") != "PASS" or acquisition_result.get("physical") is not False:
        raise ValueError("Unexpected acquisition negative test result")
    acquisition_result.update({"binarySha256": hashlib.sha256(acquisition_binary.read_bytes()).hexdigest(), "sanitizers": ["address", "undefined"]})
    (output / "acquisition-negative-result.json").write_text(json.dumps(acquisition_result, indent=2)+"\n")
    result["acquisitionNegative"] = {key: acquisition_result[key] for key in ("cases", "assertions", "result", "physical")}
    ota_source = tests / "GatewayOtaPacketTest.c"
    ota_binary = output / "GatewayOtaPacketTest"
    subprocess.run(["gcc", *flags, str(ota_source), *map(str, sources[1:]), "-lcrypto", "-o", str(ota_binary)], check=True)
    ota_run = subprocess.run([str(ota_binary)], text=True, capture_output=True, env=environment)
    (output / "ota-packet-cases.log").write_text(ota_run.stderr)
    ota_run.check_returncode()
    ota_result = json.loads(ota_run.stdout)
    if ota_result.get("result") != "PASS": raise ValueError("OTA packet policy failed")
    ota_result["binarySha256"] = hashlib.sha256(ota_binary.read_bytes()).hexdigest()
    (output / "ota-packet-result.json").write_text(json.dumps(ota_result, indent=2)+"\n")
    result["otaPackets"] = ota_result
    dhcp_source = idf / "components/lwip/apps/dhcpserver/dhcpserver.c"
    dhcp_inputs = [tests / "NetifLeaseApiTest.c", tests / "dhcp-sdkconfig/sdkconfig.h", dhcp_source,
                   output / "overlay/netif_lease_api_original.inc", output / "overlay/netif_lease_api_fixed.inc",
                   *[output / "overlay" / name for name in ("netif_dhcps_start_api.inc", "netif_dhcps_stop_api.inc", "netif_dhcps_ap_autostart.inc")]]
    dhcp_binary = output / "NetifLeaseApiTest"
    dhcp_flags = [*flags, "-DAG_TEST_DHCP=1", "-ffunction-sections", "-fdata-sections",
                  "-I" + str(tests / "dhcp-sdkconfig"), "-I" + str(output / "overlay"),
                  "-I" + str(idf / "components/lwip/include/apps"), "-I" + str(dhcp_source.parent)]
    dhcp_sources = [tests / "NetifLeaseApiTest.c", *sources[1:], lwip / "core/udp.c", lwip / "core/ipv4/dhcp.c", lwip / "core/ipv4/acd.c"]
    subprocess.run(["gcc", *dhcp_flags, *map(str, dhcp_sources), "-lcrypto",
                    "-Wl,--gc-sections", "-o", str(dhcp_binary)], check=True)
    dhcp_inputs += [lwip / "core/udp.c", lwip / "core/ipv4/dhcp.c", lwip / "core/ipv4/acd.c"]
    dhcp_run = subprocess.run([str(dhcp_binary)], text=True, capture_output=True, env=environment)
    (output / "dhcp-cases.log").write_text(dhcp_run.stderr)
    dhcp_run.check_returncode()
    dhcp_result = json.loads(dhcp_run.stdout)
    if dhcp_result.get("result") != "PASS" or dhcp_result.get("physical") is not False:
        raise ValueError("Unexpected DHCP host result")
    dhcp_result.update({"binarySha256": hashlib.sha256(dhcp_binary.read_bytes()).hexdigest(),
                        "sdkServerSha256": manifest["dhcpServerSha256"], "netifInputs": manifest["netifInputs"],
                        "sanitizers": ["address", "undefined"]})
    (output / "dhcp-result.json").write_text(json.dumps(dhcp_result, indent=2) + "\n")
    (output / "dhcp-cases.log").write_text(dhcp_run.stderr)
    result["dhcp"] = {key: dhcp_result[key] for key in ("cases", "assertions", "result", "physical")}
    inputs = sources + [source / "include/aumanet_gateway.h", source / "include/aumanet_gateway_build.h",
                        source / "prepare_lwip.py", tests / "lwipopts.h", tests / "arch/cc.h", Path(__file__), acquisition_source, ota_source, source / "include/aumanet_ota.h", *dhcp_inputs]
    result.update({"compiler": subprocess.check_output(["gcc", "--version"], text=True).splitlines()[0],
                   "crypto": subprocess.check_output(["openssl", "version"], text=True).strip(),
                   "idfCommit": manifest["idfCommit"], "lwipCommit": manifest["lwipCommit"],
                   "sanitizers": ["address", "undefined"],
                   "inputSha256": {str(p.relative_to(repo)) if p.is_relative_to(repo) else "sdk/" + str(p.relative_to(idf)):
                                   hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
                   "binarySha256": hashlib.sha256(executable.read_bytes()).hexdigest()})
    (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    (output / "cases.log").write_text(run.stderr)
    print(json.dumps({key: result[key] for key in ("schema", "cases", "assertions", "result", "physical", "sanitizers")}))
    print(json.dumps({key: dhcp_result[key] for key in ("schema", "cases", "assertions", "result", "physical", "adapter")}))


if __name__ == "__main__":
    main()
