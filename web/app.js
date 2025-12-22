// GH-AUTOVERSION: v0.2.1
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

// IMPORTANT: for now, cards JSON is generated for hp1 only.
// Later we will generalize this so each movie has its own cards JSON.
const CARDS_MOVIE_ID = "hp1";

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

function downloadTextFile(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  return await response.json();
}

async function loadLearningPath(pathId) {
  return await fetchJson(`./paths/${pathId}/manifest.json`);
}

async function tryLoadCards(pathId) {
  // Returns { phrases: [], words: [], meta: {...} } or null if not found
  try {
    const phrases = await fetchJson(`./paths/${pathId}/cards/phrases.base.de.json`);
    const words = await fetchJson(`./paths/${pathId}/cards/words.base.de.json`);
    return {
      meta: phrases.meta || words.meta || null,
      phrases: phrases.cards || [],
      words: words.cards || [],
    };
  } catch (e) {
    // Not fatal. App can still run in "SRT-only" mode later.
    return null;
  }
}

function chapterIdFromSeconds(seconds, chapterMinutes) {
  return Math.floor(seconds / (chapterMinutes * 60)) + 1;
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

function makeOverrideKey(pathId, movieId, cardId) {
  return `llm.override.${pathId}.${movieId}.${cardId}`;
}

function loadOverride(pathId, movieId, cardId) {
  const key = makeOverrideKey(pathId, movieId, cardId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveOverride(pathId, movieId, cardId, patch) {
  const key = makeOverrideKey(pathId, movieId, cardId);
  try {
    localStorage.setItem(key, JSON.stringify(patch));
  } catch {}
}

function exportOverrides(pathId, movieId) {
  const prefix = `llm.override.${pathId}.${movieId}.`;
  const overrides = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const cardId = k.substring(prefix.length);
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      overrides[cardId] = JSON.parse(raw);
    }
  } catch {}
  const payload = {
    autoversion: "v0.2.1",
    pathId,
    movieId,
    exportedAtUtc: new Date().toISOString(),
    overrides,
  };
  downloadTextFile(`llm-overrides_${pathId}_${movieId}.json`, JSON.stringify(payload, null, 2));
}

function Flashcard({ card, pathId, movieId, onEdit }) {
  const [flipped, setFlipped] = useState(false);

  const isPhrase = card.type === "phrase";

  return (
    <div className="card" onClick={() => setFlipped((v) => !v)} role="button" tabIndex={0}>
      <div className="cardTop">
        <span className="badge">{card.type}</span>
        <span className="timestamp">{card.timestamp || ""}</span>
      </div>

      {!flipped ? (
        <div className="cardText">
          <div className="front">{card.it}</div>
          <div className="hint">Click to flip</div>
        </div>
      ) : (
        <div className="cardText" onClick={(e) => e.stopPropagation()}>
          <div className="back">
            <textarea
              className="editBox"
              rows={isPhrase ? 3 : 2}
              value={card.de || ""}
              placeholder="German translation / meaning (editable)"
              onChange={(e) => onEdit(card.id, e.target.value)}
            />
          </div>

          {card.type === "word" && (
            <div className="context">
              <div><b>freq:</b> {card.freq ?? ""}</div>
              {(card.examples || []).map((ex, idx) => (
                <div key={idx} style={{ marginTop: "8px" }}>
                  <div><b>{ex.timestamp}</b> — {ex.it}</div>
                  <div style={{ opacity: 0.9 }}>{ex.de}</div>
                </div>
              ))}
              <div style={{ marginTop: "8px", opacity: 0.85 }}>
                <b>word info (placeholder):</b>{" "}
                POS={card.wordInfo?.pos || "?"}, lemma={card.wordInfo?.lemma || "?"}, infinitive={card.wordInfo?.infinitive || "?"}
              </div>
            </div>
          )}

          {card.type === "phrase" && (
            <div className="context">{card.it}</div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  // theme
  const [themeId, setThemeId] = useState(loadSavedTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    applyTheme(themeId);
    saveTheme(themeId);
  }, [themeId]);

  // learning path + cards
  const [learningPath, setLearningPath] = useState(null);
  const [cardsBundle, setCardsBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // ui
  const [chapterMinutes, setChapterMinutes] = useState(7);
  const [studyMode, setStudyMode] = useState("phrases");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(1);
  const [index, setIndex] = useState(0);

  // Load path + cards
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setErrorText("");
      try {
        const path = await loadLearningPath(DEFAULT_PATH_ID);
        if (cancelled) return;
        setLearningPath(path);

        const bundle = await tryLoadCards(DEFAULT_PATH_ID);
        if (cancelled) return;
        setCardsBundle(bundle); // can be null
      } catch (e) {
        if (!cancelled) setErrorText(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Build cards list for current mode
  const baseCards = useMemo(() => {
    if (!cardsBundle) return [];
    const phrases = cardsBundle.phrases || [];
    const words = cardsBundle.words || [];
    if (studyMode === "phrases") return phrases;
    if (studyMode === "words") return words;
    return [...phrases, ...words];
  }, [cardsBundle, studyMode]);

  // Apply overrides (DE edits)
  const cardsWithOverrides = useMemo(() => {
    if (!learningPath) return baseCards;

    return baseCards.map((c) => {
      const override = loadOverride(learningPath.pathId, CARDS_MOVIE_ID, c.id);
      if (!override) return c;
      return { ...c, de: override.de ?? c.de };
    });
  }, [baseCards, learningPath]);

  // Chapters list (derived from cards)
  const chapters = useMemo(() => {
    // derive max chapterId from cards
    const maxCh = Math.max(1, ...cardsWithOverrides.map((c) => c.chapterId || 1));
    const items = [];
    for (let i = 1; i <= maxCh; i++) items.push({ id: i, title: `Chapter ${i}` });
    return items;
  }, [cardsWithOverrides]);

  useEffect(() => {
    setSelectedChapterId(1);
    setIndex(0);
  }, [studyMode, chapterMinutes]);

  // Filter to selected chapter
  const chapterCards = useMemo(() => {
    return cardsWithOverrides.filter((c) => (c.chapterId || 1) === selectedChapterId);
  }, [cardsWithOverrides, selectedChapterId]);

  // Shuffle deck
  const deck = useMemo(() => {
    const arr = [...chapterCards];
    if (!shuffleEnabled) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [chapterCards, shuffleEnabled]);

  useEffect(() => {
    setIndex(0);
  }, [selectedChapterId, shuffleEnabled]);

  const current = deck[index];

  function onEdit(cardId, newDe) {
    if (!learningPath) return;
    saveOverride(learningPath.pathId, CARDS_MOVIE_ID, cardId, { de: newDe });
    // Update current state immediately by re-triggering memo via a tiny hack:
    // we just force a state update by setting index to itself.
    setIndex((i) => i);
  }

  function next() {
    if (!deck.length) return;
    setIndex((i) => (i + 1 < deck.length ? i + 1 : 0));
  }

  function prev() {
    if (!deck.length) return;
    setIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1));
  }

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Learn Languages with Movies (LLM)</h1>
        <p className="subtitle">{learningPath ? learningPath.pathTitle : "Loading learning path..."}</p>
      </div>

      <div className="controls">
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
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>

        <label>
          <input type="checkbox" checked={shuffleEnabled} onChange={(e) => setShuffleEnabled(e.target.checked)} />
          Shuffle
        </label>

        <button onClick={() => learningPath && exportOverrides(learningPath.pathId, CARDS_MOVIE_ID)} disabled={!learningPath}>
          Export overrides
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {errorText && <p className="error">Error: {errorText}</p>}

      {!loading && !errorText && cardsBundle === null && (
        <p className="error">
          Cards JSON not found under <code>web/paths/{DEFAULT_PATH_ID}/cards/</code>.
          Generate them with Step2 and commit them.
        </p>
      )}

      {!loading && !errorText && current && (
        <>
          <div className="meta">
            <span>Cards in chapter: {deck.length}</span>
            <span>{deck.length ? `${index + 1} / ${deck.length}` : "0 / 0"}</span>
          </div>

          <Flashcard card={current} pathId={learningPath?.pathId} movieId={CARDS_MOVIE_ID} onEdit={onEdit} />

          <div className="nav">
            <button onClick={prev}>◀</button>
            <button onClick={next}>▶</button>
          </div>
        </>
      )}

      <p className="footer">Tip: click the pirate logo to switch themes.</p>

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
