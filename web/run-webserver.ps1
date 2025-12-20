# GH-AUTOVERSION: v0.1.0
<#
One-click local webserver runner for ./web

- Starts Python's built-in static file server from this folder
- Opens the browser automatically
- Checks if the port is already in use
- Clear errors if Python is missing

Usage:
  pwsh -File .\web\run-webserver.ps1
  pwsh -File .\web\run-webserver.ps1 -Port 5173

Stop:
  Press Ctrl+C in the server window.
#>

param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "[INFO]  $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "[FAIL]  $Message" -ForegroundColor Red }

function Find-PythonCommand {
  # Prefer python, then py
  if (Get-Command python -ErrorAction SilentlyContinue) { return "python" }
  if (Get-Command py -ErrorAction SilentlyContinue)     { return "py" }
  return $null
}

function Test-PortInUse([int]$PortToTest) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $PortToTest -ErrorAction Stop | Select-Object -First 1
    return $null -ne $connection
  } catch {
    # If Get-NetTCPConnection is unavailable or errors, assume not in use
    return $false
  }
}

try {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Set-Location $scriptDir

  Write-Info ("Working directory: " + (Get-Location).Path)

  # Basic sanity check: index.html should exist
  if (-not (Test-Path ".\index.html")) {
    Write-Warn "index.html not found in ./web. Did you run the bootstrap step?"
    Write-Info "Expected files: index.html, app.js, styles.css, data/manifest.json, data/raw/*.srt"
  }

  if (Test-PortInUse -PortToTest $Port) {
    Write-Fail ("Port " + $Port + " is already in use. Choose another port, e.g.:")
    Write-Host ("  pwsh -File .\run-webserver.ps1 -Port " + ($Port + 1)) -ForegroundColor Gray
    exit 1
  }

  $pythonCmd = Find-PythonCommand
  if (-not $pythonCmd) {
    Write-Fail "Python not found (neither 'python' nor 'py' is available in PATH)."
    Write-Info "Install Python (Windows installer 64-bit) and check 'Add Python to PATH'."
    exit 1
  }

  $url = "http://localhost:$Port/"
  Write-Ok ("Opening: " + $url)
  Start-Process $url | Out-Null

  Write-Info ("Starting server using '" + $pythonCmd + "' on port " + $Port + " ...")
  Write-Info "Stop with Ctrl+C."

  if ($pythonCmd -eq "py") {
    # py launcher
    & py -m http.server $Port
  } else {
    & python -m http.server $Port
  }
}
catch {
  Write-Fail $_.Exception.Message
  Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
  exit 1
}
