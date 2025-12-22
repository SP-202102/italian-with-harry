# GH-AUTOVERSION: v0.1.4
<#
Step 1 – Web Bootstrap (no build tooling, learning-path based)

What this script does:
- Copies all .srt files from ./data/raw to:
    ./web/paths/<PathId>/raw/  (sanitized filenames)
- Generates:
    ./web/paths/<PathId>/manifest.json   (VALID JSON)
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
  pwsh -File .\scripts\step1-web-bootstrap.ps1 -PathId italian-with-harry -PathTitle "Italian with Harry"

Notes:
- manifest.json is strict JSON (no comment header). Autoversion is inside JSON.
#>

param(
  [switch]$Force,
  [string]$VersionTag = "v0.1.4",
  [string]$PathId = "italian-with-harry",
  [string]$PathTitle = "Italian with Harry"
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

# Paths
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rawDir   = Join-Path $repoRoot "data\raw"
$webDir   = Join-Path $repoRoot "web"

$pathsDir    = Join-Path $webDir "paths"
$pathDir     = Join-Path $pathsDir $PathId
$pathRawDir  = Join-Path $pathDir "raw"
$manifestPath = Join-Path $pathDir "manifest.json"

Ensure-Directory $rawDir
Ensure-Directory $pathRawDir

Write-Info "Repo root: $repoRoot"
Write-Info "Learning path: $PathId ($PathTitle)"

# 1) Copy + sanitize SRT files into the path raw folder
$srtFiles = Get-ChildItem $rawDir -Filter "*.srt" -File -ErrorAction SilentlyContinue
$manifestItems = @()

foreach ($file in $srtFiles) {
  $sanitized = Sanitize-FileName $file.Name
  $dest = Join-Path $pathRawDir $sanitized

  if ((-not (Test-Path $dest)) -or $Force) {
    Copy-Item $file.FullName $dest -Force
    Write-Ok "Copied: $($file.Name) → web/paths/$PathId/raw/$sanitized"
  } else {
    Write-Info "Exists (skipped): web/paths/$PathId/raw/$sanitized"
  }

  $manifestItems += [pscustomobject]@{
    id       = ([System.IO.Path]::GetFileNameWithoutExtension($sanitized))
    title    = Guess-Title $sanitized
    language = "it"
    path     = "./raw/$sanitized"
  }
}

# 2) Write manifest.json (VALID JSON)
$manifest = [pscustomobject]@{
  autoversion     = $VersionTag
  generatedAtUtc  = (Get-Date).ToUniversalTime().ToString("o")
  pathId          = $PathId
  pathTitle       = $PathTitle
  items           = $manifestItems | Sort-Object title
}

# Derived output: always regenerate
$manifest | ConvertTo-Json -Depth 6 | Set-Content $manifestPath -Encoding UTF8
Write-Ok "Wrote manifest: web/paths/$PathId/manifest.json"

# 3) Web container files (index/styles/app)
$indexHtml = @"
<!-- GH-AUTOVERSION: $VersionTag -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Learn Languages with Movies (LLM)</title>
    <link rel="stylesheet" href="./styles.css" />

    <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
  </head>

  <body>
    <div id="root"></div>
    <script type="text/babel" src="./app.js"></script>
  </body>
</html>
"@

$stylesCss = @"
/* GH-AUTOVERSION: $VersionTag */
:root { color-scheme: light; }
body { margin: 0; font-family: system-ui, Arial, sans-serif; background: #fafafa; color: #111; }
.container { max-width: 920px; margin: 24px auto; padding: 0 16px; }
.header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.title { font-size: 28px; margin: 0; }
.subtitle { margin: 0; opacity: 0.75; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0 14px; }
label { display: inline-flex; gap: 8px; align-items: center; }
select, button, input { font: inherit; }
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

$appJs = @"
// GH-AUTOVERSION: $VersionTag
const { useEffect, useMemo, useState } = React;

const STUDY_MODES = [
  { id: "phrases", label: "Phrases only" },
  { id: "words", label: "Words & tokens" },
  { id: "mixed", label: "Mixed" },
];

const DEFAULT_PATH_ID = "$PathId";

async function loadLearningPath(pathId) {
  const response = await fetch(`./paths/${pathId}/manifest.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load learning path manifest: ${response.status} ${response.statusText}`);
  }
  return await response.json();
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
  return `${hh}:${mm}:${ss}`;
}
function parseSrt(srtText) {
  const normalized = srtText.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n");
  const blocks = normalized.split(/\\n\\s*\\n/);
  const entries = [];
  for (const block of blocks) {
    const lines = block.split("\\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let timeLine = null;
    let textLines = [];

    if (lines[0].includes("-->")) {
      timeLine = lines[0];
      textLines = lines.slice(1);
    } else {
      timeLine = lines[1];
      textLines = lines.slice(2);
    }

    const match = timeLine.match(/(\\d{2}:\\d{2}:\\d{2},\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2},\\d{3})/);
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
    entries.push({ startSeconds, endSeconds, text });
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
    chapters.push({ id: i + 1, title: `Chapter ${i + 1}`, startHms: formatHms(start), endHms: formatHms(end) });
  }
  return chapters;
}
function buildPhraseCards(entries, chapterSizeSeconds) {
  return entries.map((e, idx) => ({
    id: `p_${idx}`,
    chapterId: assignChapterId(e.startSeconds, chapterSizeSeconds),
    type: "phrase",
    frontIt: e.text,
    backDe: "",
    contextIt: e.text,
    timestamp: formatHms(e.startSeconds),
  }));
}
function isStopWordIt(token) {
  const stop = new Set([
    "che","e","di","a","da","in","un","una","il","lo","la","i","gli","le",
    "mi","ti","si","ci","vi","non","per","con","su","ma","o","ora","poi",
    "sono","sei","era","hai","ho","ha","abbiamo","avete","hanno","del","della","dei","delle"
  ]);
  return stop.has(token);
}
function buildWordCards(entries, chapterSizeSeconds, options) {
  const minWordLength = options?.minWordLength ?? 3;
  const maxWordCardsPerChapter = options?.maxWordCardsPerChapter ?? 120;
  const tokenRegex = /[a-zàèéìòóù']+/gi;

  const chapterWordCounts = new Map();

  for (const e of entries) {
    const chapterId = assignChapterId(e.startSeconds, chapterSizeSeconds);
    if (!chapterWordCounts.has(chapterId)) chapterWordCounts.set(chapterId, new Map());
    const map = chapterWordCounts.get(chapterId);

    const tokens = (e.text.match(tokenRegex) ?? [])
      .map((t) => t.toLowerCase().replace("’", "'"))
      .filter((t) => t.length >= minWordLength && !isStopWordIt(t));

    for (const t of tokens) map.set(t, (map.get(t) ?? 0) + 1);
  }

  const cards = [];
  for (const [chapterId, map] of chapterWordCounts.entries()) {
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxWordCardsPerChapter);
    for (const [token, count] of sorted) {
      cards.push({
        id: `w_${chapterId}_${token}`,
        chapterId,
        type: "word",
        frontIt: token,
        backDe: "",
        contextIt: `freq: ${count}`,
        timestamp: "",
      });
    }
  }
  return cards;
}
function buildCardsByMode(entries, chapterSizeSeconds, mode) {
  const phraseCards = buildPhraseCards(entries, chapterSizeSeconds);
  const wordCards = buildWordCards(entries, chapterSizeSeconds, { minWordLength: 3, maxWordCardsPerChapter: 120 });
  if (mode === "phrases") return phraseCards;
  if (mode === "words") return wordCards;
  return [...phraseCards, ...wordCards];
}
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function Flashcards({ cards, shuffleEnabled }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [deck, setDeck] = useState(cards);

  useEffect(() => {
    const nextDeck = shuffleEnabled ? shuffleArray(cards) : cards;
    setDeck(nextDeck);
    setIndex(0);
    setFlipped(false);
  }, [cards, shuffleEnabled]);

  const current = deck[index];

  function next() { setFlipped(false); setIndex((i) => (i + 1 < deck.length ? i + 1 : 0)); }
  function prev() { setFlipped(false); setIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1)); }
  function reshuffle() { setDeck(shuffleArray(deck)); setIndex(0); setFlipped(false); }

  if (!current) return <p>No cards in this chapter.</p>;

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
            <div className="hint">Click to flip</div>
          </div>
        ) : (
          <div className="cardText">
            <div className="back">{current.backDe || "(German empty)"}</div>
            <div className="context">{current.contextIt}</div>
          </div>
        )}
      </div>

      <div className="nav">
        <button onClick={prev}>◀</button>
        <div>{deck.length ? `${index + 1} / ${deck.length}` : "0 / 0"}</div>
        <button onClick={next}>▶</button>
        <button onClick={reshuffle} disabled={!shuffleEnabled}>Shuffle</button>
      </div>
    </div>
  );
}

function App() {
  const [learningPath, setLearningPath] = useState(null);
  const [movieId, setMovieId] = useState("");
  const [chapterMinutes, setChapterMinutes] = useState(7);
  const [studyMode, setStudyMode] = useState("phrases");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

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
        const path = await loadLearningPath(DEFAULT_PATH_ID);
        if (cancelled) return;
        setLearningPath(path);
        const first = (path.items ?? [])[0];
        if (first) setMovieId(first.id);
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
    if (!learningPath) return;
    const movie = (learningPath.items ?? []).find((m) => m.id === movieId);
    if (!movie) return;

    let cancelled = false;
    async function loadSrt() {
      setLoading(true);
      setErrorText("");
      try {
        const response = await fetch(`./paths/${learningPath.pathId}/${movie.path}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to fetch SRT: ${response.status} ${response.statusText}`);
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
  }, [learningPath, movieId]);

  const chapters = useMemo(() => buildChapters(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);
  const cards = useMemo(() => buildCardsByMode(entries, chapterSizeSeconds, studyMode), [entries, chapterSizeSeconds, studyMode]);

  const [selectedChapterId, setSelectedChapterId] = useState(1);
  useEffect(() => setSelectedChapterId(1), [movieId, chapterMinutes, studyMode]);

  const chapterCards = useMemo(() => cards.filter((c) => c.chapterId === selectedChapterId), [cards, selectedChapterId]);

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Learn Languages with Movies (LLM)</h1>
        <p className="subtitle">{learningPath ? learningPath.pathTitle : "Loading learning path..."}</p>
      </div>

      <div className="controls">
        <label>
          Movie:
          <select value={movieId} onChange={(e) => setMovieId(e.target.value)} disabled={!learningPath}>
            {(learningPath?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>

        <label>
          Chapter minutes:
          <select value={chapterMinutes} onChange={(e) => setChapterMinutes(Number(e.target.value))}>
            {[5, 7, 10, 12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label>
          Mode:
          <select value={studyMode} onChange={(e) => setStudyMode(e.target.value)}>
            {STUDY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>

        <label>
          Chapter:
          <select value={selectedChapterId} onChange={(e) => setSelectedChapterId(Number(e.target.value))}>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.startHms}-{c.endHms})</option>)}
          </select>
        </label>

        <label>
          <input type="checkbox" checked={shuffleEnabled} onChange={(e) => setShuffleEnabled(e.target.checked)} />
          Shuffle
        </label>
      </div>

      {loading && <p>Loading...</p>}
      {errorText && <p className="error">Error: {errorText}</p>}

      {!loading && !errorText && entries.length > 0 && (
        <>
          <div className="meta">
            <span>Subtitle lines: {entries.length}</span>
            <span>Chapters: {chapters.length}</span>
            <span>Cards (this chapter): {chapterCards.length}</span>
          </div>

          <Flashcards cards={chapterCards} shuffleEnabled={shuffleEnabled} />
        </>
      )}

      <p className="footer">
        Note: In-browser Babel is used to keep this project build-free. For production, we can precompile later.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
"@

Write-FileIfMissingOrForced (Join-Path $webDir "index.html") $indexHtml $Force
Write-FileIfMissingOrForced (Join-Path $webDir "styles.css") $stylesCss $Force
Write-FileIfMissingOrForced (Join-Path $webDir "app.js")     $appJs     $Force

# 4) One-click web server runners
$runWebServerPs1 = @"
# GH-AUTOVERSION: $VersionTag
param([int]`$Port = 5173)

function Find-PythonCommand {
  if (Get-Command python -ErrorAction SilentlyContinue) { return "python" }
  if (Get-Command py -ErrorAction SilentlyContinue)     { return "py" }
  return `$null
}

`$pythonCmd = Find-PythonCommand
if (-not `$pythonCmd) {
  Write-Error "Python not found (neither 'python' nor 'py' in PATH)."
  exit 1
}

Start-Process "http://localhost:`$Port" | Out-Null

if (`$pythonCmd -eq "py") {
  & py -m http.server `$Port
} else {
  & python -m http.server `$Port
}
"@

$runWebServerCmd = @"
@echo off
rem GH-AUTOVERSION: $VersionTag
pwsh -NoExit -ExecutionPolicy Bypass -File "%~dp0run-webserver.ps1"
"@

Write-FileIfMissingOrForced (Join-Path $webDir "run-webserver.ps1") $runWebServerPs1 $Force
Write-FileIfMissingOrForced (Join-Path $webDir "run-webserver.cmd") $runWebServerCmd $Force

Write-Host ""
Write-Ok "Step 1 completed successfully."
Write-Info "Run:  pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force"
Write-Info "Start: web/run-webserver.cmd"
