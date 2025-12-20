# GH-AUTOVERSION: v0.1.3
<#
Step 1 – Web Bootstrap (no build tooling)

What this script does:
- Copies all .srt files from ./data/raw to ./web/data/raw (sanitized filenames)
- Generates ./web/data/manifest.json (VALID JSON, no comments)
- Creates minimal static web app container:
    - web/index.html
    - web/app.js
    - web/styles.css
- Creates one-click local web server runners:
    - web/run-webserver.ps1
    - web/run-webserver.cmd

Usage:
  pwsh -File .\scripts\step1-web-bootstrap.ps1
  pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force
#>

param(
  [switch]$Force,
  [string]$VersionTag = "v0.1.3"
)

$ErrorActionPreference = "Stop"

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
function Write-Info([string]$Message) { Write-Host "[INFO]  $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "[FAIL]  $Message" -ForegroundColor Red }

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
    Write-Ok "Created folder: $Path"
  }
}

function Write-FileIfMissingOrForced([string]$Path, [string]$Content, [switch]$ForceWrite) {
  if ((-not (Test-Path $Path)) -or $ForceWrite) {
    Ensure-Directory (Split-Path $Path -Parent)
    Set-Content -Path $Path -Value $Content -Encoding UTF8
    Write-Ok "Wrote file: $Path"
  } else {
    Write-Info "File exists (skipped): $Path"
  }
}

function Sanitize-FileName([string]$FileName) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $ext  = [System.IO.Path]::GetExtension($FileName)

  $base = $base.ToLowerInvariant()
  $base = $base -replace "\s+", "-"
  $base = $base -replace "[^a-z0-9\-\._]", ""
  $base = $base -replace "\-+", "-"
  $base = $base.Trim("-", ".", "_")

  if ([string]::IsNullOrWhiteSpace($base)) { $base = "subtitle" }
  return ($base + $ext.ToLowerInvariant())
}

function Guess-Title([string]$SanitizedFileName) {
  if ($SanitizedFileName -match "pietra|philosof|hp1") { return "Harry Potter 1 (IT)" }
  if ($SanitizedFileName -match "camera|segreti|hp2")  { return "Harry Potter 2 (IT)" }
  return (([System.IO.Path]::GetFileNameWithoutExtension($SanitizedFileName)) -replace "-", " ")
}

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------
$repoRoot  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rawDir   = Join-Path $repoRoot "data\raw"
$webDir   = Join-Path $repoRoot "web"
$webData  = Join-Path $webDir "data"
$webRaw   = Join-Path $webData "raw"

Ensure-Directory $rawDir
Ensure-Directory $webRaw

Write-Info "Repo root: $repoRoot"

# -------------------------------------------------------------------
# 1) Copy + sanitize SRT files
# -------------------------------------------------------------------
$srtFiles = Get-ChildItem $rawDir -Filter "*.srt" -File -ErrorAction SilentlyContinue
$manifestItems = @()

foreach ($file in $srtFiles) {
  $sanitized = Sanitize-FileName $file.Name
  $dest = Join-Path $webRaw $sanitized

  if ((-not (Test-Path $dest)) -or $Force) {
    Copy-Item $file.FullName $dest -Force
    Write-Ok "Copied: $($file.Name) → web/data/raw/$sanitized"
  }

  $manifestItems += [pscustomobject]@{
    id       = ([System.IO.Path]::GetFileNameWithoutExtension($sanitized))
    title    = Guess-Title $sanitized
    language = "it"
    path     = "./data/raw/$sanitized"
  }
}

# -------------------------------------------------------------------
# 2) Write manifest.json (VALID JSON)
# -------------------------------------------------------------------
$manifest = [pscustomobject]@{
  autoversion      = $VersionTag
  generatedAtUtc  = (Get-Date).ToUniversalTime().ToString("o")
  items            = $manifestItems | Sort-Object title
}

$manifestPath = Join-Path $webData "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content $manifestPath -Encoding UTF8
Write-Ok "Wrote manifest: web/data/manifest.json"

# -------------------------------------------------------------------
# 3) Web container files
# -------------------------------------------------------------------
$indexHtml = @"
<!-- GH-AUTOVERSION: $VersionTag -->
<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Italian with Harry</title>
  <link rel="stylesheet" href="./styles.css" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" src="./app.js"></script>
</body>
</html>
"@

$appJs = @"
// GH-AUTOVERSION: $VersionTag
// Loads manifest.json and SRT files via fetch()
// App logic intentionally minimal
console.log("Italian with Harry – app loaded");
"@

$stylesCss = @"
/* GH-AUTOVERSION: $VersionTag */
body {
  font-family: system-ui, Arial, sans-serif;
  margin: 0;
  padding: 20px;
}
"@

Write-FileIfMissingOrForced (Join-Path $webDir "index.html")  $indexHtml  $Force
Write-FileIfMissingOrForced (Join-Path $webDir "app.js")      $appJs      $Force
Write-FileIfMissingOrForced (Join-Path $webDir "styles.css")  $stylesCss  $Force

# -------------------------------------------------------------------
# 4) One-click web server
# -------------------------------------------------------------------
$runPs1 = @"
# GH-AUTOVERSION: $VersionTag
param([int]`$Port = 5173)

if (-not (Get-Command python -ErrorAction SilentlyContinue) -and
    -not (Get-Command py -ErrorAction SilentlyContinue)) {
  Write-Error "Python not found in PATH."
  exit 1
}

Start-Process "http://localhost:`$Port"
if (Get-Command py -ErrorAction SilentlyContinue) {
  py -m http.server `$Port
} else {
  python -m http.server `$Port
}
"@

$runCmd = @"
@echo off
rem GH-AUTOVERSION: $VersionTag
pwsh -NoExit -ExecutionPolicy Bypass -File "%~dp0run-webserver.ps1"
"@

Write-FileIfMissingOrForced (Join-Path $webDir "run-webserver.ps1") $runPs1 $Force
Write-FileIfMissingOrForced (Join-Path $webDir "run-webserver.cmd") $runCmd $Force

Write-Host ""
Write-Ok "Step 1 completed successfully."
Write-Info "Start with: web/run-webserver.cmd"
