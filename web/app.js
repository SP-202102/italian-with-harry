// GH-AUTOVERSION: v0.1.3
const { useEffect, useMemo, useState } = React;

async function loadManifest() {
  const response = await fetch("./data/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load manifest.json: ${response.status} ${response.statusText}`);
  }
  const manifest = await response.json();
  return manifest.items ?? [];
}

function parseSrtTime(timeString) {
  // "HH:MM:SS,mmm"
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

    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
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
    chapters.push({
      id: i + 1,
      title: `Kapitel ${i + 1}`,
      startHms: formatHms(start),
      endHms: formatHms(end),
    });
  }
  return chapters;
}

// Minimal: phrase cards (whole subtitle line)
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

function Flashcards({ cards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [deck, setDeck] = useState(cards);

  useEffect(() => {
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

  // load manifest once
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
    return () => {
      cancelled = true;
    };
  }, []);

  // load selected SRT
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
    return () => {
      cancelled = true;
    };
  }, [movieId, movies]);

  const chapters = useMemo(() => buildChapters(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);
  const cards = useMemo(() => buildPhraseCards(entries, chapterSizeSeconds), [entries, chapterSizeSeconds]);

  const [selectedChapterId, setSelectedChapterId] = useState(1);
  useEffect(() => setSelectedChapterId(1), [movieId, chapterMinutes]);

  const chapterCards = useMemo(() => cards.filter((c) => c.chapterId === selectedChapterId), [cards, selectedChapterId]);

  return (
    <div className="container">
      <h1>Italian with Harry</h1>

      <div className="controls">
        <label>
          Film:
          <select value={movieId} onChange={(e) => setMovieId(e.target.value)} disabled={movies.length === 0}>
            {movies.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          Kapitel-Minuten:
          <select value={chapterMinutes} onChange={(e) => setChapterMinutes(Number(e.target.value))}>
            {[5, 7, 10, 12].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
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
