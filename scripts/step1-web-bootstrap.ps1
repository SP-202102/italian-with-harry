# GH-AUTOVERSION: v0.1.1
<#
Step 1: Web Bootstrap (no build tooling)
- Copies SRTs from ./data/raw to ./web/data/raw (sanitized filenames)
- Creates container files for the minimal web app in ./web:
  - index.html
  - app.js
  - styles.css
- Generates ./web/data/manifest.json based on the copied SRTs
- Adds GH-AUTOVERSION tags at the beginning of every generated file.

Usage:
  pwsh -File .\scripts\step1-web-bootstrap.ps1
  pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force
#>

param(
  [switch]$Force,
  [string]$VersionTag = "v0.1.1"
)

$ErrorActionPreference = "Stop"

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
    $parent = Split-Path $Path -Parent
    Ensure-Directory $parent
    Set-Content -Path $Path -Value $Content -Encoding UTF8
    Write-Ok ("Wrote file: " + $Path)
  } else {
    Write-Info ("File exists (skipped): " + $Path)
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

function Guess-TitleFromFileName([string]$SanitizedFileName) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($SanitizedFileName)
  # Basic heuristics for HP1/HP2 naming
  if ($base -match "harry-potter-1|hp1|pietra|philosof") { return "Harry Potter 1 (IT)" }
  if ($base -match "harry-potter-2|hp2|camera|segreti")  { return "Harry Potter 2 (IT)" }
  # Fallback: prettify
  $pretty = $base -replace "-", " "
  $pretty = (Get-Culture).TextInfo.ToTitleCase($pretty)
  return $pretty
}

try {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

  $rawDir = Join-Path $repoRoot "data\raw"
  $webDir = Join-Path $repoRoot "web"
  $webDataDir = Join-Path $webDir "data"
  $webRawDir = Join-Path $webDataDir "raw"

  Write-Info "Repo root: $repoRoot"
  Write-Info "Raw input:  $rawDir"
  Write-Info "Web output: $webDir"

  Ensure-Directory $rawDir
  Ensure-Directory $webRawDir

  # 1) Copy SRTs
  $srtFiles = Get-ChildItem -Path $rawDir -Filter "*.srt" -File -ErrorAction SilentlyContinue

  $copied = @()
  if (-not $srtFiles -or $srtFiles.Count -eq 0) {
    Write-Warn "No .srt files found in ./data/raw"
  } else {
    foreach ($file in $srtFiles) {
      $sanitizedName = Sanitize-FileName $file.Name
      $destPath = Join-Path $webRawDir $sanitizedName

      if ((-not (Test-Path $destPath)) -or $Force) {
        Copy-Item -Path $file.FullName -Destination $destPath -Force
        Write-Ok ("Copied: " + $file.Name + " -> web/data/raw/" + $sanitizedName)
      } else {
        Write-Info ("Already exists (skipped): web/data/raw/" + $sanitizedName)
      }

      $copied += [pscustomobject]@{
        fileName = $sanitizedName
        title = (Guess-TitleFromFileName $sanitizedName)
      }
    }
  }

  # 2) Generate manifest.json (always regenerate, it's derived output)
  $manifestPath = Join-Path $webDataDir "manifest.json"
  Ensure-Directory $webDataDir

  # Re-scan web/raw (source of truth for manifest)
  $webSrtFiles = Get-ChildItem -Path $webRawDir -Filter "*.srt" -File -ErrorAction SilentlyContinue
  $items = @()
  foreach ($wf in $webSrtFiles) {
    $items += [pscustomobject]@{
      id = ([System.IO.Path]::GetFileNameWithoutExtension($wf.Name))
      title = (Guess-TitleFromFileName $wf.Name)
      language = "it"
      path = ("./data/raw/" + $wf.Name)
    }
  }

  # Sort by title for stable output
  $items = $items | Sort-Object title

  $manifestObject = [pscustomobject]@{
    autoversion = $VersionTag
    generatedAtUtc = ([DateTime]::UtcNow.ToString("o"))
    items = $items
  }

  $manifestJson = $manifestObject | ConvertTo-Json -Depth 6
  $manifestJsonWithHeader = "// GH-AUTOVERSION: $VersionTag`n" + $manifestJson

  Set-Content -Path $manifestPath -Value $manifestJsonWithHeader -Encoding UTF8
  Write-Ok ("Wrote manifest: " + $manifestPath)

  # 3) Create web container files (no build tooling)
  $autoversionHtml = "<!-- GH-AUTOVERSION: $VersionTag -->"
  $autoversionJs   = "// GH-AUTOVERSION: $VersionTag"
  $autoversionCss  = "/* GH-AUTOVERSION: $VersionTag */"

  $indexHtmlPath = Join-Path $webDir "index.html"
  $appJsPath     = Join-Path $webDir "app.js"
  $stylesCssPath = Join-Path $webDir "styles.css"

  $indexHtmlContent = @"
$autoversionHtml
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Italian with Harry</title>
    <link rel="stylesheet" href="./styles.css" />

    <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
  </head>

  <body>
    <div class="container">
      <h1>Italian with Harry</h1>
      <div id="root"></div>
      <p class="footer">
        Run via HTTP/HTTPS (localhost or GitHub Pages). file:// blocks fetch for SRT in most browsers.
      </p>
    </div>

    <script type="text/babel" src="./app.js"></script>
  </body>
</html>
"@

  $stylesCssContent = @"
$autoversionCss
:root { color-scheme: light; }
body { margin: 0; font-family: system-ui, Arial, sans-serif; background: #fafafa; color: #111; }
.container { max-width: 920px; margin: 24px auto; padding: 0 16px; }
h1 { margin: 0 0 16px; font-size: 28px; }
label { display: inline-flex; gap: 8px; align-items: center; margin-right: 12px; }
select, button, input { font: inherit; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0 14px; }
.meta { display: flex; gap: 14px; flex-wrap: wrap; opacity: 0.8; margin: 6px 0 12px; }
.error { color: #b00020; font-weight: 600; }
.card { background: white; border: 1px solid #ddd; border-radius: 12px; padding: 14px; cursor: pointer; }
.cardTop { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.badge { font-size: 12px; padding: 2px 8px; border: 1px solid #ccc; border-radius: 999px; background: #fff; }
.timestamp { font-size: 12px; opacity: 0.7; }
.cardText { min-height: 140px; display: flex; flex-direction: column; gap: 10px; }
.front { font-size: 22px; line-height: 1.25; }
.back { font-size: 18px; font-weight: 700; }
.context { font-size: 14px; opacity: 0.85; }
.hint { font-size: 12px; opacity: 0.6; margin-top: auto; }
.nav { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
button { padding: 8px 10px; border-radius: 10px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
button:hover { background: #f0f0f0; }
.footer { margin-top: 18px; opacity: 0.65; font-size: 12px; }
"@

  # app.js will read manifest.json
  $appJsContent = @"
$autoversionJs
const { useEffect, useMemo, useState } = React;

async function loadManifest() {
  const response = await fetch("./data/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(\`Failed to load manifest.json: \${response.status} \${response.statusText}\`);
  }

  // manifest.json starts with a single-line comment header, so we must strip it
  const text = await response.text();
  const jsonText = text.replace(/^\\/\\/.*\\n/, "");
  const manifest = JSON.parse(jsonText);
  return manifest.items ?? [];
}

function parseSrtTime(timeString) {
  const [hh, mm, ssMs] = timeString.split(":");
  const [ss, ms] = ssMs.split(",");
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

function formatHms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return \`\${hh}:\${mm}:\${ss}\`;
}

function parseSrt(srtText) {
  const normalized = srtText.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
  const blocks = normalized.split(/\\n\\s*\\n/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split("\\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let index = null;
    let timeLine = null;
    let textLines = [];

    if (lines[0].includes("-->")) {
      timeLine = lines[0];
      textLines = lines.slice(1);
    } else {
      const maybeIndex = Number(lines[0]);
      index = Number.isFinite(maybeIndex) ? maybeIndex : null;
      timeLine = lines[1];
      textLines = lines.slice(2);
    }

    const match = timeLine.match(
      /(\\d{2}:\\d{2}:\\d{2},\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2},\\d{3})/
    );
    if (!match) continue;

    const startSeconds = parseSrtTime(match[1]);
    const endSeconds = parseSrtTime(match[2]);

    const text = textLines
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\\{\\\\.*?\\}/g, ""))
      .join(" ")
      .replace(/\\s+/g, " ")
      .replace(/\\[[^\\]]+\\]/g, "")
      .replace(/♪/g, "")
      .trim();

    if (!text) continue;
    if (text.toLowerCase().includes("subtitles")) continue;

    entries.push({ index, startSeconds, endSeconds, text });
  }

  return entries;
}

function assignChapterId(seconds, chapterSizeSeconds) {
  return Math.floor(seconds / chapterSizeSeconds) + 1;
}

function buildChapters(entries, chapterSizeSeconds) {
  const maxEnd = Math.max(...entries.map((e) => e.endSeconds), 0);
  const count = Math.max(1, Math.ceil(maxEnd / chapterSizeSeconds));
  const chapters = [];
  for (let i = 0; i < count; i++) {
    const start = i * chapterSizeSeconds;
    const end = Math.min((i + 1) * chapterSizeSeconds, maxEnd);
    chapters.push({
      id: i + 1,
      title: \`Kapitel \${i + 1}\`,
      startHms: formatHms(start),
      endHms: formatHms(end),
    });
  }
  return chapters;
}

function buildPhraseCards(entries, chapterSizeSeconds) {
  return entries.map((e, idx) => ({
    id: \`p_\${idx}\`,
    chapterId: assignChapterId(e.startSeconds, chapterSizeSeconds),
    type: "phrase",
    frontIt: e.text,
    backDe: "",
    contextIt: e.text,
    timestamp: formatHms(e.startSeconds),
  }));
}

function Flashcards({ cards }) {
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [deck, setDeck] = React.useState(cards);

  React.useEffect(() => {
    setDeck(cards);
    setIndex(0);
    setFlipped(false);
  }, [cards]);

  const current = deck[index];

  function next() {
    setFlipped(false);
    setIndex((i) => (i + 1 < deck.length ? i + 1 : 0));
  }
  function prev() {
    setFlipped(false);
    setIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1));
  }
  function shuffle() {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setDeck(arr);
    setIndex(0);
    setFlipped(false);
  }

  if (!current) return React.createElement("p", null, "Keine Karten in diesem Kapitel.");

  return (
    <div className="cards">
      <div className="card" onClick={() => setFlipped((v) => !v)} role="button" tabIndex={0}>
        <div className="cardTop">
          <span className="badge">{current.type}</span>
          <span className="timestamp">{current.timestamp}</span>
        </div>

        {!flipped ? (
          <div className="cardText">
            <div className="front">{current.frontIt}</div>
            <div className="hint">Klick zum Umdrehen</div>
          </div>
        ) : (
          <div className="cardText">
            <div className="back">{current.backDe || "(Deutsch noch leer)"}</div>
            <div className="context">{current.contextIt}</div>
          </div>
        )}
      </div>

      <div className="nav">
        <button onClick={prev}>◀</button>
        <div>{deck.length ? \`\${index + 1} / \${deck.length}\` : "0 / 0"}</div>
        <button onClick={next}>▶</button>
        <button onClick={shuffle}>Shuffle</button>
      </div>
    </div>
  );
}

function App() {
  const [movies, setMovies] = useState([]);
  const [movieId, setMovieId] = useState("");
  const [chapterMinutes, setChapterMinutes] = useState(7);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const chapterSizeSeconds = chapterMinutes * 60;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setErrorText("");
      try {
        const items = await loadManifest();
        if (cancelled) return;
        setMovies(items);
        if (items.length > 0) {
          setMovieId(items[0].id);
        }
      } catch (e) {
        if (!cancelled) setErrorText(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const movie = movies.find((m) => m.id === movieId);
    if (!movie) return;

    let cancelled = false;

    async function loadSrt() {
      setLoading(true);
      setErrorText("");
      try {
        const response = await fetch(movie.path, { cache: "no-store" });
        if (!response.ok) throw new Error(\`Failed to fetch SRT: \${response.status} \${response.statusText}\`);
        const text = await response.text();
        const parsed = parseSrt(text);
        if (!cancelled) setEntries(parsed);
      } catch (e) {
        if (!cancelled) setErrorText(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSrt();
    return () => { cancelled = true; };
  }, [movieId, movies]);

  const chapters = useMemo(() => buildChapters(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);
  const cards = useMemo(() => buildPhraseCards(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);

  const [selectedChapterId, setSelectedChapterId] = useState(1);
  useEffect(() => setSelectedChapterId(1), [movieId, chapterMinutes]);

  const chapterCards = useMemo(() => cards.filter((c) => c.chapterId === selectedChapterId), [cards, selectedChapterId]);

  return (
    <div>
      <div className="controls">
        <label>
          Film:
          <select value={movieId} onChange={(e) => setMovieId(e.target.value)} disabled={movies.length === 0}>
            {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>

        <label>
          Kapitel-Minuten:
          <select value={chapterMinutes} onChange={(e) => setChapterMinutes(Number(e.target.value))}>
            {[5, 7, 10, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label>
          Kapitel:
          <select value={selectedChapterId} onChange={(e) => setSelectedChapterId(Number(e.target.value))}>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.startHms}-{c.endHms})
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p>Lade ...</p>}
      {errorText && <p className="error">Fehler: {errorText}</p>}

      {!loading && !errorText && entries.length > 0 && (
        <>
          <div className="meta">
            <span>Subtitle-Eintraege: {entries.length}</span>
            <span>Kapitel: {chapters.length}</span>
            <span>Karten (dieses Kapitel): {chapterCards.length}</span>
          </div>

          <Flashcards cards={chapterCards} />
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
"@

  Write-FileIfMissingOrForced -Path $indexHtmlPath -Content $indexHtmlContent -ForceWrite:$Force
  Write-FileIfMissingOrForced -Path $stylesCssPath -Content $stylesCssContent -ForceWrite:$Force
  Write-FileIfMissingOrForced -Path $appJsPath     -Content $appJsContent     -ForceWrite:$Force

  Write-Host ""
  Write-Ok "Step 1 completed."

  Write-Host ""
  Write-Info "Local run (no tooling):"
  Write-Host "  cd .\web" -ForegroundColor Gray
  Write-Host "  python -m http.server 5173" -ForegroundColor Gray
  Write-Host "  open http://localhost:5173" -ForegroundColor Gray
}
catch {
  Write-Fail $_.Exception.Message
  Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
  exit 1
}
