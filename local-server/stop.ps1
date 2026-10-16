param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
if (-not $ConfigPath) { $ConfigPath = (Join-Path $env:APPDATA 'ResumeFillAgent/gateway/config.json') }
$pidPath = Join-Path (Split-Path -Parent $ConfigPath) 'server.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Output '没有服务 PID 记录。'; return }
$savedProcessId = [int](Get-Content -LiteralPath $pidPath -Raw)
$existing = Get-CimInstance Win32_Process -Filter "ProcessId=$savedProcessId" -ErrorAction SilentlyContinue
if (-not $existing) { Write-Output '服务未运行。'; return }
$serverPath = Join-Path $PSScriptRoot 'server.cjs'
if (-not $existing.CommandLine -or -not $existing.CommandLine.Contains($serverPath)) { throw 'PID 不属于此服务，未停止任何进程。' }
Stop-Process -Id $savedProcessId
Write-Output '本地服务已停止。'
