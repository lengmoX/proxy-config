$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $scriptDir "sing-box.exe"
$configPath = Join-Path $scriptDir "config.json"
$workDir = Join-Path $scriptDir "work"
$pidPath = Join-Path $workDir "sing-box.pid"
$stdoutPath = Join-Path $workDir "sing-box.out.log"
$stderrPath = Join-Path $workDir "sing-box.err.log"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Start-Process -FilePath "powershell.exe" -Verb RunAs -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  )
  exit 0
}

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "sing-box.exe not found: $exePath"
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "config.json not found: $configPath"
}

if (-not (Test-Path -LiteralPath $workDir)) {
  New-Item -ItemType Directory -Path $workDir | Out-Null
}

if (Test-Path -LiteralPath $pidPath) {
  $oldPid = Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($oldPid -match '^\d+$') {
    $oldProcess = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
    if ($oldProcess) {
      Write-Host "sing-box is already running. PID: $oldPid"
      exit 0
    }
  }
}

$process = Start-Process `
  -FilePath $exePath `
  -ArgumentList @("run", "-c", "config.json", "-D", ".") `
  -WorkingDirectory $scriptDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII
Write-Host "sing-box started in background. PID: $($process.Id)"
Write-Host "stdout: $stdoutPath"
Write-Host "stderr: $stderrPath"
