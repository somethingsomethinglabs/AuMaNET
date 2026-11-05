param([switch]$Once)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$pythonCommand = if (Test-Path -LiteralPath $bundledPython) { $bundledPython } else { 'python' }
$builder = Join-Path $projectRoot 'scripts/build-print-bundle.py'
if ($Once) { & $pythonCommand $builder } else { & $pythonCommand $builder --watch }
exit $LASTEXITCODE
