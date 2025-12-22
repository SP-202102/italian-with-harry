// GH-AUTOVERSION: v0.1.6
const { useEffect, useMemo, useState } = React;

const STUDY_MODES = [
  { id: "phrases", label: "Phrases only" },
  { id: "words", label: "Words & tokens" },
  { id: "mixed", label: "Mixed" },
];

const THEMES = [
  { id: "smilingpirate", label: "Smiling Pirate" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
  { id: "custom", label: "Custom" },
];

const DEFAULT_THEME = "smilingpirate";
const THEME_STORAGE_KEY = "llm.theme";

const DEFAULT_PATH_ID = "italian-with-harry";

function applyTheme(themeId) {
  document.body.dataset.theme = themeId;
}

function loadSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {}
  return DEFAULT_THEME;
}

function saveTheme(themeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {}
}

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
  const normalized = srtText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const entries = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
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

    const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!match) continue;

    const startSeconds = parseSrtTime(match[1]);
    const endSeconds = parseSrtTime(match[2]);

    const text = textLines
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\{\\.*?\}/g, ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\[[^\]]+\]/g, "")
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

function ThemeMenu({ themeId, onChangeTheme, isOpen, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="themeMenuBackdrop" onClick={onClose}>
      <div className="themeMenu" onClick={(e) => e.stopPropagation()}>
        <div className="themeMenuTitle">Theme</div>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={"themeMenuItem" + (t.id === themeId ? " active" : "")}
            onClick={() => onChangeTheme(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="themeMenuHint">Tip: Press ESC to close</div>
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

  // theme
  const [themeId, setThemeId] = useState(loadSavedTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    applyTheme(themeId);
    saveTheme(themeId);
  }, [themeId]);

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
        Tip: click the pirate logo to switch themes.
      </p>

      <img
        className="pirateLogo clickable"
        src="./assets/pirate-quad.png"
        alt="Smiling Pirate"
        onClick={() => setThemeMenuOpen(true)}
        role="button"
        tabIndex={0}
      />

      <ThemeMenu
        themeId={themeId}
        onChangeTheme={(id) => { setThemeId(id); setThemeMenuOpen(false); }}
        isOpen={themeMenuOpen}
        onClose={() => setThemeMenuOpen(false)}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
