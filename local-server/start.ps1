param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$serverPath = Join-Path $PSScriptRoot 'server.cjs'
if (-not $ConfigPath) { $ConfigPath = (Join-Path $env:APPDATA 'ResumeFillAgent/gateway/config.json') }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$major = [int]((& $nodePath -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
if ($major -lt 20) { throw '请使用 Node.js 20 或更新版本。' }
$previousConfig = $env:RF_GATEWAY_CONFIG
try {
  $env:RF_GATEWAY_CONFIG = $ConfigPath
  & $nodePath (Join-Path $PSScriptRoot 'setup.cjs')
  if ($LASTEXITCODE -ne 0) { throw '初始化失败' }
  $settings = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  $stateDir = Split-Path -Parent $ConfigPath
  $pidPath = Join-Path $stateDir 'server.pid'
  if (Test-Path -LiteralPath $pidPath) {
    $savedProcessId = [int](Get-Content -LiteralPath $pidPath -Raw)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$savedProcessId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine -and $existing.CommandLine.Contains($serverPath)) { Write-Output "服务已运行，PID $savedProcessId；修改配置后请先停止再启动。"; return }
  }
  $process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $serverPath + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir 'server.log') -RedirectStandardError (Join-Path $stateDir 'server-error.log')
  Set-Content -LiteralPath $pidPath -Value $process.Id
  $healthy = $null
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    if ($process.HasExited) { break }
    try { $healthy = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $settings.port + '/health') -Headers @{ Authorization = 'Bearer ' + $settings.token } -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 100 }
  }
  if (-not $healthy.ok) { throw '服务未就绪，请检查本地 server-error.log。' }
  Write-Output ("服务就绪：http://127.0.0.1:" + $settings.port + '；模式：' + $healthy.engine + '；PID ' + $process.Id)
} finally { $env:RF_GATEWAY_CONFIG = $previousConfig }
