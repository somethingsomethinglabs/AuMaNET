#!/usr/bin/env python3
"""Pure boot-policy/real ECDSA checks; no devices, sockets, SDK or RF."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[3]
source=root/"dev/firmware/gateway"
tests=Path(__file__).resolve().parent
output=root/"dev/artifacts/gateway-boot-host"
output.mkdir(parents=True,exist_ok=True)
binary=output/"BootRecoveryTest"
inputs=[source/"boot_recovery.c",source/"include/aumanet_boot_recovery.h",tests/"BootRecoveryTest.c",Path(__file__),source/"boot_transport.c",source/"include/aumanet_boot_transport.h"]
subprocess.run(["gcc","-std=c11","-O1","-g","-Wall","-Wextra","-Werror","-fsanitize=address,undefined","-fno-sanitize-recover=all","-fno-omit-frame-pointer","-I"+str(source/"include"),str(inputs[0]),str(inputs[4]),str(inputs[2]),"-lcrypto","-o",str(binary)],check=True)
run=subprocess.run([str(binary)],text=True,capture_output=True,env=dict(os.environ,ASAN_OPTIONS="detect_leaks=1:halt_on_error=1",UBSAN_OPTIONS="halt_on_error=1"))
(output/"cases.log").write_text(run.stderr)
run.check_returncode()
result=json.loads(run.stdout)
assert result["result"]=="PASS" and result["physical"] is False
result["inputs"]={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
result["binarySha256"]=hashlib.sha256(binary.read_bytes()).hexdigest()
result["sanitizers"]=["address","undefined"]
(output/"result.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({k:result[k] for k in ("schema","cases","assertions","result","physical")}))
