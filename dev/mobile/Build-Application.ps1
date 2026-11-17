#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$OutputDirectory = 'dev/artifacts/application-build',
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidHome = $env:ANDROID_HOME
)
$ErrorActionPreference = 'Stop'
$taskRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput = [IO.Path]::GetFullPath((Join-Path $taskRepository $OutputDirectory))
if (!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Set JAVA_HOME to JDK 21 or pass -JavaHome.' }
if (!$AndroidHome -or !(Test-Path -LiteralPath (Join-Path $AndroidHome 'platform-tools/adb.exe'))) { throw 'Set ANDROID_HOME or pass -AndroidHome.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null

function Get-ApplicationInputs {
    $taskPaths = @(rg --files --hidden --no-ignore dev/app/src dev/app/static dev/packages dev/mobile/android/app/src dev/maps dev/mobile/android/capacitor-lifecycle-overlay `
        -g '!**/dist/**' -g '!**/node_modules/**' -g '!**/*.tsbuildinfo' -g '!**/src/main/assets/public/**' -g '!**/__pycache__/**')
    if ($LASTEXITCODE -ne 0) { throw 'Application input inventory failed.' }
    $taskPaths += @(rg --files dev/tests -g '*.js' -g '*.mjs' -g '*.json' -g '*.py' -g '*.ts' -g '*.md' -g '*.java' -g '*.ps1' -g '*.xml')
    $taskPaths += @(rg --files dev/releases -g '*.mjs' -g '*.json' -g '*.md')
    $taskPaths += @('package.json','package-lock.json','tsconfig.json','tsconfig.base.json','dev/app/package.json','dev/app/tsconfig.json','dev/app/svelte.config.js','dev/app/vite.config.ts',
        'dev/mobile/package.json','dev/mobile/capacitor.config.ts','dev/mobile/android/app/build.gradle',
        'dev/mobile/android/build.gradle','dev/mobile/android/settings.gradle','dev/mobile/android/variables.gradle','dev/mobile/android/gradle.properties','dev/mobile/android/capacitor-lifecycle-overlay.gradle',
        'dev/mobile/android/gradlew','dev/mobile/android/gradlew.bat','dev/mobile/android/capacitor.settings.gradle',
        'dev/mobile/android/app/capacitor.build.gradle','dev/mobile/android/app/proguard-rules.pro',
        'dev/mobile/android/gradle/wrapper/gradle-wrapper.properties','dev/mobile/android/gradle/wrapper/gradle-wrapper.jar',
        'dev/mobile/Build-Application.ps1','.github/workflows/firmware-release.yml')
    @($taskPaths | Sort-Object -Unique | ForEach-Object {
        [ordered]@{path=$_.Replace('\','/');sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
}
function Invoke-CheckedBuild([string]$Name,[scriptblock]$Action) {
    & $Action *> (Join-Path $taskOutput "$Name.log")
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $taskOutput "$Name.log") -Tail 35; throw "$Name failed ($LASTEXITCODE)." }
}

Push-Location $taskRepository
try {
    $taskBefore = Get-ApplicationInputs
    $taskStarted = [DateTime]::UtcNow.ToString('o')
    Invoke-CheckedBuild 'web-build' { npm run web:build }
    Invoke-CheckedBuild 'web-tests' { npm run web:test }
    Invoke-CheckedBuild 'svelte-check' { npm run check -w '@aumanet/app' }
    $taskReleaseOutput = Join-Path $taskOutput 'firmware-release-tools'
    Invoke-CheckedBuild 'firmware-release-tests' { node dev/releases/test.mjs --output $taskReleaseOutput }
    $taskReleaseReport = Get-Content -Raw -LiteralPath (Join-Path $taskReleaseOutput 'result.json') | ConvertFrom-Json
    if ($taskReleaseReport.status -cne 'pass') { throw 'Signed firmware release tooling checks did not pass.' }
    $taskStoreOutput = Join-Path $taskOutput 'native-message-store'
    Invoke-CheckedBuild 'native-message-store-tests' { node dev/tests/native-group-messages-store.mjs --output $taskStoreOutput }
    $taskStoreReport = Get-Content -Raw -LiteralPath (Join-Path $taskStoreOutput 'result.json') | ConvertFrom-Json
    if ($taskStoreReport.status -cne 'pass') { throw 'Native message store host checks did not pass.' }
    $taskImagesOutput = Join-Path $taskOutput 'native-group-images'
    Invoke-CheckedBuild 'native-group-image-tests' { node dev/tests/native-group-images.mjs --output $taskImagesOutput --jdk $JavaHome }
    $taskImagesReport = Get-Content -Raw -LiteralPath (Join-Path $taskImagesOutput 'result.json') | ConvertFrom-Json
    if ($taskImagesReport.status -cne 'pass') { throw 'Native image transfer and delivery-worker host checks did not pass.' }
    $taskAppearanceOutput = Join-Path $taskOutput 'native-appearance'
    Invoke-CheckedBuild 'native-appearance-tests' { node dev/tests/native-appearance-preferences.mjs --output $taskAppearanceOutput }
    $taskAppearanceReport = Get-Content -Raw -LiteralPath (Join-Path $taskAppearanceOutput 'result.json') | ConvertFrom-Json
    if ($taskAppearanceReport.status -cne 'pass') { throw 'Native appearance preference host checks did not pass.' }
    $taskNamesOutput = Join-Path $taskOutput 'native-group-names'
    Invoke-CheckedBuild 'native-group-name-tests' { node dev/tests/native-group-names.mjs --output $taskNamesOutput }
    $taskNamesReport = Get-Content -Raw -LiteralPath (Join-Path $taskNamesOutput 'result.json') | ConvertFrom-Json
    if ($taskNamesReport.status -cne 'pass') { throw 'Native name journal host checks did not pass.' }
    $taskRecoveryOutput = Join-Path $taskOutput 'native-group-recovery'
    Invoke-CheckedBuild 'native-group-recovery-tests' { node dev/tests/native-group-recovery.mjs --output $taskRecoveryOutput }
    $taskRecoveryReport = Get-Content -Raw -LiteralPath (Join-Path $taskRecoveryOutput 'result.json') | ConvertFrom-Json
    if ($taskRecoveryReport.status -cne 'pass') { throw 'Native group recovery host checks did not pass.' }
    $taskGatewayIssuerOutput = Join-Path $taskOutput 'native-gateway-issuer'
    Invoke-CheckedBuild 'native-gateway-issuer-tests' { node dev/tests/native-gateway-issuer.mjs --output $taskGatewayIssuerOutput }
    $taskGatewayIssuerReport = Get-Content -Raw -LiteralPath (Join-Path $taskGatewayIssuerOutput 'result.json') | ConvertFrom-Json
    if ($taskGatewayIssuerReport.status -cne 'pass') { throw 'Native gateway issuer host checks did not pass.' }
    $taskInternetOutput = Join-Path $taskOutput 'native-internet-sharing'
    Invoke-CheckedBuild 'native-internet-sharing-tests' { node dev/tests/native-internet-sharing.mjs --output $taskInternetOutput --jdk $JavaHome }
    $taskInternetReport = Get-Content -Raw -LiteralPath (Join-Path $taskInternetOutput 'result.json') | ConvertFrom-Json
    if ($taskInternetReport.status -cne 'pass') { throw 'Native shared-internet transport and policy host checks did not pass.' }
    $taskInternetStopOutput = Join-Path $taskOutput 'native-internet-stop'
    Invoke-CheckedBuild 'native-internet-stop-tests' { node dev/tests/native-internet-stop.mjs --output $taskInternetStopOutput --jdk $JavaHome }
    $taskInternetStopReport = Get-Content -Raw -LiteralPath (Join-Path $taskInternetStopOutput 'result.json') | ConvertFrom-Json
    if ($taskInternetStopReport.status -cne 'pass') { throw 'Native shared-internet Stop bridge checks did not pass.' }
    $taskInternetLifecycleOutput = Join-Path $taskOutput 'native-internet-lifecycle'
    Invoke-CheckedBuild 'native-internet-lifecycle-tests' { node dev/tests/native-internet-lifecycle.mjs --output $taskInternetLifecycleOutput --jdk $JavaHome }
    $taskInternetLifecycleReport = Get-Content -Raw -LiteralPath (Join-Path $taskInternetLifecycleOutput 'result.json') | ConvertFrom-Json
    if ($taskInternetLifecycleReport.status -cne 'pass') { throw 'Native shared-internet lifecycle checks did not pass.' }
    $taskNodeConnectionOutput = Join-Path $taskOutput 'native-node-connection'
    Invoke-CheckedBuild 'native-node-connection-tests' { node dev/tests/native-node-connection.mjs --output $taskNodeConnectionOutput }
    $taskNodeConnectionReport = Get-Content -Raw -LiteralPath (Join-Path $taskNodeConnectionOutput 'result.json') | ConvertFrom-Json
    if ($taskNodeConnectionReport.status -cne 'pass') { throw 'Checked node Wi-Fi profile host checks did not pass.' }
    $taskTrustedConnectionOutput = Join-Path $taskOutput 'native-trusted-connection'
    Invoke-CheckedBuild 'native-trusted-connection-tests' { node dev/tests/native-trusted-connection.mjs --output $taskTrustedConnectionOutput }
    $taskTrustedConnectionReport = Get-Content -Raw -LiteralPath (Join-Path $taskTrustedConnectionOutput 'result.json') | ConvertFrom-Json
    if ($taskTrustedConnectionReport.status -cne 'pass') { throw 'Trusted connection policy/controller host checks did not pass.' }
    $taskTrustedVoiceJoinOutput = Join-Path $taskOutput 'native-trusted-voice-join'
    Invoke-CheckedBuild 'native-trusted-voice-join-tests' { node dev/tests/native-trusted-voice-join.mjs --output $taskTrustedVoiceJoinOutput --jdk $JavaHome }
    $taskTrustedVoiceJoinReport = Get-Content -Raw -LiteralPath (Join-Path $taskTrustedVoiceJoinOutput 'result.json') | ConvertFrom-Json
    if ($taskTrustedVoiceJoinReport.status -cne 'pass') { throw 'Explicit trusted muted voice Join checks did not pass.' }
    $taskVoiceTelecomOutput = Join-Path $taskOutput 'native-voice-telecom'
    Invoke-CheckedBuild 'native-voice-telecom-tests' { node dev/tests/native-voice-telecom.mjs --output $taskVoiceTelecomOutput }
    $taskVoiceTelecomReport = Get-Content -Raw -LiteralPath (Join-Path $taskVoiceTelecomOutput 'result.json') | ConvertFrom-Json
    if ($taskVoiceTelecomReport.status -cne 'pass') { throw 'Android call routing policy checks did not pass.' }
    $taskLinkBenchmarkOutput = Join-Path $taskOutput 'native-link-benchmark'
    $taskRadioSettingsOutput = Join-Path $taskOutput 'native-radio-settings'
    Invoke-CheckedBuild 'native-radio-settings-tests' { node dev/tests/native-gateway-radio-settings.mjs --output $taskRadioSettingsOutput --jdk $JavaHome }
    $taskRadioSettingsReport = Get-Content -Raw -LiteralPath (Join-Path $taskRadioSettingsOutput 'result.json') | ConvertFrom-Json
    if ($taskRadioSettingsReport.status -cne 'pass') { throw 'Authenticated radio settings host checks did not pass.' }
    $taskNodeUpdateOutput = Join-Path $taskOutput 'native-node-updates'
    Invoke-CheckedBuild 'native-node-update-tests' { node dev/tests/native-node-updates.mjs --output $taskNodeUpdateOutput }
    $taskNodeUpdateReport = Get-Content -Raw -LiteralPath (Join-Path $taskNodeUpdateOutput 'result.json') | ConvertFrom-Json
    if ($taskNodeUpdateReport.status -cne 'pass') { throw 'Native node update host checks did not pass.' }
    $taskRadioMaintenanceOutput = Join-Path $taskOutput 'native-radio-maintenance'
    Invoke-CheckedBuild 'native-radio-maintenance-tests' { node dev/tests/native-radio-maintenance.mjs --output $taskRadioMaintenanceOutput }
    $taskRadioMaintenanceReport = Get-Content -Raw -LiteralPath (Join-Path $taskRadioMaintenanceOutput 'result.json') | ConvertFrom-Json
    if ($taskRadioMaintenanceReport.status -cne 'pass') { throw 'Group radio maintenance lifetime checks did not pass.' }
    Invoke-CheckedBuild 'native-link-benchmark-tests' { node dev/tests/native-link-benchmark.mjs --output $taskLinkBenchmarkOutput }
    $taskLinkBenchmarkReport = Get-Content -Raw -LiteralPath (Join-Path $taskLinkBenchmarkOutput 'result.json') | ConvertFrom-Json
    if ($taskLinkBenchmarkReport.status -cne 'pass') { throw 'Native link benchmark checks did not pass.' }
    $taskLinkVoiceOutput = Join-Path $taskOutput 'native-link-benchmark-voice'
    Invoke-CheckedBuild 'native-link-benchmark-voice-tests' { node dev/tests/native-link-benchmark-voice.mjs --output $taskLinkVoiceOutput }
    $taskLinkVoiceReport = Get-Content -Raw -LiteralPath (Join-Path $taskLinkVoiceOutput 'result.json') | ConvertFrom-Json
    if ($taskLinkVoiceReport.status -cne 'pass') { throw 'Link benchmark voice exclusion checks did not pass.' }
    $taskTrustedLocationOutput = Join-Path $taskOutput 'native-trusted-location'
    Invoke-CheckedBuild 'native-trusted-location-tests' { node dev/tests/native-trusted-location.mjs --output $taskTrustedLocationOutput }
    $taskTrustedLocationReport = Get-Content -Raw -LiteralPath (Join-Path $taskTrustedLocationOutput 'result.json') | ConvertFrom-Json
    if ($taskTrustedLocationReport.status -cne 'pass') { throw 'Trusted location policy host checks did not pass.' }
    $taskVoiceNetworkOutput = Join-Path $taskOutput 'native-voice-network'
    Invoke-CheckedBuild 'native-voice-network-tests' { node dev/tests/native-voice-network.mjs --output $taskVoiceNetworkOutput }
    $taskVoiceNetworkReport = Get-Content -Raw -LiteralPath (Join-Path $taskVoiceNetworkOutput 'result.json') | ConvertFrom-Json
    if ($taskVoiceNetworkReport.status -cne 'pass') { throw 'Voice selected-network and PTT policy host checks did not pass.' }
    $taskVoiceSnapshotOutput = Join-Path $taskOutput 'native-voice-fixture-snapshot'
    Invoke-CheckedBuild 'native-voice-fixture-snapshot-tests' { node dev/tests/native-voice-fixture-snapshot.mjs --output $taskVoiceSnapshotOutput --jdk $JavaHome }
    $taskVoiceSnapshotReport = Get-Content -Raw -LiteralPath (Join-Path $taskVoiceSnapshotOutput 'result.json') | ConvertFrom-Json
    if ($taskVoiceSnapshotReport.status -cne 'pass') { throw 'Voice fixture snapshot coherence checks did not pass.' }
    $taskLifecycleOutput = Join-Path $taskOutput 'capacitor-lifecycle'
    Invoke-CheckedBuild 'capacitor-lifecycle-tests' { node dev/tests/capacitor-lifecycle.mjs --output $taskLifecycleOutput }
    $taskLifecycleReport = Get-Content -Raw -LiteralPath (Join-Path $taskLifecycleOutput 'result.json') | ConvertFrom-Json
    if ($taskLifecycleReport.status -cne 'pass') { throw 'Capacitor lifetime/source-overlay host checks did not pass.' }
    $taskNotificationsOutput = Join-Path $taskOutput 'native-notifications'
    Invoke-CheckedBuild 'native-notification-tests' { node dev/tests/native-notifications.mjs --output $taskNotificationsOutput }
    $taskNotificationsReport = Get-Content -Raw -LiteralPath (Join-Path $taskNotificationsOutput 'result.json') | ConvertFrom-Json
    if ($taskNotificationsReport.status -cne 'pass') { throw 'Native notification preference/delivery host checks did not pass.' }
    Invoke-CheckedBuild 'capacitor-sync' { npm run sync -w '@aumanet/mobile' }
    Invoke-CheckedBuild 'android-build' { ./dev/mobile/android/gradlew.bat -p dev/mobile/android :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:compileReleaseJavaWithJavac --console=plain }
    $taskOverlayOutput = Join-Path $taskRepository 'dev/mobile/android/build/generated/aumanet-capacitor-lifecycle'
    Invoke-CheckedBuild 'capacitor-lifecycle-overlay-audit' { node dev/mobile/android/capacitor-lifecycle-overlay/generate.mjs --sdk node_modules/@capacitor/android/capacitor --output $taskOverlayOutput --check }
    $taskOverlayProvenancePath = Join-Path $taskOverlayOutput 'overlay-provenance.json'
    $taskOverlayProvenance = Get-Content -Raw -LiteralPath $taskOverlayProvenancePath | ConvertFrom-Json
    if ($taskOverlayProvenance.schema -cne 'aumanet.capacitor-lifecycle-overlay.v1' -or $taskOverlayProvenance.version -cne '8.6.0' -or @($taskOverlayProvenance.sources.PSObject.Properties).Count -ne 3 -or @($taskOverlayProvenance.helpers.PSObject.Properties).Count -ne 2) { throw 'Capacitor overlay provenance did not match the reviewed source selection.' }
    Copy-Item -LiteralPath $taskOverlayProvenancePath -Destination (Join-Path $taskOutput 'capacitor-lifecycle-overlay-provenance.json')
    $taskAfter = Get-ApplicationInputs
    $taskStable = (ConvertTo-Json -InputObject $taskBefore -Depth 4 -Compress) -ceq (ConvertTo-Json -InputObject $taskAfter -Depth 4 -Compress)
    $taskApk = Join-Path $taskRepository 'dev/mobile/android/app/build/outputs/apk/debug/app-debug.apk'
    $taskApkHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskArchivedApk = Join-Path $taskOutput "app-$taskApkHash.apk"
    $taskInstrumentationApk = Join-Path $taskRepository 'dev/mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    $taskInstrumentationHash = (Get-FileHash -LiteralPath $taskInstrumentationApk -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskArchivedInstrumentation = Join-Path $taskOutput "instrumentation-$taskInstrumentationHash.apk"
    if ($taskStable) {
        if (Test-Path -LiteralPath $taskArchivedApk) {
            if ((Get-FileHash -LiteralPath $taskArchivedApk -Algorithm SHA256).Hash.ToLowerInvariant() -cne $taskApkHash) { throw 'Existing archived APK does not match its checksum filename.' }
        } else { Copy-Item -LiteralPath $taskApk -Destination $taskArchivedApk }
        if (Test-Path -LiteralPath $taskArchivedInstrumentation) {
            if ((Get-FileHash -LiteralPath $taskArchivedInstrumentation -Algorithm SHA256).Hash.ToLowerInvariant() -cne $taskInstrumentationHash) { throw 'Existing archived instrumentation APK checksum mismatch.' }
        } else { Copy-Item -LiteralPath $taskInstrumentationApk -Destination $taskArchivedInstrumentation }
    }
    $taskTests = @{tests=0;failures=0;errors=0}
    foreach ($taskFile in Get-ChildItem -LiteralPath 'dev/mobile/android/app/build/test-results/testDebugUnitTest' -Filter 'TEST-*.xml') {
        [xml]$taskXml = Get-Content -LiteralPath $taskFile.FullName
        $taskTests.tests += [int]$taskXml.testsuite.tests
        $taskTests.failures += [int]$taskXml.testsuite.failures
        $taskTests.errors += [int]$taskXml.testsuite.errors
    }
    $taskManifest = [ordered]@{
        startedAt=$taskStarted;finishedAt=[DateTime]::UtcNow.ToString('o');sourceStableDuringBuild=$taskStable
        sourceCommit=([string](git rev-parse HEAD)).Trim();scope='Dirty application inputs, not a clean Git checkout or product acceptance'
        node=([string](node --version)).Trim();npm=([string](npm --version)).Trim()
        apk='dev/mobile/android/app/build/outputs/apk/debug/app-debug.apk';apkSha256=$taskApkHash
        archivedApk=if($taskStable){[IO.Path]::GetRelativePath($taskRepository,$taskArchivedApk).Replace('\','/')}else{$null}
        instrumentation=[ordered]@{sha256=$taskInstrumentationHash;archivedApk=if($taskStable){[IO.Path]::GetRelativePath($taskRepository,$taskArchivedInstrumentation).Replace('\','/')}else{$null};scope='Compiled only; explicit idle-device opt-in is required for OS notification checks'}
        nativeTests=$taskTests;inputs=$taskBefore
        nativeGroupImageHostTests=[ordered]@{status=$taskImagesReport.status;testCount=$taskImagesReport.testCount;assertionCount=$taskImagesReport.assertionCount;scope=$taskImagesReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskImagesOutput 'result.json')).Replace('\','/')}
        nativeMessageStoreHostTests=[ordered]@{status=$taskStoreReport.status;testCount=$taskStoreReport.testCount;assertionCount=$taskStoreReport.assertionCount;sqliteVersion=$taskStoreReport.sqliteVersion;scope=$taskStoreReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskStoreOutput 'result.json')).Replace('\','/')}
        nativeAppearanceHostTests=[ordered]@{status=$taskAppearanceReport.status;scope=$taskAppearanceReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskAppearanceOutput 'result.json')).Replace('\','/')}
        nativeGroupNameHostTests=[ordered]@{status=$taskNamesReport.status;testCount=$taskNamesReport.testCount;assertionCount=$taskNamesReport.assertionCount;scope=$taskNamesReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskNamesOutput 'result.json')).Replace('\','/')}
        nativeGroupRecoveryHostTests=[ordered]@{status=$taskRecoveryReport.status;testCount=$taskRecoveryReport.testCount;assertionCount=$taskRecoveryReport.assertionCount;scope=$taskRecoveryReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskRecoveryOutput 'result.json')).Replace('\','/')}
        nativeGatewayIssuerHostTests=[ordered]@{status=$taskGatewayIssuerReport.status;testCount=$taskGatewayIssuerReport.testCount;assertionCount=$taskGatewayIssuerReport.assertionCount;suites=$taskGatewayIssuerReport.suites;scope=$taskGatewayIssuerReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskGatewayIssuerOutput 'result.json')).Replace('\','/')}
        nativeInternetSharingHostTests=[ordered]@{status=$taskInternetReport.status;testCount=$taskInternetReport.testCount;assertionCount=$taskInternetReport.assertionCount;scope=$taskInternetReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskInternetOutput 'result.json')).Replace('\','/')}
        nativeInternetLifecycleHostTests=[ordered]@{status=$taskInternetLifecycleReport.status;testCount=$taskInternetLifecycleReport.testCount;assertionCount=$taskInternetLifecycleReport.assertionCount;scope=$taskInternetLifecycleReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskInternetLifecycleOutput 'result.json')).Replace('\','/')}
        nativeInternetStopHostTests=[ordered]@{status=$taskInternetStopReport.status;testCount=$taskInternetStopReport.testCount;assertionCount=$taskInternetStopReport.assertionCount;scope=$taskInternetStopReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskInternetStopOutput 'result.json')).Replace('\','/')}
        nativeTrustedConnectionHostTests=[ordered]@{status=$taskTrustedConnectionReport.status;testCount=$taskTrustedConnectionReport.testCount;assertionCount=$taskTrustedConnectionReport.assertionCount;scope=$taskTrustedConnectionReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskTrustedConnectionOutput 'result.json')).Replace('\','/')}
        nativeTrustedVoiceJoinHostTests=[ordered]@{status=$taskTrustedVoiceJoinReport.status;testCount=$taskTrustedVoiceJoinReport.testCount;assertionCount=$taskTrustedVoiceJoinReport.assertionCount;scope=$taskTrustedVoiceJoinReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskTrustedVoiceJoinOutput 'result.json')).Replace('\','/')}
        nativeVoiceTelecomHostTests=[ordered]@{status=$taskVoiceTelecomReport.status;testCount=$taskVoiceTelecomReport.testCount;assertionCount=$taskVoiceTelecomReport.assertionCount;scope=$taskVoiceTelecomReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskVoiceTelecomOutput 'result.json')).Replace('\','/')}
        nativeRadioSettingsHostTests=[ordered]@{status=$taskRadioSettingsReport.status;testCount=$taskRadioSettingsReport.testCount;assertionCount=$taskRadioSettingsReport.assertionCount;scope=$taskRadioSettingsReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskRadioSettingsOutput 'result.json')).Replace('\','/')}
        nativeNodeUpdateHostTests=[ordered]@{status=$taskNodeUpdateReport.status;testCount=$taskNodeUpdateReport.testCount;assertionCount=$taskNodeUpdateReport.assertionCount;scope=$taskNodeUpdateReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskNodeUpdateOutput 'result.json')).Replace('\','/')}
        firmwareReleaseHostTests=[ordered]@{status=$taskReleaseReport.status;testCount=$taskReleaseReport.testCount;scope=$taskReleaseReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskReleaseOutput 'result.json')).Replace('\','/')}
        nativeRadioMaintenanceHostTests=[ordered]@{status=$taskRadioMaintenanceReport.status;testCount=$taskRadioMaintenanceReport.testCount;assertionCount=$taskRadioMaintenanceReport.assertionCount;scope=$taskRadioMaintenanceReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskRadioMaintenanceOutput 'result.json')).Replace('\','/')}
        nativeLinkBenchmarkHostTests=[ordered]@{status=$taskLinkBenchmarkReport.status;testCount=$taskLinkBenchmarkReport.testCount;assertionCount=$taskLinkBenchmarkReport.assertionCount;scope=$taskLinkBenchmarkReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskLinkBenchmarkOutput 'result.json')).Replace('\','/')}
        nativeLinkBenchmarkVoiceHostTests=[ordered]@{status=$taskLinkVoiceReport.status;testCount=$taskLinkVoiceReport.testCount;assertionCount=$taskLinkVoiceReport.assertionCount;scope=$taskLinkVoiceReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskLinkVoiceOutput 'result.json')).Replace('\','/')}
        nativeTrustedLocationHostTests=[ordered]@{status=$taskTrustedLocationReport.status;testCount=$taskTrustedLocationReport.testCount;assertionCount=$taskTrustedLocationReport.assertionCount;scope=$taskTrustedLocationReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskTrustedLocationOutput 'result.json')).Replace('\','/')}
        nativeVoiceNetworkHostTests=[ordered]@{status=$taskVoiceNetworkReport.status;testCount=$taskVoiceNetworkReport.testCount;assertionCount=$taskVoiceNetworkReport.assertionCount;scope=$taskVoiceNetworkReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskVoiceNetworkOutput 'result.json')).Replace('\','/')}
        nativeVoiceFixtureSnapshotHostTests=[ordered]@{status=$taskVoiceSnapshotReport.status;testCount=$taskVoiceSnapshotReport.testCount;assertionCount=$taskVoiceSnapshotReport.assertionCount;scope=$taskVoiceSnapshotReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskVoiceSnapshotOutput 'result.json')).Replace('\','/')}
        capacitorLifecycleHostTests=[ordered]@{status=$taskLifecycleReport.status;testCount=$taskLifecycleReport.testCount;assertionCount=$taskLifecycleReport.assertionCount;scope=$taskLifecycleReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskLifecycleOutput 'result.json')).Replace('\','/')}
        capacitorLifecycleOverlay=$taskOverlayProvenance
        nativeNotificationHostTests=[ordered]@{status=$taskNotificationsReport.status;scope=$taskNotificationsReport.scope;report=[IO.Path]::GetRelativePath($taskRepository,(Join-Path $taskNotificationsOutput 'result.json')).Replace('\','/')}
    }
    $taskJson = ConvertTo-Json -InputObject $taskManifest -Depth 6
    [IO.File]::WriteAllText((Join-Path $taskOutput 'manifest.json'),$taskJson,[Text.UTF8Encoding]::new($false))
    if (!$taskStable) { throw 'Application inputs changed during the build. Manifest is diagnostic only; wait for a source freeze and rebuild.' }
    if ($taskTests.failures -or $taskTests.errors) { throw 'Native test results are not clean.' }
    Write-Output "Built stable debug APK $($taskManifest.apkSha256); $($taskTests.tests) native cases pass."
    Write-Output (Join-Path $taskOutput 'manifest.json')
}
finally { Pop-Location }
