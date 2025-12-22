// GH-AUTOVERSION: v0.2.3
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
const CARDS_MOVIE_ID = "hp1";

// Link templates (user-configurable)
const LINK_TEMPLATES_STORAGE_KEY = "llm.linkTemplates.v1";
const DEFAULT_LINK_TEMPLATES = [
  { id: "deepl", label: "DeepL (IT→DE)", urlTemplate: "https://www.deepl.com/translator?share=generic#it/de/{it}" },
  { id: "googletranslate", label: "Google Translate (IT→DE)", urlTemplate: "https://translate.google.com/?sl=it&tl=de&text={it}&op=translate" },
  { id: "wiktionary_it", label: "Wiktionary (IT token)", urlTemplate: "https://it.wiktionary.org/wiki/{it}" },
  { id: "translator_gpt", label: "TranslatorGPT (open)", urlTemplate: "https://chatgpt.com/g/g-678fd9647a4481919a5033a251b13e50-translatorgpt" },
];

function applyTheme(themeId) { document.body.dataset.theme = themeId; }
function loadSavedTheme() {
  try { const saved = localStorage.getItem(THEME_STORAGE_KEY); if (saved && THEMES.some((t) => t.id === saved)) return saved; } catch {}
  return DEFAULT_THEME;
}
function saveTheme(themeId) { try { localStorage.setItem(THEME_STORAGE_KEY, themeId); } catch {} }

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

async function loadLearningPath(pathId) { return await fetchJson(`./paths/${pathId}/manifest.json`); }
async function tryLoadCards(pathId) {
  try {
    const phrases = await fetchJson(`./paths/${pathId}/cards/phrases.base.de.json`);
    const words = await fetchJson(`./paths/${pathId}/cards/words.base.de.json`);
    return { meta: phrases.meta || words.meta || null, phrases: phrases.cards || [], words: words.cards || [] };
  } catch { return null; }
}

// Overrides
function makeOverrideKey(pathId, movieId, cardId) { return `llm.override.${pathId}.${movieId}.${cardId}`; }
function loadOverride(pathId, movieId, cardId) {
  const key = makeOverrideKey(pathId, movieId, cardId);
  try { const raw = localStorage.getItem(key); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
}
function saveOverride(pathId, movieId, cardId, patch) {
  const key = makeOverrideKey(pathId, movieId, cardId);
  try { localStorage.setItem(key, JSON.stringify(patch)); } catch {}
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
  downloadTextFile(
    `llm-overrides_${pathId}_${movieId}.json`,
    JSON.stringify({ autoversion: "v0.2.3", pathId, movieId, exportedAtUtc: new Date().toISOString(), overrides }, null, 2)
  );
}

// Link templates
function loadLinkTemplates() {
  try {
    const raw = localStorage.getItem(LINK_TEMPLATES_STORAGE_KEY);
    if (!raw) return DEFAULT_LINK_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LINK_TEMPLATES;
    return parsed;
  } catch { return DEFAULT_LINK_TEMPLATES; }
}
function saveLinkTemplates(templates) { try { localStorage.setItem(LINK_TEMPLATES_STORAGE_KEY, JSON.stringify(templates)); } catch {} }
function urlEncodeText(text) { return encodeURIComponent((text || "").trim()); }
function buildLink(urlTemplate, card) {
  const it = urlEncodeText(card.it || "");
  const de = urlEncodeText(card.de || "");
  return urlTemplate.replaceAll("{it}", it).replaceAll("{de}", de);
}
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// UI components
function ThemeMenu({ themeId, onChangeTheme, isOpen, onClose, onOpenLinks }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  return (
    <div className="themeMenuBackdrop" onClick={onClose}>
      <div className="themeMenu" onClick={(e) => e.stopPropagation()}>
        <div className="themeMenuTitle">Menu</div>

        <div className="themeMenuSectionTitle">Theme</div>
        {THEMES.map((t) => (
          <button key={t.id} className={"themeMenuItem" + (t.id === themeId ? " active" : "")} onClick={() => onChangeTheme(t.id)}>
            {t.label}
          </button>
        ))}

        <div className="themeMenuSectionTitle" style={{ marginTop: "10px" }}>Links</div>
        <button className="themeMenuItem" onClick={onOpenLinks}>Configure links…</button>

        <div className="themeMenuHint">Tip: Press ESC to close</div>
      </div>
    </div>
  );
}

function LinkConfigModal({ isOpen, onClose, linkTemplates, onChangeTemplates, onReset }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  function updateTemplate(index, field, value) {
    const next = linkTemplates.map((t, i) => (i === index ? { ...t, [field]: value } : t));
    onChangeTemplates(next);
  }
  function addTemplate() {
    onChangeTemplates([...linkTemplates, { id: `custom_${Date.now()}`, label: "New link", urlTemplate: "https://example.com/?q={it}" }]);
  }
  function removeTemplate(index) { onChangeTemplates(linkTemplates.filter((_, i) => i !== index)); }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">Configure deep links</div>
        <div className="modalText">
          Use placeholders <code>{"{it}"}</code> and <code>{"{de}"}</code>. Text is URL-encoded automatically.
          <div style={{ marginTop: "6px" }}>
            Example: <code>https://www.deepl.com/translator#it/de/{"{it}"}</code>
          </div>
        </div>

        <div className="modalList">
          {linkTemplates.map((t, idx) => (
            <div key={t.id} className="modalRow">
              <input className="input" value={t.label || ""} placeholder="Label" onChange={(e) => updateTemplate(idx, "label", e.target.value)} />
              <input className="input" value={t.urlTemplate || ""} placeholder="URL template (use {it} / {de})" onChange={(e) => updateTemplate(idx, "urlTemplate", e.target.value)} />
              <button onClick={() => removeTemplate(idx)}>Remove</button>
            </div>
          ))}
        </div>

        <div className="modalActions">
          <button onClick={addTemplate}>Add</button>
          <button onClick={onReset}>Reset defaults</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Flashcard({ card, onEditDe, linkTemplates }) {
  const [isBack, setIsBack] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [copyState, setCopyState] = useState("");

  useEffect(() => { setIsBack(false); setIsEditing(false); setCopyState(""); }, [card?.id]);

  if (!card) return null;

  function onFlip() { setIsBack((v) => !v); setIsEditing(false); }

  async function handleCopy(text) {
    const ok = await copyToClipboard(text);
    setCopyState(ok ? "Copied" : "Copy failed");
    setTimeout(() => setCopyState(""), 1200);
  }

  return (
    <div className="card" role="group" aria-label="Flashcard">
      <div className="cardTop">
        <span className="badge">{card.type}</span>
        <span className="timestamp">{card.timestamp || ""}</span>
      </div>

      {!isBack ? (
        <div className="cardText">
          <div className="front">{card.it}</div>
          <div className="hint">Use “Flip” to see / edit German</div>
        </div>
      ) : (
        <div className="cardText">
          {/* show original IT on the back as reference */}
          <div className="backSource">
            <div className="backSourceLabel">Italian</div>
            <div className="backSourceText">{card.it}</div>
          </div>

          {!isEditing ? (
            <div className="backPlain">
              {card.de ? card.de : <span className="muted">(German empty)</span>}
            </div>
          ) : (
            <textarea
              className="editBox"
              rows={card.type === "phrase" ? 4 : 2}
              value={card.de || ""}
              placeholder="German translation / meaning"
              onChange={(e) => onEditDe(card.id, e.target.value)}
            />
          )}

          {card.type === "word" && (
            <div className="context">
              <div><b>freq:</b> {card.freq ?? ""}</div>
              {(card.examples || []).map((ex, idx) => (
                <div key={idx} className="example">
                  <div><b>{ex.timestamp}</b> — {ex.it}</div>
                  <div className="muted">{ex.de}</div>
                </div>
              ))}
              <div className="muted" style={{ marginTop: "8px" }}>
                <b>word info (placeholder):</b>{" "}
                POS={card.wordInfo?.pos || "?"}, lemma={card.wordInfo?.lemma || "?"}, infinitive={card.wordInfo?.infinitive || "?"}
              </div>
            </div>
          )}

          <div className="hint">Use “Flip” again to return.</div>
        </div>
      )}

      <div className="cardActions">
        <button onClick={onFlip}>Flip</button>
        {isBack && <button onClick={() => setIsEditing((v) => !v)}>{isEditing ? "Done" : "Edit"}</button>}

        <button onClick={() => handleCopy(card.it)}>Copy IT</button>
        <button onClick={() => handleCopy(card.de || "")} disabled={!card.de}>Copy DE</button>
        {copyState ? <span className="tiny">{copyState}</span> : null}

        <div className="spacer" />

        <div className="links">
          {linkTemplates.map((t) => (
            <a key={t.id} className="linkBtn" href={buildLink(t.urlTemplate, card)} target="_blank" rel="noreferrer" title={t.label}>
              {t.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [themeId, setThemeId] = useState(loadSavedTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => { applyTheme(themeId); saveTheme(themeId); }, [themeId]);

  const [linkTemplates, setLinkTemplates] = useState(loadLinkTemplates());
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  useEffect(() => { saveLinkTemplates(linkTemplates); }, [linkTemplates]);

  const [learningPath, setLearningPath] = useState(null);
  const [cardsBundle, setCardsBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [chapterMinutes, setChapterMinutes] = useState(7);
  const [studyMode, setStudyMode] = useState("phrases");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(1);
  const [index, setIndex] = useState(0);

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
        setCardsBundle(bundle);
      } catch (e) {
        if (!cancelled) setErrorText(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const baseCards = useMemo(() => {
    if (!cardsBundle) return [];
    const phrases = cardsBundle.phrases || [];
    const words = cardsBundle.words || [];
    if (studyMode === "phrases") return phrases;
    if (studyMode === "words") return words;
    return [...phrases, ...words];
  }, [cardsBundle, studyMode]);

  const cardsWithOverrides = useMemo(() => {
    if (!learningPath) return baseCards;
    return baseCards.map((c) => {
      const override = loadOverride(learningPath.pathId, CARDS_MOVIE_ID, c.id);
      if (!override) return c;
      return { ...c, de: override.de ?? c.de };
    });
  }, [baseCards, learningPath]);

  const chapters = useMemo(() => {
    const maxCh = Math.max(1, ...cardsWithOverrides.map((c) => c.chapterId || 1));
    const items = [];
    for (let i = 1; i <= maxCh; i++) items.push({ id: i, title: `Chapter ${i}` });
    return items;
  }, [cardsWithOverrides]);

  useEffect(() => { setSelectedChapterId(1); setIndex(0); }, [studyMode, chapterMinutes]);

  const chapterCards = useMemo(() => cardsWithOverrides.filter((c) => (c.chapterId || 1) === selectedChapterId), [cardsWithOverrides, selectedChapterId]);

  const deck = useMemo(() => {
    const arr = [...chapterCards];
    if (!shuffleEnabled) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [chapterCards, shuffleEnabled]);

  useEffect(() => { setIndex(0); }, [selectedChapterId, shuffleEnabled]);

  const current = deck[index];

  function onEditDe(cardId, newDe) {
    if (!learningPath) return;
    saveOverride(learningPath.pathId, CARDS_MOVIE_ID, cardId, { de: newDe });
    setIndex((i) => i);
  }
  function next() { if (!deck.length) return; setIndex((i) => (i + 1 < deck.length ? i + 1 : 0)); }
  function prev() { if (!deck.length) return; setIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1)); }

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

          <Flashcard card={current} onEditDe={onEditDe} linkTemplates={linkTemplates} />

          <div className="nav">
            <button onClick={prev}>◀</button>
            <button onClick={next}>▶</button>
          </div>
        </>
      )}

      <p className="footer">Tip: click the pirate logo to open the menu. You can configure deep links there.</p>

      <img className="pirateLogo clickable" src="./assets/pirate-quad.png" alt="Smiling Pirate" onClick={() => setThemeMenuOpen(true)} role="button" tabIndex={0} />

      <ThemeMenu
        themeId={themeId}
        onChangeTheme={(id) => { setThemeId(id); }}
        isOpen={themeMenuOpen}
        onClose={() => setThemeMenuOpen(false)}
        onOpenLinks={() => { setThemeMenuOpen(false); setLinkModalOpen(true); }}
      />

      <LinkConfigModal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        linkTemplates={linkTemplates}
        onChangeTemplates={setLinkTemplates}
        onReset={() => setLinkTemplates(DEFAULT_LINK_TEMPLATES)}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
