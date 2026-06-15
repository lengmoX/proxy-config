$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $scriptDir "work"
$pidPath = Join-Path $workDir "sing-box.pid"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  )
  exit 0
}

if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "PID file not found. sing-box may not have been started by start-sing-box.ps1."
  exit 0
}

$pidValue = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pidValue -notmatch '^\d+$') {
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  throw "Invalid PID file: $pidPath"
}

$process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
if (-not $process) {
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  Write-Host "sing-box is not running. Removed stale PID file."
  exit 0
}

Stop-Process -Id $process.Id -Force
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
Write-Host "sing-box stopped. PID: $pidValue"
