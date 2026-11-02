param([switch]$Install)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdk = Join-Path $projectRoot '.tmp-review\native-obs-sdk'
$compiler = Join-Path $sdk 'zig-windows-x86_64-0.13.0\zig.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The pinned local Zig/OBS/ONNX SDK must be present in .tmp-review/native-obs-sdk.' }
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $sdk 'zig-cache'
$binary = Join-Path $sdk 'scenesense-matting.dll'
& $compiler cc -shared -O2 -Wno-macro-redefined -target x86_64-windows-gnu -D_M_X64 -I $sdk -I (Join-Path $sdk 'obs-studio\libobs') (Join-Path $PSScriptRoot 'scenesense-matting.c') -o $binary
if ($LASTEXITCODE -ne 0) { throw 'Native filter compilation failed.' }
if ($Install) {
    if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw 'Close OBS before installing the native filter.' }
    $pluginRoot = Join-Path $env:ProgramData 'obs-studio\plugins\scenesense-native-matting'
    $pluginBin = Join-Path $pluginRoot 'bin\64bit'
    New-Item -ItemType Directory -Force $pluginBin,(Join-Path $pluginRoot 'data') | Out-Null
    Copy-Item -LiteralPath $binary -Destination (Join-Path $pluginBin 'scenesense-native-matting.dll') -Force
    $runtime = Join-Path $projectRoot '.tmp-review\native-matting\.venv\Lib\site-packages\onnxruntime\capi'
    Copy-Item -LiteralPath (Join-Path $runtime 'onnxruntime.dll') -Destination (Join-Path $pluginBin 'scenesense-ort.dll') -Force
    foreach ($file in @('DirectML.dll','onnxruntime_providers_shared.dll')) { Copy-Item -LiteralPath (Join-Path $runtime $file) -Destination $pluginBin -Force }
    Copy-Item -LiteralPath (Join-Path $projectRoot '.tmp-review\native-matting\models\rvm_mobilenetv3_fp32.onnx') -Destination $pluginBin -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'NOTICE.txt') -Destination $pluginRoot -Force
}
