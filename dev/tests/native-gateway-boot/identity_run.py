#!/usr/bin/env python3
"""Real pinned mbedTLS / production node-key code, simulated entropy and NVS.

Run under WSL. Uses standalone upstream mbedTLS host configuration, NOT ESP
hardware acceleration/configuration. Does not mutate SDK or access devices.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--idf", required=True, type=Path)
parser.add_argument("--build-dir", required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
tests = Path(__file__).resolve().parent
mbed = args.idf / "components/mbedtls/mbedtls"

def command(argv, **kwargs):
    result = subprocess.run([str(x) for x in argv], text=True, capture_output=True, **kwargs)
    if result.returncode:
        print(result.stderr)
        result.check_returncode()
    return result

assert command(["git", "-C", args.idf, "rev-parse", "HEAD"]).stdout.strip() == "296b6eab9445fd720e71aecab961e2d3fbca9944"
expected = command(["git", "-C", args.idf, "ls-tree", "HEAD", "components/mbedtls/mbedtls"]).stdout.split()[2]
actual = command(["git", "-C", mbed, "rev-parse", "HEAD"]).stdout.strip()
assert actual == expected
assert not command(["git", "-C", mbed, "status", "--porcelain", "--untracked-files=no"]).stdout
output = root / "dev/artifacts/gateway-identity-host"
output.mkdir(parents=True, exist_ok=True)
flags = "-O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer"
configured = command(["cmake", "-S", mbed, "-B", args.build_dir, "-DENABLE_PROGRAMS=OFF", "-DENABLE_TESTING=OFF", "-DCMAKE_BUILD_TYPE=Debug", "-DCMAKE_C_FLAGS=" + flags])
built = command(["cmake", "--build", args.build_dir, "-j", "4"])
(output / "mbedtls-build.log").write_text(configured.stdout + configured.stderr + built.stdout + built.stderr)
binary = output / "NodeIdentityTest"
production = root / "dev/firmware/main/gateway_boot_crypto.c"
policy = root / "dev/firmware/gateway/boot_recovery.c"
compile_result = command(["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror", *flags.split(),
    "-I" + str(tests / "stubs"), "-I" + str(root / "dev/firmware/gateway/include"),
    "-I" + str(mbed / "include"), tests / "NodeIdentityTest.c", policy,
    args.build_dir / "library/libmbedcrypto.a", "-o", binary])
(output / "compile.log").write_text(compile_result.stdout + compile_result.stderr)
ran = command([binary], env=dict(os.environ, ASAN_OPTIONS="detect_leaks=1:halt_on_error=1", UBSAN_OPTIONS="halt_on_error=1"))
(output / "cases.log").write_text(ran.stderr)
result = json.loads(ran.stdout)
assert result["result"] == "PASS" and result["physical"] is False
inputs = [production, production.with_suffix(".h"), policy, root / "dev/firmware/gateway/include/aumanet_boot_recovery.h", Path(__file__), tests / "NodeIdentityTest.c", *sorted((tests / "stubs").glob("*.h"))]
result["inputs"] = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
result["mbedtlsCommit"] = actual
result["hostConfig"] = "standalone pinned mbedTLS default configuration; not ESP sdkconfig"
result["configSha256"] = hashlib.sha256((mbed / "include/mbedtls/mbedtls_config.h").read_bytes()).hexdigest()
result["librarySha256"] = hashlib.sha256((args.build_dir / "library/libmbedcrypto.a").read_bytes()).hexdigest()
result["binarySha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
result["sanitizers"] = ["address", "undefined"]
(output / "result.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: result[k] for k in ("schema", "cases", "assertions", "result", "physical")}))
