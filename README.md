# Learn Languages with Movies (LLM)

LLM is a minimal, static learning app that turns movie subtitles into flashcards.

This repo uses a **hybrid approach**:

- **Server-prepared (committed) data** per learning path (cards + base translations)
- **Client-side overrides** in localStorage (editable cards)
- Optional **export/import** of overrides for developer workflows

## README location

The main `README.md` belongs in the **repo root**.

Additional READMEs are optional. If a subfolder has its own README, it should be explicit
(e.g. `web/README.md`, `scripts/README.md`). Right now we only need the root README.

## Folder structure (complete)

### `/web` (required)

This is the **static website root**.
Anything the browser must `fetch()` must live under `/web`.

- `/web/index.html` — entry page
- `/web/app.js` — the React app (no build step; in-browser Babel)
- `/web/styles.css` — styles + themes
- `/web/assets/` — images (e.g. logo)
- `/web/paths/` — all learning paths served to the browser
  - `/web/paths/<path-id>/manifest.json` — learning path metadata
  - `/web/paths/<path-id>/raw/` — subtitle sources for the path (served)
  - `/web/paths/<path-id>/cards/` — **generated card data** (served + committed)
    - `phrases.base.de.json`
    - `words.base.de.json`

### `/data` (developer inputs/outputs; not served)

A **developer workspace**. The web app does not load from here.

- `/data/raw/` — original subtitle sources (inputs for scripts)
- `/data/processed/` — optional scratch/intermediate outputs (not required)

Rule of thumb:
- If the browser should load it → it must be under `/web`.
- If a script uses it as input → it can live under `/data`.

### `/scripts` (developer-only tooling)

- `/scripts/step1-web-bootstrap.ps1` — creates web containers and copies raw SRT into `/web/paths/.../raw`
- `/scripts/step2-generate-cards.py` — generates committed cards JSON into `/web/paths/.../cards`

### `/app` (optional / currently not needed)

If you have an `/app` folder, it is typically from a previous Vite/Node build setup.

With the current **no-build** approach, `/app` is **not required**.

Recommendation:
- If you don’t use `/app`, delete it to keep the repo clean.
- If you want a production build later (no in-browser Babel), `/app` could become relevant again.

## Windows: why `python` may not be recognized

On Windows, `python` is only recognized if Python was added to PATH.
If it’s not, use the Python Launcher:

```powershell
py --version
py -V
```

Run scripts like this:

```powershell
py .\scripts\step2-generate-cards.py --help
```

## Step 1: bootstrap web + learning path folder

```powershell
pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force
```

This creates/updates containers and copies SRTs into:

- `web/paths/<path-id>/raw/`

## Step 2: generate cards from bilingual subtitles (IT + DE)

This step aligns phrase translations from the German SRT by timestamps (no DeepL).

### Important: alignment quality and “missing text”

IT and DE subtitles often split/merge sentences differently.
If you pick exactly one DE line per IT line, you can lose parts of the sentence.

Therefore Step2 uses a safer strategy:

- For each IT line, collect **multiple DE lines** that overlap the IT time window
  (with a small padding), and concatenate them.
- This favors **duplication over omission** (better for bootstrapping).

### Example (HP1, first 14 minutes = 2×7 minutes)

Run from repo root:

```powershell
py .\scripts\step2-generate-cards.py `
  --it "data/raw/Harry Potter 1 - Harry Potter e la Pietra Filosofale (Italian).srt" `
  --de "data/raw/Harry Potter 1 - Harry Potter und der Stein der Weisen (deutsch).srt" `
  --out "web/paths/italian-with-harry/cards" `
  --path-id "italian-with-harry" `
  --movie-id "hp1" `
  --max-minutes 14 `
  --chapter-minutes 7 `
  --merge-it-adjacent `
  --merge-it-gap-ms 350 `
  --de-pad-ms 250 `
  --de-max-lines 4
```

Generated files (commit these):

- `web/paths/italian-with-harry/cards/phrases.base.de.json`
- `web/paths/italian-with-harry/cards/words.base.de.json`

## Editing translations (overrides)

The app loads committed base translations from `cards/*.json`.

Edits are stored locally in the browser (localStorage).
This keeps the site static and avoids any database.

The app can export overrides to JSON so developers can merge them back into the repo.

## Deep links to translation tools (user-configurable)

Each card shows configurable deep links (e.g., DeepL, Google Translate, Wiktionary).
Templates are stored in localStorage and can use placeholders:

- `{it}` — Italian text (URL-encoded)
- `{de}` — German text (URL-encoded)

Example DeepL template:

- `https://www.deepl.com/translator?share=generic#it/de/{it}`

Note: Some tools (e.g., custom GPTs) do not support passing text via URL.
In that case, the app provides copy buttons for IT and DE.

## Run locally

Start a local web server (required because `file://` blocks `fetch()` in most browsers):

```powershell
cd web
py -m http.server 5173
```

Then open:

- http://localhost:5173

## Roadmap (minimal)

- Import overrides JSON (currently: export only)
- Import/Export learning paths in-app (developer-oriented first)
- Text-to-speech via Web Speech API (`speechSynthesis`)
- Optional voice input via SpeechRecognition (Chromium-based browsers)
- Optional NLP enrichment for word info (POS/lemma/infinitive)
