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

## Project structure

- `data/raw/`  
  Source input subtitles. Put your `.srt` files here.

- `scripts/step1-web-bootstrap.ps1`  
  Copies/normalizes subtitles into the web path folder and generates manifests and web container files.

- `web/`  
  Static website (no backend).

- `web/paths/<path-id>/manifest.json`  
  Strict JSON (no comments). Contains `autoversion`, timestamps, and the list of SRT files.

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

The app loads `manifest.json` and `.srt` files via `fetch()`. Browsers typically block such reads when opening the page via `file://` for security reasons. Serving the static files via HTTP (localhost) or HTTPS (GitHub Pages) fixes this.

## Roadmap (keep it minimal)

### Create new learning paths from inside the app (Import/Export)

Because GitHub Pages (static hosting) cannot write new files to the server, creating paths **in-app** will be done via:

- **Import:** user uploads one or more `.srt` files in the UI
- App parses them, builds a new learning path in memory
- **Export:** user downloads a zip (or set of files) containing:
  - `manifest.json`
  - the sanitized `.srt` files

For the first iteration, this will be aimed at users who can add these exported files into `web/paths/<new-path-id>/` and commit them to GitHub.

No database required.

### Text-to-Speech (important)

We can add TTS using the browser Web Speech API (`speechSynthesis`). This can remain fully client-side.

### Voice input (nice to have)

Optional speech recognition via the SpeechRecognition API (best supported in Chromium browsers). Also client-side.

### Persistence (no database by default)

- Store progress (known/unknown, last position, user translations) in `localStorage` first.
- If syncing across devices becomes important later, we can add an optional sync mechanism, but the default remains local and static.

## Notes about “no build” mode

The app uses in-browser Babel to allow JSX without a build step. This is great for minimal setup.
If we want a production-grade setup later, we can either:

- precompile JSX (e.g., Vite/esbuild), or
- remove JSX and Babel completely.
