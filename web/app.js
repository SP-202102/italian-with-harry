// GH-AUTOVERSION: v0.2.10
// Italian-with-Harry (LLM) – minimal static React app (no build step)
//
// Goals of this file:
// - Load learning path + cards from ./paths/<pathId>/...
// - Study decks: phrases / words / mixed
// - Local edits stored in localStorage (overrides), exportable as JSON
// - Optional seed word-meanings file (lemma+aliases supported)
// - UI: fixed-height viewport, 4-column header controls, consistent pill button styling
//
// NOTE: This app expects to run over http(s). file:// usually blocks fetch().

const { useEffect, useMemo, useState } = React;

// -----------------------------
// Constants / configuration
// -----------------------------
const DEFAULT_PATH_ID = "italian-with-harry";
const DEFAULT_MOVIE_ID = "hp1";

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

const DEFAULT_THEME_ID = "smilingpirate";
const THEME_STORAGE_KEY = "llm.theme";

const LINK_TEMPLATES_STORAGE_KEY = "llm.linkTemplates.v1";
const DEFAULT_LINK_TEMPLATES = [
  { id: "deepl", label: "DeepL (IT→DE)", urlTemplate: "https://www.deepl.com/translator?share=generic#it/de/{it}" },
  { id: "googletranslate", label: "Google Translate (IT→DE)", urlTemplate: "https://translate.google.com/?sl=it&tl=de&text={it}&op=translate" },
  { id: "wiktionary_it", label: "Wiktionary (IT token)", urlTemplate: "https://it.wiktionary.org/wiki/{it}" },
  { id: "translator_gpt", label: "TranslatorGPT (open)", urlTemplate: "https://chatgpt.com/g/g-678fd9647a4481919a5033a251b13e50-translatorgpt" },
];

const WORD_MEANINGS_FILENAME = "words.meanings.de.json";

// Debug panel (default ON)
const DEBUG_STORAGE_KEY = "llm.debug.enabled";
function loadDebugEnabledDefaultOn() {
  try {
    const raw = localStorage.getItem(DEBUG_STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}
function saveDebugEnabled(enabled) { try { localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? "1" : "0"); } catch {} }

// -----------------------------
// Theme helpers
// -----------------------------
function applyTheme(themeId) { document.body.dataset.theme = themeId; }
function loadThemeId() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {}
  return DEFAULT_THEME_ID;
}
function saveThemeId(themeId) { try { localStorage.setItem(THEME_STORAGE_KEY, themeId); } catch {} }

// -----------------------------
// Basic IO helpers
// -----------------------------
async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  return await response.json();
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
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function urlEncodeText(text) { return encodeURIComponent((text || "").trim()); }
function buildLink(urlTemplate, card) {
  const it = urlEncodeText(card.it || "");
  const de = urlEncodeText(card.de || "");
  return urlTemplate.replaceAll("{it}", it).replaceAll("{de}", de);
}

// -----------------------------
// localStorage: link templates
// -----------------------------
function loadLinkTemplates() {
  try {
    const raw = localStorage.getItem(LINK_TEMPLATES_STORAGE_KEY);
    if (!raw) return DEFAULT_LINK_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LINK_TEMPLATES;
    return parsed;
  } catch {
    return DEFAULT_LINK_TEMPLATES;
  }
}
function saveLinkTemplates(templates) { try { localStorage.setItem(LINK_TEMPLATES_STORAGE_KEY, JSON.stringify(templates)); } catch {} }

// -----------------------------
// localStorage: per-card overrides
// -----------------------------
function makeOverrideKey(pathId, movieId, cardId) { return `llm.override.${pathId}.${movieId}.${cardId}`; }

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
  try { localStorage.setItem(key, JSON.stringify(patch)); } catch {}
}

function exportOverrides(pathId, movieId) {
  const prefix = `llm.override.${pathId}.${movieId}.`;
  const overrides = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(prefix)) continue;
      const cardId = storageKey.substring(prefix.length);
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      overrides[cardId] = JSON.parse(raw);
    }
  } catch {}

  downloadTextFile(
    `llm-overrides_${pathId}_${movieId}.json`,
    JSON.stringify({ autoversion: "v0.2.10", pathId, movieId, exportedAtUtc: new Date().toISOString(), overrides }, null, 2)
  );
}

// -----------------------------
// Loading: manifest + cards
// -----------------------------
async function loadLearningPathManifest(pathId) {
  return await fetchJson(`./paths/${pathId}/manifest.json`);
}

async function tryLoadCardsBundle(pathId) {
  try {
    const phrasesFile = `./paths/${pathId}/cards/phrases.base.de.json`;
    const wordsFile = `./paths/${pathId}/cards/words.base.de.json`;
    const phrasesJson = await fetchJson(phrasesFile);
    const wordsJson = await fetchJson(wordsFile);
    return {
      meta: phrasesJson.meta || wordsJson.meta || null,
      phrases: phrasesJson.cards || [],
      words: wordsJson.cards || [],
    };
  } catch {
    return null;
  }
}

// -----------------------------
// Word meanings: supports formats
// A) Legacy: { meanings: { token: "de", ... } }
// B) Lemma+aliases: { lemmas: { lemma: "de" }, aliases: { form: "lemma" } }
// -----------------------------
async function tryLoadWordMeanings(pathId) {
  try {
    const data = await fetchJson(`./paths/${pathId}/cards/${WORD_MEANINGS_FILENAME}`);
    const legacy = data?.meanings;
    if (legacy && typeof legacy === "object") return { lemmas: legacy, aliases: {}, format: "legacy" };

    const lemmas = data?.lemmas && typeof data.lemmas === "object" ? data.lemmas : {};
    const aliases = data?.aliases && typeof data.aliases === "object" ? data.aliases : {};
    return { lemmas, aliases, format: "lemma+aliases" };
  } catch {
    return { lemmas: {}, aliases: {}, format: "missing" };
  }
}

// -----------------------------
// Meaning lookup (small, expandable)
// -----------------------------
function normalizeItalianToken(token) {
  const t = String(token || "").toLowerCase().trim();
  if (!t) return "";
  // common apocopes (starter set)
  if (t === "buon") return "buono";
  if (t === "bel") return "bello";
  return t;
}

function lookupMeaning(token, wordMeanings) {
  const raw = String(token || "").toLowerCase().trim();
  if (!raw) return "";

  const tokenNormalized = normalizeItalianToken(raw);
  const lemmas = wordMeanings?.lemmas || {};
  const aliases = wordMeanings?.aliases || {};

  // 1) exact token in lemmas
  if (lemmas[raw]) return lemmas[raw];
  if (lemmas[tokenNormalized]) return lemmas[tokenNormalized];

  // 2) aliases: form -> lemma
  const lemmaFromAlias = aliases[raw] || aliases[tokenNormalized];
  if (lemmaFromAlias && lemmas[lemmaFromAlias]) return lemmas[lemmaFromAlias];

  // 3) tiny heuristic: try singular / gender variants
  const candidates = [];
  if (tokenNormalized.endsWith("e")) candidates.push(tokenNormalized.slice(0, -1) + "a", tokenNormalized.slice(0, -1) + "o");
  if (tokenNormalized.endsWith("i")) candidates.push(tokenNormalized.slice(0, -1) + "o", tokenNormalized.slice(0, -1) + "e");
  if (tokenNormalized.endsWith("a")) candidates.push(tokenNormalized.slice(0, -1) + "o");

  for (const c of candidates) {
    if (lemmas[c]) return lemmas[c];
    const lemmaAlias = aliases[c];
    if (lemmaAlias && lemmas[lemmaAlias]) return lemmas[lemmaAlias];
  }

  return "";
}

// -----------------------------
// Text helpers (highlight + nicer subtitle formatting)
// -----------------------------
function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function highlightText(text, needle) {
  if (!text || !needle) return text || "";
  const pattern = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  const parts = String(text).split(pattern);
  return parts.map((p, i) => {
    if (p.toLowerCase() === needle.toLowerCase()) return React.createElement("mark", { key: i }, p);
    return React.createElement(React.Fragment, { key: i }, p);
  });
}

function formatSubtitleContext(text) {
  if (!text) return "";
  return String(text).replaceAll(" - ", "\n- ");
}

// -----------------------------
// UI components
// -----------------------------
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
          <button key={t.id} className={"pillBtn pillBtnBlock" + (t.id === themeId ? " active" : "")} onClick={() => onChangeTheme(t.id)}>
            {t.label}
          </button>
        ))}

        <div className="themeMenuSectionTitle" style={{ marginTop: "10px" }}>Links</div>
        <button className="pillBtn pillBtnBlock" onClick={onOpenLinks}>Configure links…</button>

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
    onChangeTemplates([
      ...linkTemplates,
      { id: `custom_${Date.now()}`, label: "New link", urlTemplate: "https://example.com/?q={it}" },
    ]);
  }

  function removeTemplate(index) { onChangeTemplates(linkTemplates.filter((_, i) => i !== index)); }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">Configure deep links</div>
        <div className="modalText">
          Use placeholders <code>{"{it}"}</code> and <code>{"{de}"}</code>. Text is URL-encoded automatically.
        </div>

        <div className="modalList">
          {linkTemplates.map((t, idx) => (
            <div key={t.id} className="modalRow">
              <input className="input" value={t.label || ""} placeholder="Label" onChange={(e) => updateTemplate(idx, "label", e.target.value)} />
              <input className="input" value={t.urlTemplate || ""} placeholder="URL template (use {it} / {de})" onChange={(e) => updateTemplate(idx, "urlTemplate", e.target.value)} />
              <button className="pillBtn" onClick={() => removeTemplate(idx)}>Remove</button>
            </div>
          ))}
        </div>

        <div className="modalActions">
          <button className="pillBtn" onClick={addTemplate}>Add</button>
          <button className="pillBtn" onClick={onReset}>Reset defaults</button>
          <button className="pillBtn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ViewportHeaderFourColumns({
  deckLength,
  positionLabel,
  isBack,
  onPrev,
  onNext,
  onFlip,
  canEditBack,
  editBackLabel,
  onToggleEditBack,
  copyItalianText,
  copyGermanText,
  hasGermanCopy,
  onExportOverrides,
  linkTemplates,
  currentCard,
  shuffleEnabled,
  onToggleShuffle,
  resetToFrontWhenBrowsing,
  onToggleResetToFront,
}) {
  const [copyStatus, setCopyStatus] = useState("");

  async function doCopy(text) {
    const ok = await copyToClipboard(text);
    setCopyStatus(ok ? "Copied" : "Copy failed");
    setTimeout(() => setCopyStatus(""), 900);
  }

  return (
    <div className="viewportHeaderGrid">
      <div className="col">
        <div className="colTitle">Browse</div>
        <div className="browseStack">
          <div className="pillRow">
            <button className="pillBtn" onClick={onPrev} disabled={!deckLength}>◀</button>
            <button className="pillBtn" onClick={onNext} disabled={!deckLength}>▶</button>
            <span className="tiny muted">{positionLabel}</span>
          </div>
          <div className="pillRow">
            <button className="pillBtn" onClick={onFlip} disabled={!deckLength}>Flip</button>
          </div>
        </div>
      </div>

      <div className="col">
        <div className="colTitle">Actions</div>
        <div className="pillRow">
          <button className="pillBtn" onClick={() => doCopy(copyItalianText)} disabled={!deckLength}>Copy IT</button>
          <button className="pillBtn" onClick={() => doCopy(copyGermanText)} disabled={!deckLength || !hasGermanCopy}>Copy DE</button>
          <button className="pillBtn" onClick={onToggleEditBack} disabled={!deckLength || !canEditBack}>
            {editBackLabel}
          </button>
          <button className="pillBtn" onClick={onExportOverrides} disabled={!deckLength}>Export</button>
          {copyStatus ? <span className="tiny muted">{copyStatus}</span> : null}
        </div>
      </div>

      <div className="col">
        <div className="colTitle">Links</div>
        <div className="pillRow">
          {linkTemplates.map((t) => (
            <a key={t.id} className="pillBtn pillLink" href={buildLink(t.urlTemplate, currentCard || {})} target="_blank" rel="noreferrer" title={t.label}>
              {t.label}
            </a>
          ))}
        </div>
      </div>

      <div className="col">
        <div className="colTitle">Options</div>
        <div className="pillRow optionsRow">
          <label className="pillToggle" title="Shuffle the deck">
            <input type="checkbox" checked={shuffleEnabled} onChange={(e) => onToggleShuffle(e.target.checked)} />
            Shuffle
          </label>

          <label className="pillToggle" title="If enabled, browsing Next/Prev returns to the front side">
            <input type="checkbox" checked={resetToFrontWhenBrowsing} onChange={(e) => onToggleResetToFront(e.target.checked)} />
            Reset
          </label>
        </div>
      </div>
    </div>
  );
}

function FlashcardViewportBody({
  card,
  isBack,
  studyModeId,
  isEditingBackText,
  onChangeBackText,
  wordMeanings,
}) {
  if (!card) return null;

  const isWordCard = card.type === "word";
  const highlightToken = isWordCard ? card.it : "";

  const seededMeaning = isWordCard ? lookupMeaning(card.it, wordMeanings) : "";
  const germanMeaning = isWordCard ? (card.deMeaning ?? seededMeaning ?? "") : (card.de || "");
  const germanContext = isWordCard ? (card.deContext ?? card.de ?? "") : "";

  return (
    <div className="viewportBody">
      <div className={"card " + (isBack ? "cardBack" : "cardFront")} role="group" aria-label="Flashcard">
        <div className="cardTop">
          <span className="timestamp">{card.timestamp || ""}</span>
        </div>

        {!isBack ? (
          <div className="cardText">
            <h2 className="textPrimary">{card.it}</h2>
            <div className="cardStatus">
              <span className="statusPill">Front</span>
              <span className="statusPill">{studyModeId}</span>
            </div>
          </div>
        ) : (
          <div className="cardText">
            <div className="backSource">
              <div className="backSourceLabel">Original</div>
              <h3 className="textSecondary">{card.it}</h3>
            </div>

            {!isWordCard ? (
              <div className="backPlain">
                {!isEditingBackText ? (
                  <h2 className="textPrimary">{card.de ? card.de : <span className="muted">(German empty)</span>}</h2>
                ) : (
                  <textarea
                    className="editBox"
                    rows={3}
                    value={card.de || ""}
                    placeholder="German translation"
                    onChange={(e) => onChangeBackText(card.id, e.target.value)}
                  />
                )}
              </div>
            ) : (
              <div className="backPlain">
                <div className="block">
                  <div className="backSourceLabel">Meaning (DE)</div>
                  {!isEditingBackText ? (
                    <h2 className="textPrimary">{germanMeaning ? germanMeaning : <span className="muted">(add meaning)</span>}</h2>
                  ) : (
                    <textarea
                      className="editBox"
                      rows={2}
                      value={germanMeaning}
                      placeholder="German meaning (e.g., 'dies', 'das')"
                      onChange={(e) => onChangeBackText(card.id, e.target.value)}
                    />
                  )}
                </div>

                <div className="block">
                  <div className="backSourceLabel">Context (DE from subtitles)</div>
                  <div className="textSecondary prewrap">{formatSubtitleContext(germanContext) || <span className="muted">(no context)</span>}</div>
                </div>

                <div className="context">
                  <div><b>freq:</b> {card.freq ?? ""}</div>
                  {(card.examples || []).map((ex, idx) => (
                    <div key={idx} className="example">
                      <div><b>{ex.timestamp}</b> — {highlightText(ex.it, highlightToken)}</div>
                      <div className="muted prewrap">{formatSubtitleContext(ex.de)}</div>
                    </div>
                  ))}
                  <div className="muted" style={{ marginTop: "8px" }}>
                    <b>word info (placeholder):</b>{" "}
                    POS={card.wordInfo?.pos || "?"}, lemma={card.wordInfo?.lemma || "?"}, infinitive={card.wordInfo?.infinitive || "?"}
                  </div>
                </div>
              </div>
            )}

            <div className="cardStatus">
              <span className="statusPill">Back</span>
              <span className="statusPill">{studyModeId}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DebugPanel({ enabled, onToggle, lines }) {
  return (
    <div className="debugArea">
      <label className="debugToggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        Debug (default ON)
      </label>

      {enabled && (
        <div className="debugPanel">
          <div className="debugTitle">Debug</div>
          <div className="debugContent">
            {lines.length ? lines.map((l, i) => <div key={i} className="debugLine">{l}</div>) : <div className="debugLine">(no debug lines yet)</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------
// App
// -----------------------------
function App() {
  const [themeId, setThemeId] = useState(loadThemeId());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  useEffect(() => { applyTheme(themeId); saveThemeId(themeId); }, [themeId]);

  const [linkTemplates, setLinkTemplates] = useState(loadLinkTemplates());
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  useEffect(() => { saveLinkTemplates(linkTemplates); }, [linkTemplates]);

  const [debugEnabled, setDebugEnabled] = useState(loadDebugEnabledDefaultOn());
  const [debugLines, setDebugLines] = useState([]);
  useEffect(() => { saveDebugEnabled(debugEnabled); }, [debugEnabled]);

  function debugLog(line) {
    const time = new Date().toLocaleTimeString();
    setDebugLines((lines) => [...lines, `[${time}] ${line}`]);
  }

  const [learningPath, setLearningPath] = useState(null);
  const [cardsBundle, setCardsBundle] = useState(null);
  const [wordMeanings, setWordMeanings] = useState({ lemmas: {}, aliases: {}, format: "missing" });

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [chapterMinutes, setChapterMinutes] = useState(7);
  const [studyModeId, setStudyModeId] = useState("phrases");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(1);
  const [cardIndex, setCardIndex] = useState(0);

  const [isBack, setIsBack] = useState(false);
  const [resetToFrontWhenBrowsing, setResetToFrontWhenBrowsing] = useState(true);
  const [isEditingBackText, setIsEditingBackText] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setErrorText("");
      setDebugLines([]);

      try {
        debugLog(`Loading manifest: ./paths/${DEFAULT_PATH_ID}/manifest.json`);
        const manifest = await loadLearningPathManifest(DEFAULT_PATH_ID);
        if (cancelled) return;
        setLearningPath(manifest);
        debugLog(`OK manifest. pathId=${manifest.pathId || "?"}`);

        debugLog(`Loading cards: ./paths/${DEFAULT_PATH_ID}/cards/phrases.base.de.json + words.base.de.json`);
        const bundle = await tryLoadCardsBundle(DEFAULT_PATH_ID);
        if (cancelled) return;
        setCardsBundle(bundle);
        debugLog(bundle ? `OK cards. phrases=${bundle.phrases?.length || 0}, words=${bundle.words?.length || 0}` : `Cards missing (bundle=null)`);

        debugLog(`Loading word meanings: ./paths/${DEFAULT_PATH_ID}/cards/${WORD_MEANINGS_FILENAME}`);
        const meanings = await tryLoadWordMeanings(DEFAULT_PATH_ID);
        if (cancelled) return;
        setWordMeanings(meanings);
        debugLog(`OK meanings. format=${meanings.format}, lemmas=${Object.keys(meanings.lemmas || {}).length}, aliases=${Object.keys(meanings.aliases || {}).length}`);
      } catch (e) {
        if (!cancelled) {
          const message = String(e?.message ?? e);
          setErrorText(message);
          debugLog(`ERROR: ${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const baseCards = useMemo(() => {
    if (!cardsBundle) return [];
    if (studyModeId === "phrases") return cardsBundle.phrases || [];
    if (studyModeId === "words") return cardsBundle.words || [];
    return [...(cardsBundle.phrases || []), ...(cardsBundle.words || [])];
  }, [cardsBundle, studyModeId]);

  const cardsWithOverrides = useMemo(() => {
    if (!learningPath) return baseCards;

    return baseCards.map((card) => {
      const override = loadOverride(learningPath.pathId, DEFAULT_MOVIE_ID, card.id);
      if (!override) return card;

      if (card.type === "word") {
        return { ...card, deMeaning: override.deMeaning ?? card.deMeaning, deContext: override.deContext ?? card.deContext };
      }
      return { ...card, de: override.de ?? card.de };
    });
  }, [baseCards, learningPath]);

  const chapters = useMemo(() => {
    const maxChapterId = Math.max(1, ...cardsWithOverrides.map((c) => c.chapterId || 1));
    return Array.from({ length: maxChapterId }, (_, i) => ({ id: i + 1, title: `Chapter ${i + 1}` }));
  }, [cardsWithOverrides]);

  useEffect(() => { setSelectedChapterId(1); setCardIndex(0); }, [studyModeId, chapterMinutes]);

  const chapterCards = useMemo(
    () => cardsWithOverrides.filter((c) => (c.chapterId || 1) === selectedChapterId),
    [cardsWithOverrides, selectedChapterId]
  );

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
    setCardIndex(0);
    if (resetToFrontWhenBrowsing) setIsBack(false);
    setIsEditingBackText(false);
  }, [selectedChapterId, shuffleEnabled]);

  const currentCard = deck[cardIndex];

  useEffect(() => {
    if (resetToFrontWhenBrowsing) setIsBack(false);
    setIsEditingBackText(false);
  }, [cardIndex, resetToFrontWhenBrowsing]);

  function goNext() { if (!deck.length) return; setCardIndex((i) => (i + 1 < deck.length ? i + 1 : 0)); }
  function goPrev() { if (!deck.length) return; setCardIndex((i) => (i - 1 >= 0 ? i - 1 : deck.length - 1)); }
  function toggleFlip() { setIsBack((v) => !v); setIsEditingBackText(false); }

  function updateBackText(cardId, newText) {
    if (!learningPath) return;

    // For phrases: editable field is card.de (German translation/subtitle range)
    // For words: editable field is card.deMeaning (dictionary-like meaning)
    if (currentCard && currentCard.type === "word") {
      saveOverride(learningPath.pathId, DEFAULT_MOVIE_ID, cardId, { deMeaning: newText });
    } else {
      saveOverride(learningPath.pathId, DEFAULT_MOVIE_ID, cardId, { de: newText });
    }

    // Force re-render (simple hack; keeps the app static/minimal)
    setCardIndex((i) => i);
  }

  const positionLabel = deck.length ? `${cardIndex + 1} / ${deck.length}` : "0 / 0";

  const italianCopy = currentCard?.it || "";
  const germanCopy = currentCard?.type === "word"
    ? (currentCard?.deMeaning || lookupMeaning(currentCard?.it, wordMeanings) || "")
    : (currentCard?.de || "");

  const hasGermanCopy = Boolean(germanCopy);

  const canEditBack = Boolean(currentCard && isBack);
  const editBackLabel = isEditingBackText ? "Done" : "Edit";

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
          <select value={studyModeId} onChange={(e) => setStudyModeId(e.target.value)}>
            {STUDY_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>

        <label>
          Chapter:
          <select value={selectedChapterId} onChange={(e) => setSelectedChapterId(Number(e.target.value))}>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>

        <span className="controlsHint">Tip: click the pirate logo (bottom-right) for Theme + Link config.</span>
      </div>

      {loading && <p>Loading...</p>}
      {errorText && <p className="error">Error: {errorText}</p>}

      {!loading && !errorText && cardsBundle === null && (
        <p className="error">
          Cards JSON not found under <code>web/paths/{DEFAULT_PATH_ID}/cards/</code>. Generate them (Step2) and commit.
        </p>
      )}

      {!loading && !errorText && cardsBundle && (
        <div className="viewport">
          {!currentCard && (
            <div className="emptyDeck">
              <div className="emptyDeckTitle">No cards available for the current selection.</div>
              <div className="muted">Mode: <b>{studyModeId}</b> · Chapter: <b>{selectedChapterId}</b>. Check that the JSON contains cards (e.g., words.base.de.json should have a non-empty <code>cards</code> array).</div>
            </div>
          )}

          {currentCard && (
          <ViewportHeaderFourColumns
            deckLength={deck.length}
            positionLabel={positionLabel}
            isBack={isBack}
            onPrev={goPrev}
            onNext={goNext}
            onFlip={toggleFlip}
            canEditBack={canEditBack}
            editBackLabel={editBackLabel}
            onToggleEditBack={() => setIsEditingBackText((v) => !v)}
            copyItalianText={italianCopy}
            copyGermanText={germanCopy}
            hasGermanCopy={hasGermanCopy}
            onExportOverrides={() => learningPath && exportOverrides(learningPath.pathId, DEFAULT_MOVIE_ID)}
            linkTemplates={linkTemplates}
            currentCard={currentCard}
            shuffleEnabled={shuffleEnabled}
            onToggleShuffle={setShuffleEnabled}
            resetToFrontWhenBrowsing={resetToFrontWhenBrowsing}
            onToggleResetToFront={setResetToFrontWhenBrowsing}
          />
          )}

          {currentCard && (
          <FlashcardViewportBody
            card={currentCard}
            isBack={isBack}
            studyModeId={studyModeId}
            isEditingBackText={isEditingBackText}
            onChangeBackText={updateBackText}
            wordMeanings={wordMeanings}
          />
          )}

          <DebugPanel enabled={debugEnabled} onToggle={setDebugEnabled} lines={debugLines} />
        </div>
      )}

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

      <p className="footer">Run via HTTP/HTTPS (localhost or GitHub Pages). file:// blocks fetch in most browsers.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
