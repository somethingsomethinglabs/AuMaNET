#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$OutputDirectory='dev/artifacts/internet-probe-20261112',
    [string]$JavaHome=$env:JAVA_HOME,
    [string]$AndroidHome=$env:ANDROID_HOME
)
$ErrorActionPreference='Stop'
$probeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$probeOutput=[IO.Path]::GetFullPath((Join-Path $probeRoot $OutputDirectory))
if (!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe'))) { throw 'Set JAVA_HOME to JDK 21 or pass -JavaHome.' }
if (!$AndroidHome -or !(Test-Path -LiteralPath (Join-Path $AndroidHome 'platforms/android-36/android.jar'))) { throw 'Set ANDROID_HOME to the Android SDK or pass -AndroidHome.' }
$probeJava=$JavaHome
$probeSdk=$AndroidHome
$probeTools=Join-Path $probeSdk 'build-tools/36.0.0'
$probeAndroid=Join-Path $probeSdk 'platforms/android-36/android.jar'
$probeSource=Join-Path $PSScriptRoot 'internet-probe'
$env:JAVA_HOME=$probeJava
New-Item -ItemType Directory -Force -Path $probeOutput,(Join-Path $probeOutput 'classes'),(Join-Path $probeOutput 'dex') | Out-Null
function Assert-ProbeCommand {if($LASTEXITCODE -ne 0){throw "Independent probe build command failed ($LASTEXITCODE)."}}
& (Join-Path $probeJava 'bin/javac.exe') --release 17 -cp $probeAndroid -d (Join-Path $probeOutput 'classes') (Join-Path $probeSource 'MainActivity.java');Assert-ProbeCommand
$probeClasses=@(Get-ChildItem -LiteralPath (Join-Path $probeOutput 'classes') -Filter '*.class' -Recurse | ForEach-Object FullName)
& (Join-Path $probeTools 'd8.bat') --lib $probeAndroid --min-api 26 --output (Join-Path $probeOutput 'dex') @probeClasses;Assert-ProbeCommand
& (Join-Path $probeTools 'aapt2.exe') link --manifest (Join-Path $probeSource 'AndroidManifest.xml') -I $probeAndroid --min-sdk-version 26 --target-sdk-version 36 --debug-mode -o (Join-Path $probeOutput 'unsigned.apk');Assert-ProbeCommand
& (Join-Path $probeJava 'bin/jar.exe') --update --file (Join-Path $probeOutput 'unsigned.apk') -C (Join-Path $probeOutput 'dex') classes.dex;Assert-ProbeCommand
& (Join-Path $probeTools 'zipalign.exe') -p -f 4 (Join-Path $probeOutput 'unsigned.apk') (Join-Path $probeOutput 'aligned.apk');Assert-ProbeCommand
$probeApk=Join-Path $probeOutput 'internet-probe.apk'
& (Join-Path $probeTools 'apksigner.bat') sign --ks (Join-Path $env:USERPROFILE '.android/debug.keystore') --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $probeApk (Join-Path $probeOutput 'aligned.apk');Assert-ProbeCommand
& (Join-Path $probeTools 'apksigner.bat') verify $probeApk;Assert-ProbeCommand
$probeInputs=@('AndroidManifest.xml','MainActivity.java') | ForEach-Object { [ordered]@{path="dev/tests/internet-probe/$_";sha256=(Get-FileHash -LiteralPath (Join-Path $probeSource $_) -Algorithm SHA256).Hash.ToLowerInvariant()} }
[ordered]@{scope='Separate Android UID, default-network DNS/TCP/TLS/UDP and blocked-path test only; not a shipped app feature';apkSha256=(Get-FileHash -LiteralPath $probeApk -Algorithm SHA256).Hash.ToLowerInvariant();inputs=@($probeInputs)} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $probeOutput 'manifest.json')
Write-Output "Built independent network probe: $probeApk"
