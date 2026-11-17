param([string]$Compiler='C:/Users/rowan/.codex/tools/aumanet-host-cc/ziglang/zig.exe')
$ErrorActionPreference='Stop'
$out=Join-Path ([IO.Path]::GetTempPath()) ('aumanet-mode-test-'+[guid]::NewGuid().ToString('N')+'.exe')
try {
    foreach($capability in 1,0){
        & $Compiler cc -std=c11 -Wall -Wextra -Werror -fsanitize=undefined "-DCONFIG_AUMANET_UPSTREAM_RELAY=$capability" -I "$PSScriptRoot/../node-profile-host/include" "$PSScriptRoot/test.c" -o $out
        if($LASTEXITCODE -ne 0){throw 'mode test compilation failed'}
        & $out | Select-Object -Last 1
        if($LASTEXITCODE -ne 0){throw 'mode test failed'}
    }
} finally {if(Test-Path -LiteralPath $out){Remove-Item -LiteralPath $out}}
