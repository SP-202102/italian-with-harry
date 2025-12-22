# italian-with-harry

A minimal, static, GitHub-friendly learning app to study **Italian ↔ German** using movie subtitles (SRT).

This repo uses a **static dataset + local edits** pattern:

- **Base cards** are generated offline (Python Step2) and committed as JSON under `web/paths/.../cards/`
- Users can **edit translations/meanings locally** (stored in `localStorage`)
- Local edits can be **exported** as JSON and later merged back into the repo by developers

No database required for the core workflow.

---

## The three different “German texts” you will see (important)

There are *three* different kinds of German text in this project, and it’s easy to mix them up:

1) **Phrase translation/context (`phrases.base.de.json` → `card.de`)**
   - This comes from the **German SRT** by time overlap with the Italian phrase unit.
   - It is *not guaranteed to be a literal translation* (subtitle translations often differ).
   - Purpose: give you **context** and a working “meaning” quickly.

2) **Word context (`words.base.de.json` → `card.de` or `card.deContext`)**
   - Also comes from the **German SRT**, but attached to a **single token** as examples/context.
   - This is **not** a dictionary meaning; it’s just the German subtitle text around that token occurrence.

3) **Word meaning (`words.meanings.de.json` or local override → `card.deMeaning`)**
   - This is the thing you intuitively expect as “the translation of the word”.
   - It does **not** come from the subtitle alignment automatically.
   - It comes from:
     - an optional committed seed file (`words.meanings.de.json`) **or**
     - your manual edits in the UI (stored in `localStorage`) and optionally exported.

If a word meaning is missing, it usually means: the token exists, but **no seed meaning** (and no local override) exists for that token/lemma.

---

## What you are seeing in the UI (counts)

The UI shows counts like “Phrases: 26” and “Words: 80” because Step2 generated that many cards **within the configured time window**.

Those numbers depend mainly on:
- `--max-minutes` (e.g., first 15 minutes)
- `--merge-it-adjacent` / gap settings (fewer, longer phrase cards if you merge aggressively)
- tokenization + filters for the word deck

If you increase `--max-minutes`, you will get more phrases and more word cards.

---

## How Step2 creates phrase cards (detailed)

Inputs:
- Italian SRT (primary timing / segmentation)
- German SRT (used as “translation/context” source)

### Step-by-step

1) **Parse the SRTs**
   - Read blocks: index → start/end timestamps → text lines.

2) **Clean subtitle text**
   - Remove formatting tags.
   - Trim whitespace.
   - Keep punctuation.
   - Keep multi-line intent.

3) **Create “Italian phrase units”**
   - Start with the Italian SRT entries.
   - Optionally merge adjacent entries when they are close in time
     - controlled by `--merge-it-adjacent` and `--merge-it-gap-ms`
   - Result: fewer cards, but each card is more like a “natural phrase”.

4) **Assign a chapter**
   - ChapterId is computed from start time and `--chapter-minutes`
   - Example: 0:00–6:59 → chapter 1, 7:00–13:59 → chapter 2, etc.

5) **Align German subtitles to each Italian phrase unit**
   For each Italian phrase unit (time range):
   - Expand the window slightly using `--de-pad-ms` (padding)
   - Collect all German subtitle entries which overlap the padded window
   - Join them into one German text block
   - Optional limit: `--de-max-lines` to avoid huge blocks

6) **Build the phrase card**
   - `it`: merged Italian phrase unit
   - `de`: joined German overlap block
   - plus `timestamp`, `chapterId`, and a stable `id`

### Why can phrase translations “feel wrong” sometimes?
Because the German subtitles:
- may paraphrase, shorten, or localize
- may split/merge sentences differently than Italian
- may drift timing slightly

So phrase cards are “aligned context”, not guaranteed literal translation. You can correct them via local edits/overrides.

---

## How Step2 creates word/token cards (detailed)

Important: Word cards are built **from the same Italian phrase units**.

### Step-by-step

1) **Tokenize the Italian phrase text**
   - Split on whitespace and punctuation
   - Normalize case
   - Keep apostrophes reasonably (Italian contractions)
   - Drop empty tokens

2) **Count token frequencies**
   - Count how often each token appears within the selected window (`--max-minutes`).

3) **Collect examples (context)**
   For each token occurrence:
   - Save:
     - timestamp
     - Italian phrase text (where it appeared)
     - German aligned text for that same phrase unit (context)

4) **Create one word card per token**
   - `it`: the surface token (e.g., `buone`)
   - `freq`: frequency
   - `examples`: list of occurrences with timestamp + IT/DE context
   - `de` in this file is best thought of as “context DE”, not meaning

### Why are word meanings missing?
Because Step2 does not do “dictionary translation” of tokens.
Instead, meanings come from the seed file and/or your edits:

- `words.meanings.de.json` (committed seed)
- localStorage override (`deMeaning`) created by editing a word card on the back side

---

## Where “word forms” come from and how we handle them

A big challenge in languages is that **one lemma** has many surface forms:

- `lettera` (singular) vs `lettere` (plural)
- `buono`, `buona`, `buoni`, `buone`
- apocopes like `buon` (short form of `buono`)

If you store meanings by surface form only, you end up duplicating:
- `lettera` = Brief
- `lettere` = Briefe
- …but you really want to maintain one “core meaning” and optionally note plural.

### Our approach (minimal but scalable)

We keep word **cards** by surface form (because that’s what appears in subtitles),
but we seed **meanings** by lemma:

`web/paths/<pathId>/cards/words.meanings.de.json`

Supported formats:

**A) Legacy map (works, but duplicates forms):**
```json
{ "meanings": { "lettera": "Brief", "lettere": "Briefe" } }
```

**B) Preferred: lemmas + aliases (less duplication):**
```json
{
  "lemmas":  { "lettera": "Brief", "buono": "gut" },
  "aliases": { "lettere": "lettera", "buon": "buono", "buone": "buono" }
}
```

Meaning lookup (in the web app) then works like:
1) exact token in `lemmas`
2) token in `aliases` → mapped lemma in `lemmas`
3) tiny heuristics (fallback only)

### Why might a token still not find a meaning?
- token not present in `lemmas`
- token not present in `aliases`
- heuristic does not cover that morphology case
- seed file missing entirely (then everything is missing until edited)

---

## Local edits (overrides) and why they matter

Edits are stored in `localStorage`:

- `llm.override.<pathId>.<movieId>.<cardId>`

What can be edited:
- Phrase card back side: `de`
- Word card back side: `deMeaning`

Export via UI → file:
- `llm-overrides_<pathId>_<movieId>.json`

Developer workflow:
- collect exports
- merge into the repo:
  - improve `phrases.base.de.json` (better phrase translations)
  - improve `words.meanings.de.json` (more lemma meanings + aliases)

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
- `assets/` – images
- `paths/` – learning paths:
  - `manifest.json`
  - `cards/` (generated/curated JSON)

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

Then open `http://localhost:5173/`.

> Why not file:// ?
> Most browsers block `fetch()` for local files. This app loads JSON via `fetch()`.

---

## Generate more cards (increase minutes)

Example: generate first 30 minutes instead of 15:

```powershell
py .\scripts\step2-generate-cards.py `
  --it "data/raw/<italian>.srt" `
  --de "data/raw/<german>.srt" `
  --out "web/paths/italian-with-harry/cards" `
  --path-id "italian-with-harry" `
  --movie-id "hp1" `
  --max-minutes 30 `
  --chapter-minutes 7 `
  --merge-it-adjacent `
  --merge-it-gap-ms 350 `
  --de-pad-ms 250 `
  --de-max-lines 6
```

Commit the updated JSON files under `web/paths/italian-with-harry/cards/`.

---

## GitHub Pages: deploy `/web` with GitHub Actions (recommended)

Because the Pages UI only offers `/ (root)` and `/docs`, we deploy `/web` using a **custom Pages workflow**. GitHub supports custom workflows for Pages. citeturn0search4turn0search2

This uses:
- `actions/upload-pages-artifact` to upload a folder as a Pages artifact citeturn0search0turn0search7
- `actions/deploy-pages` to deploy it citeturn0search1

Create:

`/.github/workflows/pages.yml`

with the workflow shown below (see “GitHub Pages workflow file”).

**Repo settings you must set:**
- Settings → Pages → Source: **GitHub Actions** (not “Deploy from a branch”) citeturn0search4turn0search2

---

## GitHub Pages workflow file (deploy web/)

```yaml
name: Deploy web/ to GitHub Pages

on:
  push:
    branches: ["main"]
    paths:
      - "web/**"
      - ".github/workflows/pages.yml"

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Upload Pages artifact (web/)
        uses: actions/upload-pages-artifact@v3
        with:
          path: web

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Notes:
- The required permissions follow GitHub’s guidance for workflow auth and Pages deployments. citeturn0search3turn0search4
- This workflow deploys whenever you push changes under `web/`.

---

## Troubleshooting

### Word meanings are still missing
That usually means:
- `words.meanings.de.json` does not exist, or
- the token’s lemma/alias is not covered yet.

Solution:
- add lemma entries to `lemmas`
- map more surface forms into `aliases`
- or edit in-app and export overrides, then merge back

---

## Next ideas (planned)

- Text-to-Speech (browser SpeechSynthesis) for IT/DE
- Optional voice input (Web Speech API) where supported
- Better morphological normalization (lemma detection) as a Python enrichment step
