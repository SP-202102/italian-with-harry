# Learn Languages with Movies (LLM)

LLM is a minimal, static learning app that turns movie subtitles into flashcards.

This repo is designed around a **hybrid approach**:

- **Server-prepared (committed) data** per learning path (cards + base translations)
- **Client-side overrides** in localStorage (editable cards)
- Optional **export/import** of overrides for developer workflows

## Learning Paths

A **Learning Path** is a self-contained bundle, stored under:

- `web/paths/<path-id>/`

Each path contains:

- `manifest.json` — metadata + list of subtitle files (raw)
- `raw/` — SRT files (source)
- `cards/` — generated study data (phrases/words + translations)

Example:

- `web/paths/italian-with-harry/`

## Where files belong (important)

### Source subtitles (inputs)

Put original SRT files here:

- `data/raw/`

These are inputs for scripts.

### Web-served learning path assets (must be under web/)

The app runs from `web/`. Anything the browser must `fetch()` has to be under `web/`.

Therefore, the committed outputs of Step 2 belong here:

- `web/paths/<path-id>/cards/phrases.base.de.json`
- `web/paths/<path-id>/cards/words.base.de.json`

### What is `data/processed/`?

`data/processed/` is an **optional developer workspace** for intermediate outputs.
It is **not required by the app**, and it is typically **not served**.
Use it only if you want to keep scratch/intermediate results separate from the final committed web assets.

If you want the cards to be used by the app and by GitHub Pages, put them in:

- `web/paths/<path-id>/cards/`

## Step 1: bootstrap web + learning path folder

```powershell
pwsh -File .\scripts\step1-web-bootstrap.ps1 -Force
```

This creates/updates the web container and copies SRTs into:

- `web/paths/<path-id>/raw/`

## Step 2: generate cards from bilingual subtitles (IT + DE)

This step does **not** use DeepL. It aligns phrase translations from the German SRT by timestamps.

Output is committed JSON under `web/paths/<path-id>/cards/`.

Example (HP1, first 14 minutes = 2×7 minutes):

```powershell
python .\scripts\step2-generate-cards.py `
  --it "data/raw/Harry Potter 1 - Harry Potter e la Pietra Filosofale (Italian).srt" `
  --de "data/raw/Harry Potter 1 - Harry Potter und der Stein der Weisen (deutsch).srt" `
  --out "web/paths/italian-with-harry/cards" `
  --path-id "italian-with-harry" `
  --movie-id "hp1" `
  --max-minutes 14 `
  --chapter-minutes 7
```

Generated files:

- `web/paths/italian-with-harry/cards/phrases.base.de.json`
- `web/paths/italian-with-harry/cards/words.base.de.json`

Notes:
- Phrase cards: `it` + aligned `de`
- Word cards: tokens + frequency + **example context** (IT + aligned DE)
- Word meanings (single-word translations) are not derived from SRT alignment. They can be filled manually (overrides) or enriched later via DeepL.

## Editing translations (overrides)

The app loads the committed base translations from `cards/*.json`.

Edits are stored locally in the browser (localStorage). This keeps the site static and avoids any database.

The app can export overrides to JSON so developers can merge them back into the repo.

## DeepL (planned enrichment step)

### Key point: API keys must never be shipped to the browser

DeepL API keys are secrets. Therefore the browser app must not call DeepL directly.

DeepL enrichment (optional) happens in a **developer build step** and the result is committed as static JSON.

DeepL is a translation service; it does not provide POS/lemma/infinitive analysis. Word info will require an NLP step (lemmatizer/POS tagger).

## Run locally

Start a local web server (required because `file://` blocks `fetch()` in most browsers):

- Double-click: `web/run-webserver.cmd`

Then open:

- http://localhost:5173

## Roadmap (minimal)

- Import/Export learning paths in-app (developer-oriented first)
- Text-to-speech via Web Speech API (`speechSynthesis`)
- Optional voice input via SpeechRecognition (Chromium-based browsers)
- Optional NLP enrichment for word info (POS/lemma/infinitive)
