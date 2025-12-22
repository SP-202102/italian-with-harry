# italian-with-harry

A minimal, static, GitHub-friendly learning app to study **Italian ↔ German** using movie subtitles (SRT).

This repository follows a “static dataset + local edits” approach:

- **Base cards** are generated offline (Python Step2) and committed as JSON under `web/paths/.../cards/`
- Users can **edit meanings/translations locally** (stored in `localStorage`)
- Local edits can be **exported** as JSON and later merged back into the repo by developers

No database required for the core workflow.

---

## Run (local)

From repo root:

```powershell
pwsh -File .\web\run-webserver.ps1
```

Or manual:

```powershell
cd web
py -m http.server 5173
```

Then open:

- `http://localhost:5173/`

> Why not file:// ?
> Most browsers block `fetch()` for local files. This app loads JSON via `fetch()`.

---

## UI model (v0.2.9)

The main viewport is designed to reduce eye movement:

- **Fixed-height card area** (50% of the screen height) with internal scrolling
- A **4-column header** above the card:
  1) Browse (Prev/Next/Flip + Front/Back badge)
  2) Actions (Copy IT/DE, Edit meaning, Export)
  3) Links (DeepL, Wiktionary, etc.)
  4) Options (Shuffle, Reset-to-front)

**Action buttons and link buttons use the same “pill” styling**.

Front/Back and mode are also shown **inside the card** as small status pills.  
Back side uses a **slightly different background** for orientation.

---

## Debug panel

Debug is **default ON** and located **under the text/card area**, so you can see what the app tried to load.

It logs:
- which files were requested (manifest / cards / meanings)
- load success/failure
- number of cards loaded

You can disable it (checkbox), and the preference is stored in `localStorage`.

---

## Data model

### Phrases (base)

`web/paths/<pathId>/cards/phrases.base.de.json`

- each card has:
  - `it`: Italian phrase
  - `de`: German subtitle range (aligned; may be duplicated rather than omitted)

### Words/tokens (base)

`web/paths/<pathId>/cards/words.base.de.json`

- each card has:
  - `it`: the token (surface form)
  - `de`: **context** (from subtitles)
  - `examples`: 1..n examples (timestamp + it + de)
  - `freq`: frequency count

Important:
- `de` in `words.base.de.json` is **context**, not “dictionary meaning”.

### Word meanings (seed)

`web/paths/<pathId>/cards/words.meanings.de.json`

This file provides initial German meanings for tokens. The app supports two formats:

**A) Legacy:**
```json
{ "meanings": { "questo": "dies", "lettera": "Brief" } }
```

**B) Lemmas + aliases (preferred):**
```json
{
  "lemmas":  { "lettera": "Brief", "buono": "gut" },
  "aliases": { "lettere": "lettera", "buon": "buono", "buone": "buono" }
}
```

Why this matters:
- It avoids duplicated maintenance for plural/gender variants like:
  - `lettera / lettere`
  - `buono / buon / buona / buone`

The app also contains tiny heuristics (fallback only), but **aliases are preferred**.

---

## Local edits (overrides)

Edits are stored in `localStorage` under keys like:

- `llm.override.<pathId>.<movieId>.<cardId>`

For word cards, the important editable field is:

- `deMeaning` (German meaning)

Export via the UI (“Export” button), resulting file:

- `llm-overrides_<pathId>_<movieId>.json`

Developers can merge exported overrides back into the repo as seed meanings.

---

## Repository layout (current)

Top-level:
- `README.md` – this file
- `data/raw/` – raw subtitles (SRT). Not used by the web app directly.
- `scripts/` – generator scripts (Step2, etc.)
- `web/` – the static web app (served via a tiny HTTP server)

`web/`:
- `index.html` – loads React from CDN and `app.js`
- `app.js` – main UI logic (no build step)
- `styles.css` – themes + layout
- `assets/` – images (pirate logo)
- `paths/` – learning paths, each with:
  - `manifest.json` (path metadata)
  - `cards/` (generated and/or curated JSON files)

Note on `/app`:
- Older experiments used a separate scaffold (e.g., Vite).
- Current “Way 1” deliberately keeps everything under `/web` to stay **static and minimal**.
- You can delete `/app` if it exists and you are not using it.

---

## Step2 generator (offline)

Use the Python generator to produce base cards:

```powershell
py .\scripts\step2-generate-cards.py `
  --it "data/raw/<italian>.srt" `
  --de "data/raw/<german>.srt" `
  --out "web/paths/italian-with-harry/cards" `
  --path-id "italian-with-harry" `
  --movie-id "hp1" `
  --max-minutes 15 `
  --chapter-minutes 7 `
  --merge-it-adjacent `
  --merge-it-gap-ms 350 `
  --de-pad-ms 250 `
  --de-max-lines 6
```

Alignment philosophy:
- prefer **duplication** over omission when mapping IT → DE ranges
- monotonic DE scanning (no backward jumps)

Known limitation:
- Subtitle translations are not always 1:1 and may drift. This is acceptable for early learning; later you can refine card translations manually via overrides.

---

## Next ideas (planned)

- Text-to-Speech (browser SpeechSynthesis) for IT/DE
- Optional voice input (Web Speech API) where supported
- Better morphological normalization (lemma detection) as a Python enrichment step


---

## Troubleshooting (common)

### Debug says `words=0`
This means `web/paths/<pathId>/cards/words.base.de.json` was loaded successfully, but the `cards` array inside it is empty (or missing).

Check:
- the file exists at the exact path (case + spelling)
- it contains JSON like: `{ "cards": [ ... ] }`
- Step2 generator was run with word/token extraction enabled and within the `--max-minutes` window

### Debug says meanings `format=missing`
The optional seed file `words.meanings.de.json` was not found at:

- `web/paths/<pathId>/cards/words.meanings.de.json`

This is optional; the app still works, but Word cards will have no initial “Meaning (DE)” until you add that file or edit via overrides.
