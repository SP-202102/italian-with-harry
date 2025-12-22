// GH-AUTOVERSION: v0.1.4
const { useEffect, useMemo, useState } = React;

const STUDY_MODES = [
  { id: "phrases", label: "Phrases only" },
  { id: "words", label: "Wörter & Tokens" },
  { id: "mixed", label: "Mixed" },
];

async function loadManifest() {
  const response = await fetch("./data/manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load manifest.json: ${response.status} ${response.statusText}`);
  const manifest = await response.json();
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
  return `${hh}:${mm}:${ss}`;
}

function parseSrt(srtText) {
  const normalized = srtText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
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
    chapters.push({ id: i + 1, title: `Kapitel ${i + 1}`, startHms: formatHms(start), endHms: formatHms(end) });
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
  const chapterWordCounts = new Map(); // chapterId -> Map(token->count)

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
  return [...phraseCards, ...wordCards]; // mixed
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

  function next() {
    setFlipped(false);
    setIndex((i) => (i + 1 < deck.length ? i + 1 : 0));
  }
  function prev() {
    setFlipped(false);
    setIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1));
  }
  function reshuffle() {
    setDeck(shuffleArray(deck));
    setIndex(0);
    setFlipped(false);
  }

  if (!current) return <p>Keine Karten in diesem Kapitel.</p>;

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
        <div>{deck.length ? `${index + 1} / ${deck.length}` : "0 / 0"}</div>
        <button onClick={next}>▶</button>
        <button onClick={reshuffle} disabled={!shuffleEnabled}>Shuffle</button>
      </div>
    </div>
  );
}

function App() {
  const [movies, setMovies] = useState([]);
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
        const items = await loadManifest();
        if (cancelled) return;
        setMovies(items);
        if (items.length > 0) setMovieId(items[0].id);
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
  }, [movieId, movies]);

  const chapters = useMemo(() => buildChapters(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);
  const cards = useMemo(() => buildCardsByMode(entries, chapterSizeSeconds, studyMode), [entries, chapterSizeSeconds, studyMode]);

  const [selectedChapterId, setSelectedChapterId] = useState(1);
  useEffect(() => setSelectedChapterId(1), [movieId, chapterMinutes]);

  const chapterCards = useMemo(() => cards.filter((c) => c.chapterId === selectedChapterId), [cards, selectedChapterId]);

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Learn Languages with Movies (LLM)</h1>
        <p className="subtitle">Italian with Harry</p>
      </div>

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
          Mode:
          <select value={studyMode} onChange={(e) => setStudyMode(e.target.value)}>
            {STUDY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>

        <label>
          Kapitel:
          <select value={selectedChapterId} onChange={(e) => setSelectedChapterId(Number(e.target.value))}>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.title} ({c.startHms}-{c.endHms})</option>
            ))}
          </select>
        </label>

        <label>
          <input type="checkbox" checked={shuffleEnabled} onChange={(e) => setShuffleEnabled(e.target.checked)} />
          Shuffle
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

          <Flashcards cards={chapterCards} shuffleEnabled={shuffleEnabled} />
        </>
      )}

      <p className="footer">
        Hinweis: Babel-Warnung ist normal im "no-build" Modus. Spaeter koennen wir JSX entfernen oder precompilen.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
