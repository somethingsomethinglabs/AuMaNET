#!/usr/bin/env python3
"""Generate the experimental lwIP overlay; never modify the SDK checkout.

Exact source hashes AND unique old-context matches are mandatory. This is not
a fuzzy patcher and deliberately refuses a different SDK, including line edits.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import shutil

IDF_COMMIT = "296b6eab9445fd720e71aecab961e2d3fbca9944"
LWIP_COMMIT = "fd432e4ee2cfb7f7f1c7eb7227e0173412e7b84e"
PINS = {
    "lwip/src/core/ipv4/ip4.c": "72e0d201e2ab2bf18f48a50d5bbccc19a79137488514b1ec7b3c467e6d96d677",
    "lwip/src/core/ipv4/etharp.c": "6d9c882a66362ca0c172c9da9012151105f3bbbb0d876312012cf06473ea7c82",
    "lwip/src/netif/ethernet.c": "7c493427956150ca9e97decd87784df0d2adb0f1504fa262b7e732bee1892eaf",
    "lwip/src/core/pbuf.c": "dbf73163db7db38e398ac8bf1e1c3de3b5b200bc8910b2698bace53acbf339d3",
    "CMakeLists.txt": "05cb8984d898557e0247cfbaa3ead4deda492fc149059be42f48416ada1b6fac",
}
NETIF_PINS = {
    "lwip/esp_netif_lwip.c": "5ae42521f135257d8f75334a8cadcbedaabb23a34f0384e5005cc57d4f876828",
    "CMakeLists.txt": "395d1b4a4d6c31cbffa7d265ca947a5754809eeb0c63077020f9c49e1a74938b",
}
DHCP_SERVER_SHA256 = "953f46189bc64680ea5fa761e75511fadb3aebf698a0d9dff251d77166d78b80"


def replace(text, old, new):
    if text.count(old) != 1:
        raise ValueError("Pinned patch context was not unique: " + old[:100])
    return text.replace(old, new, 1)


def transform(path, text):
    text = replace(text, '#include "lwip/opt.h"', '#include "lwip/opt.h"\n#include "aumanet_gateway.h"')
    if path.endswith("ip4.c"):
        text = replace(text, 'ip4_route_src(const ip4_addr_t *src, const ip4_addr_t *dest)\n{',
                       'ip4_route_src(const ip4_addr_t *src, const ip4_addr_t *dest)\n{\n  struct netif *ag_result = NULL;\n  if (ag_route(src, dest, &ag_result)) return ag_result;')
        text = replace(text, 'ip4_route(const ip4_addr_t *dest)\n{',
                       'ip4_route(const ip4_addr_t *dest)\n{\n  struct netif *ag_result = NULL;\n  if (ag_route(NULL, dest, &ag_result)) return ag_result;')
        text = replace(text, '  /* identify the IP header */\n  iphdr = (struct ip_hdr *)p->payload;',
                       '  /* Bound the first header before upstream IPH_V dereferences it. */\n  if (p->len < IP_HLEN) { pbuf_free(p); return ERR_OK; }\n  /* identify the IP header */\n  iphdr = (struct ip_hdr *)p->payload;')
        text = replace(text, '#if ESP_LWIP\n#if IP_NAPT\n  /* for unicast packet, check NAPT table and modify dest if needed */',
                       '  /* After upstream length/checksum validation, before NAT/local delivery. */\n  if (!ag_ip4_ingress(p, inp)) { pbuf_free(p); return ERR_OK; }\n\n#if ESP_LWIP\n#if IP_NAPT\n  /* for unicast packet, check NAPT table and modify dest if needed */')
        text = replace(text, '  /* transmit pbuf on chosen interface */\n#if ESP_LWIP && IP_NAPT\n',
                       '  /* transmit pbuf on chosen interface */\n#if 1 /* AuMaNET gateway: retain SDK REF-to-RAM ownership without enabling NAPT. */\n')
    elif path.endswith("etharp.c"):
        text = replace(text, '  hdr = (struct etharp_hdr *)p->payload;\n\n  /* RFC 826',
                       '  if (p->len < SIZEOF_ETHARP_HDR) { pbuf_free(p); return; }\n  hdr = (struct etharp_hdr *)p->payload;\n\n  /* RFC 826')
        text = replace(text, '  ETHARP_STATS_INC(etharp.recv);',
                       '  ETHARP_STATS_INC(etharp.recv);\n  if (!ag_arp_ingress(p, netif)) { pbuf_free(p); return; }')
        text = replace(text, '      if (for_us && !from_us) {',
                       '      if (!for_us && ag_proxy_arp(netif, &sipaddr, &dipaddr, hdr->shwaddr.addr)) {\n        etharp_raw(netif, (struct eth_addr *)netif->hwaddr, &hdr->shwaddr,\n                   (struct eth_addr *)netif->hwaddr, &dipaddr,\n                   &hdr->shwaddr, &sipaddr, ARP_REPLY);\n      } else if (for_us && !from_us) {')
        text = replace(text, '  const ip4_addr_t *dst_addr = ipaddr;',
                       '  const ip4_addr_t *dst_addr = ipaddr;\n  ip4_addr_t ag_hop;')
        start = text.index('    /* outside local network? if so, this can neither be a global broadcast nor')
        end = text.index('#if LWIP_NETIF_HWADDRHINT', start)
        text = replace(text, text[start:end],
                       '    /* Shared group /32s use the authenticated transport next hop, not\n     * ARP for the remote client on the HaLow underlay. */\n    if (!ag_next_hop(netif, ipaddr, &ag_hop)) return ERR_RTE;\n    dst_addr = &ag_hop;\n')
    elif path.endswith("ethernet.c"):
        text = replace(text, '  /* points to packet payload, which starts with an Ethernet header */',
                       '  if (!ag_ethernet_ingress(p, netif)) goto free_and_return;\n\n  /* points to packet payload, which starts with an Ethernet header */')
        text = replace(text, '  u16_t eth_type_be = lwip_htons(eth_type);',
                       '  u16_t eth_type_be = lwip_htons(eth_type);\n\n  /* Recheck at actual ARP dequeue, before Ethernet header insertion. */\n  if (!ag_ethernet_egress(p, netif, eth_type)) return ERR_RTE;')
    elif path.endswith("pbuf.c"):
        text = replace(text, '  p->if_idx = NETIF_NO_INDEX;',
                       '  p->if_idx = NETIF_NO_INDEX;\n  p->ag_route_generation = 0;\n  p->ag_donor_generation = 0;\n  p->ag_source_ip = 0;\n  p->ag_destination_ip = 0;\n  p->ag_input_slot = 0;\n  p->ag_l2_valid = 0;\n  memset(p->ag_l2_source, 0, sizeof(p->ag_l2_source));')
        text = replace(text, '  LWIP_ASSERT("pbuf_copy failed", err == ERR_OK);\n  return q;',
                       '  LWIP_ASSERT("pbuf_copy failed", err == ERR_OK);\n  q->ag_route_generation = p->ag_route_generation;\n  q->ag_donor_generation = p->ag_donor_generation;\n  q->ag_source_ip = p->ag_source_ip;\n  q->ag_destination_ip = p->ag_destination_ip;\n  q->ag_input_slot = p->ag_input_slot;\n  q->ag_l2_valid = p->ag_l2_valid;\n  memcpy(q->ag_l2_source, p->ag_l2_source, sizeof(q->ag_l2_source));\n  return q;')
    return text


def generate(idf, output):
    sdk = idf / "components/lwip"
    if output == idf or output.is_relative_to(idf) or idf.is_relative_to(output):
        raise ValueError("Generated output must be separate from the SDK")
    for checkout, expected in ((idf, IDF_COMMIT), (sdk / "lwip", LWIP_COMMIT)):
        actual = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
        if actual != expected:
            raise ValueError("SDK commit mismatch")
        subprocess.run(["git", "-C", str(checkout), "diff", "--exit-code", "--quiet", "HEAD", "--"], check=True)
    sources = {}
    for name, expected in PINS.items():
        data = (sdk / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("SDK source hash mismatch: " + name)
        sources[name] = data.decode("utf8")
    netif_sources = {}
    for name, expected in NETIF_PINS.items():
        data = (idf / "components/esp_netif" / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("SDK esp_netif source hash mismatch: " + name)
        netif_sources[name] = data.decode("utf8")
    if hashlib.sha256((sdk / "apps/dhcpserver/dhcpserver.c").read_bytes()).hexdigest() != DHCP_SERVER_SHA256:
        raise ValueError("SDK DHCP server hash mismatch")
    # All validation/patching succeeds before any generated output is changed.
    patched = {name: transform(name, text) for name, text in sources.items() if name.endswith(".c")}
    original_netif = netif_sources["lwip/esp_netif_lwip.c"]
    patched_netif = replace(original_netif,
        "if ((end_ip - start_ip + 1 > DHCPS_MAX_LEASE) || (start_ip >= end_ip)) {",
        "if ((end_ip - start_ip + 1 > DHCPS_MAX_LEASE) || (start_ip > end_ip)) {")
    # The maintained DHCP allocator treats both range ends as inclusive. Keep
    # every other SDK validation and the exact one-IP pool; never widen it.
    def api(text):
        begin = text.index("esp_err_t esp_netif_dhcps_option_api(esp_netif_api_msg_t *msg)\n{")
        end = text.index("\nesp_err_t esp_netif_dhcps_option(esp_netif_t *esp_netif,", begin)
        return "/* Apache-2.0; verbatim pinned ESP-IDF DHCP option function. */\n" + text[begin:end]
    extras = {"esp_netif_lwip.c": patched_netif,
              "netif_lease_api_original.inc": api(original_netif),
              "netif_lease_api_fixed.inc": api(patched_netif)}
    # Host regression uses verbatim lifecycle APIs and only the AP DHCP branch.
    # The surrounding IPC/AP event and timer owners remain explicitly adapted.
    for action in ("start", "stop"):
        begin_marker = f"static esp_err_t esp_netif_dhcps_{action}_api(esp_netif_api_msg_t *msg)\n{{"
        end_marker = f"\nesp_err_t esp_netif_dhcps_{action}(esp_netif_t *esp_netif)"
        if original_netif.count(begin_marker) != 1 or original_netif.count(end_marker) != 1:
            raise ValueError("Pinned DHCP lifecycle API context was not unique")
        begin = original_netif.index(begin_marker)
        end = original_netif.index(end_marker, begin)
        extras[f"netif_dhcps_{action}_api.inc"] = "/* Apache-2.0; verbatim pinned ESP-IDF lifecycle API. */\n" + original_netif[begin:end]
    start_marker = "static esp_err_t esp_netif_start_api(esp_netif_api_msg_t *msg)\n{"
    end_marker = "\nesp_err_t esp_netif_start(esp_netif_t *esp_netif)"
    if original_netif.count(start_marker) != 1 or original_netif.count(end_marker) != 1:
        raise ValueError("Pinned AP lifecycle API context was not unique")
    start_api = original_netif[original_netif.index(start_marker):original_netif.index(end_marker)]
    branch_marker = "    if (esp_netif->flags & ESP_NETIF_DHCP_SERVER) {"
    branch_end = "\n#ifndef CONFIG_LWIP_IPV4\n    else if"
    if start_api.count(branch_marker) != 1 or start_api.count(branch_end) != 1:
        raise ValueError("Pinned AP DHCP branch context was not unique")
    extras["netif_dhcps_ap_autostart.inc"] = "/* Apache-2.0; verbatim DHCP-server branch of pinned esp_netif_start_api. */\n" + start_api[start_api.index(branch_marker):start_api.index(branch_end)]
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"idfCommit": IDF_COMMIT, "lwipCommit": LWIP_COMMIT, "inputs": PINS,
                "netifInputs": NETIF_PINS, "dhcpServerSha256": DHCP_SERVER_SHA256, "generated": {}}
    for name, text in patched.items():
        target = output / Path(name).name
        target.write_text(text, newline="\n")
        manifest["generated"][target.name] = hashlib.sha256(target.read_bytes()).hexdigest()
    for name, text in extras.items():
        target = output / name
        target.write_text(text, newline="\n")
        manifest["generated"][target.name] = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest["generatorSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (output / "patch-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    return manifest


def component(idf, output):
    """Copy the pinned component to an app-owned build directory, then patch it.

    No symlink redirects writes into the SDK. The component CMake/source layout
    stays exactly upstream; IDF resolves this explicit extra component first.
    """
    sdk = idf / "components/lwip"
    manifest = generate(idf, output / "overlay")
    target = output / "lwip"
    if output == idf or output.is_relative_to(idf) or idf.is_relative_to(output):
        raise ValueError("Generated component must be separate from the SDK")
    shutil.copytree(sdk, target, dirs_exist_ok=True, symlinks=False,
                    ignore=shutil.ignore_patterns(".git", "__pycache__"))
    for name in manifest["inputs"]:
        if name.endswith(".c"):
            shutil.copyfile(output / "overlay" / Path(name).name, target / name)
    netif_target = output / "esp_netif"
    shutil.copytree(idf / "components/esp_netif", netif_target, dirs_exist_ok=True,
                    symlinks=False, ignore=shutil.ignore_patterns(".git", "__pycache__"))
    shutil.copyfile(output / "overlay/esp_netif_lwip.c", netif_target / "lwip/esp_netif_lwip.c")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--idf", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--component", action="store_true",
                        help="also generate an isolated complete lwIP component")
    args = parser.parse_args()
    (component if args.component else generate)(args.idf.resolve(), args.output.resolve())
