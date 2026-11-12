param(
    [ValidateSet('ports','identify','flash','smoke','selftest','radio-start','radio-status','radio-scan','link-test')]
    [string]$Action = 'smoke',
    [string]$Port,
    [string]$ExpectedNode,
    [string]$Artifact,
    [string]$PythonExe = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw 'Pass -PythonExe with the full path to a working Python 3.10+ interpreter.'
}
$packages = Join-Path $env:USERPROFILE '.codex/aumanet-tools/esp-python'
$previousPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = "$packages;$previousPythonPath"
    & $PythonExe -c 'import esptool, serial' 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $PythonExe -m pip install --target $packages -r "$PSScriptRoot/tools/requirements.txt"
        if ($LASTEXITCODE -ne 0) { throw 'Installing host flashing tools failed.' }
    }
    $boardArgs = @("$PSScriptRoot/tools/device.py", $Action)
    if ($Port) { $boardArgs += @('--port', $Port) }
    if ($ExpectedNode) { $boardArgs += @('--expect-node', $ExpectedNode) }
    if ($Artifact) { $boardArgs += @('--artifact', $Artifact) }
    & $PythonExe @boardArgs
    if ($LASTEXITCODE -ne 0) { throw "Board command failed: $Action" }
} finally {
    $env:PYTHONPATH = $previousPythonPath
}
