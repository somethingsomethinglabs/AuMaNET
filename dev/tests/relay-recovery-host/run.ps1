param([string]$Compiler = 'C:/Users/rowan/.codex/tools/aumanet-host-cc/ziglang/zig.exe')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../../..").Path
$out = Join-Path ([System.IO.Path]::GetTempPath()) ('aumanet-relay-test-' + [guid]::NewGuid().ToString('N') + '.exe')
try {
    & $Compiler cc -std=c11 -Wall -Wextra -Werror -fsanitize=undefined -I "$repo/dev/firmware/gateway/include" "$repo/dev/firmware/gateway/relay_recovery.c" "$PSScriptRoot/test.c" -o $out
    if ($LASTEXITCODE -ne 0) { throw 'relay test compile failed' }
    & $out
    if ($LASTEXITCODE -ne 0) { throw 'relay test failed' }
} finally { if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out } }
