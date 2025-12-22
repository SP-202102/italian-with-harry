# Learn Languages with Movies (LLM)

LLM is a minimal, static learning app that turns movie subtitles into flashcards.

## Core idea

A **Learning Path** is a self-contained bundle of subtitle assets and metadata, e.g.

- Italian with Harry
- Klingon with Worf

Each learning path lives under:

- `web/paths/<path-id>/`
  - `manifest.json` (metadata + list of subtitle files)
  - `raw/` (SRT files)
  - `cards/` (generated study data: phrases + words/tokens + translations)

## Project structure

- `data/raw/`  
  Source input subtitles. Put your `.srt` files here.

- `scripts/step1-web-bootstrap.ps1`  
  Copies/normalizes subtitles into the web path folder and generates the web container files.

- `scripts/step2-generate-cards.*` (planned)  
  Developer-only build step that parses SRT, generates cards, and (optionally) uses DeepL to create German translations.

- `web/`  
  Static website (no backend). Intended to run on localhost or GitHub Pages.

## Run locally (no build tooling)

1. Run bootstrap:

```powershell
pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force
```

2. Start local web server (one click):

- Double-click: `web/run-webserver.cmd`

3. Open:

- http://localhost:5173

## Learning modes

The UI supports three study modes:

1. Phrases only (subtitle lines in order)
2. Words & tokens (frequency-based tokens per chapter)
3. Mixed (phrases + tokens)

Shuffle can be enabled for any mode.

## Why a local web server is required

The app loads JSON and `.srt` files via `fetch()`. Browsers typically block such reads when opening the page via `file://` for security reasons. Serving the static files via HTTP (localhost) or HTTPS (GitHub Pages) fixes this.

## Translations: how we keep it clean and safe

### Key point: API keys must never be shipped to the browser

DeepL API keys are secrets. Therefore:

- The **browser app must not call DeepL directly** (GitHub Pages is public).
- Translations are generated in a **developer build step** on a trusted machine.
- The generated translation files are committed as static JSON under the learning path.

DeepL provides an API Free plan and an API Pro plan. API Free includes a monthly character quota, and Free/Pro have different endpoints (`api-free.deepl.com` vs `api.deepl.com`). See DeepL docs for details.

### Planned output files (per learning path)

- `web/paths/<path-id>/cards/phrases.de.json`
- `web/paths/<path-id>/cards/words.de.json`

The app loads these as **base translations**.

### Editable overrides (no database)

Users can edit translations in the UI.
Edits are stored as **local overrides** (localStorage) and can be exported.

Developers can merge exported overrides back into the repo by updating the learning path files (normal git workflow).

## Roadmap (keep it minimal)

### Create learning paths from inside the app (Import/Export)

Static hosting cannot write new files on the server. Creating paths in-app will be done via:

- **Import:** user uploads one or more `.srt` files in the UI
- App parses them and builds a learning path in memory
- **Export:** user downloads a folder (or zip) containing:
  - `manifest.json`
  - sanitized `.srt` files
  - generated `cards/*.json` (if available)

For the first iteration, this is aimed at users who can commit these exported files into `web/paths/<new-path-id>/`.

No database required.

### Text-to-Speech (important)

Add TTS using the browser Web Speech API (`speechSynthesis`). Fully client-side.

### Voice input (nice to have)

Optional speech recognition via the SpeechRecognition API (best supported in Chromium). Client-side.

### Word information (POS / lemma / infinitive)

DeepL is a translation service; it does **not** provide part-of-speech or lemma/infinitive analysis.
For word info we will likely use a separate NLP component (e.g., an Italian lemmatizer/POS tagger) during the developer build step and store results in `cards/words.de.json`.

## Notes about “no build” mode

The app uses in-browser Babel to allow JSX without a build step. This is great for minimal setup.
If we want a production-grade setup later, we can either:

- precompile JSX (e.g., Vite/esbuild), or
- remove JSX and Babel completely.
