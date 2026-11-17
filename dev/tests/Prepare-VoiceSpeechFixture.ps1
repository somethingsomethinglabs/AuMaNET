#Requires -Version 7.3
# Downloads a bounded, hash-pinned prefix of the public, CC-BY-4.0 LibriSpeech corpus.
# No phone access, microphone access, playback, or arbitrary source/target paths.
$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskAudit = Join-Path $taskRepo 'dev/artifacts/native-audio-audit'
$taskAssets = Join-Path $taskRepo 'dev/mobile/android/app/src/debug/assets/voice-fixtures'
New-Item -ItemType Directory -Force -Path $taskAudit,$taskAssets | Out-Null
$taskPrefix = Join-Path $taskAudit 'librispeech-dev-clean-prefix.gz'
$taskPrefixHash = '2a017e6c68ed22bfb765e3c735c64cf9e83fe085d14b7c94a2f7bacdebc1f051'
if (!(Test-Path -LiteralPath $taskPrefix) -or (Get-FileHash -LiteralPath $taskPrefix -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPrefixHash) {
    $taskHttp = [Net.Http.HttpClient]::new()
    $taskHttp.MaxResponseContentBufferSize = 1048576
    $taskRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get,'https://www.openslr.org/resources/12/dev-clean.tar.gz')
    $taskRequest.Headers.Range = [Net.Http.Headers.RangeHeaderValue]::new(0,1048575)
    $taskResponse = $null
    try {
        $taskResponse = $taskHttp.Send($taskRequest,[Net.Http.HttpCompletionOption]::ResponseHeadersRead)
        if ([int]$taskResponse.StatusCode -ne 206 -or $taskResponse.Content.Headers.ContentLength -ne 1048576 -or
            $taskResponse.Content.Headers.ContentRange.From -ne 0 -or $taskResponse.Content.Headers.ContentRange.To -ne 1048575) {
            throw 'The corpus server did not return the requested bounded prefix.'
        }
        $taskBytes = $taskResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        if ($taskBytes.Length -ne 1048576) { throw 'Incomplete corpus prefix.' }
        [IO.File]::WriteAllBytes($taskPrefix,$taskBytes)
    } finally { if ($taskResponse) { $taskResponse.Dispose() }; $taskRequest.Dispose(); $taskHttp.Dispose() }
}
if ((Get-FileHash -LiteralPath $taskPrefix -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPrefixHash) { throw 'Corpus prefix checksum mismatch.' }
$taskSource = Join-Path $taskAudit 'librispeech-speech-source.flac'
$taskLicense = Join-Path $taskAudit 'librispeech-LICENSE.TXT'
$taskFile = [IO.File]::OpenRead($taskPrefix)
$taskGzip = [IO.Compression.GZipStream]::new($taskFile,[IO.Compression.CompressionMode]::Decompress)
$taskTar = [System.Formats.Tar.TarReader]::new($taskGzip)
$taskFoundAudio = $false; $taskFoundLicense = $false
try {
    for ($taskIndex=0; $taskIndex -lt 20; $taskIndex++) {
        $taskEntry = $taskTar.GetNextEntry()
        if ($null -eq $taskEntry) { break }
        $taskDestination = $null
        if ($taskEntry.Name -eq 'LibriSpeech/LICENSE.TXT' -and $taskEntry.Length -eq 193) { $taskDestination=$taskLicense; $taskFoundLicense=$true }
        if ($taskEntry.Name -eq 'LibriSpeech/dev-clean/2277/149896/2277-149896-0026.flac' -and $taskEntry.Length -eq 95629) { $taskDestination=$taskSource; $taskFoundAudio=$true }
        if ($taskDestination) {
            $taskOutput=[IO.File]::Create($taskDestination)
            try { $taskEntry.DataStream.CopyTo($taskOutput) } finally { $taskOutput.Dispose() }
        }
        if ($taskFoundAudio -and $taskFoundLicense) { break }
    }
} finally { $taskTar.Dispose(); $taskGzip.Dispose(); $taskFile.Dispose() }
if (!$taskFoundAudio -or !$taskFoundLicense) { throw 'The whitelisted clip/license was not found in the corpus prefix.' }
if ((Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne '3909a6c5ae93112518681fcbf0a74df43615a4f88bd6d5cd788775255296e3f6') { throw 'Speech source checksum mismatch.' }
if ((Get-FileHash -LiteralPath $taskLicense -Algorithm SHA256).Hash.ToLowerInvariant() -ne '908b0b565ae9bf61b7b41447cb0b83564f320375723bcc884ec30e5537a0d5dc') { throw 'Speech source license checksum mismatch.' }
# License/attribution exists before any derived audio is bundled.
Copy-Item -LiteralPath $taskLicense -Destination (Join-Path $taskAssets 'LICENSE.txt') -Force
@'
LibriSpeech speech reference 2277-149896-0026
LibriSpeech (c) 2014 by Vassil Panayotov.
Source: https://www.openslr.org/12/
Archive: https://www.openslr.org/resources/12/dev-clean.tar.gz
Entry: LibriSpeech/dev-clean/2277/149896/2277-149896-0026.flac
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Copyright/license notice is retained in LICENSE.txt.

Changes: lossless FLAC decoded to 16-bit mono PCM and resampled from 16 kHz
to 48 kHz by Chromium's OfflineAudioContext. No transcript/book text is bundled.
See manifest.json for exact source/derived hashes, browser version and tool.
The debug helper may add silence, reduce gain or add deterministic test noise.
Those are additional test transformations of this CC-BY-4.0 reference.

This is a licensed recording for controlled code tests, not the phone's actual
microphone audio and not an acoustic quality or personalized isolation result.
The fixture is debug-only and is not enabled by loading the app or joining voice.
'@ | Set-Content -Encoding utf8 (Join-Path $taskAssets 'ATTRIBUTION.txt')
& node (Join-Path $PSScriptRoot 'prepare-voice-speech-pcm.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Speech decoding/preparation failed.' }
