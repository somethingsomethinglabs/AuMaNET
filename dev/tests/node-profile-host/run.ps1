param([string]$Compiler="$env:USERPROFILE/.codex/tools/aumanet-host-cc/ziglang/zig.exe")
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath("$PSScriptRoot/../../..")
$output="$root/dev/artifacts/node-profile-host"
New-Item -ItemType Directory -Path $output -Force | Out-Null
& $Compiler cc -std=c11 -Wall -Wextra -Werror -I "$PSScriptRoot/include" "$PSScriptRoot/profile_test.c" -o "$output/profile_test.exe"
if($LASTEXITCODE -ne 0){throw 'Profile C host compilation failed'}
& "$output/profile_test.exe" | Tee-Object -FilePath "$output/result.log"
if($LASTEXITCODE -ne 0){throw 'Profile C host assertions failed'}
