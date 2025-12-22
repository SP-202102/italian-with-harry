#!/usr/bin/env python3
# GH-AUTOVERSION: v0.2.5
r"""
Step 2 – Generate cards (phrases + words/tokens) from bilingual SRTs (IT + DE)

v0.2.5 changes (important)
- Better DE coverage: instead of picking a single DE line per IT line, we now collect
  a *range* of DE lines that overlap the IT time window (plus optional padding).
  This favors duplication over omission (safer for bootstrapping).
- Still monotonic: DE index never goes backwards.
- Optional merge of adjacent IT lines remains.

Usage (recommended):
  py .\scripts\step2-generate-cards.py ^
    --it "data/raw/<italian>.srt" ^
    --de "data/raw/<german>.srt" ^
    --out "web/paths/<path-id>/cards" ^
    --path-id "<path-id>" ^
    --movie-id "<movie-id>" ^
    --max-minutes 14 ^
    --chapter-minutes 7 ^
    --merge-it-adjacent ^
    --merge-it-gap-ms 350 ^
    --de-pad-ms 250 ^
    --de-max-lines 4

Outputs:
  phrases.base.de.json
  words.base.de.json
"""

from __future__ import annotations
import argparse
import json
import math
import re
from pathlib import Path
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional


TIME_RE = re.compile(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})")
TOKEN_RE = re.compile(r"[a-zàèéìòóù']+", re.IGNORECASE)

DEFAULT_STOPWORDS_IT = {
    "che","e","di","a","da","in","un","una","il","lo","la","i","gli","le",
    "mi","ti","si","ci","vi","non","per","con","su","ma","o","ora","poi",
    "sono","sei","era","hai","ho","ha","abbiamo","avete","hanno","del","della","dei","delle",
    "al","allo","alla","ai","agli","alle","nel","nello","nella","nei","negli","nelle",
    "un'","l'","d'","c'","m'","t'","s'","e'","è"
}

def t2s(time_string: str) -> float:
    hh, mm, rest = time_string.split(":")
    ss, ms = rest.split(",")
    return int(hh) * 3600 + int(mm) * 60 + int(ss) + int(ms) / 1000.0

def hms(seconds: float) -> str:
    s = int(max(0, math.floor(seconds)))
    hh = s // 3600
    mm = (s % 3600) // 60
    ss = s % 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}"

def detect_repo_root(start_dir: Path) -> Path:
    current = start_dir.resolve()
    for _ in range(12):
        if (current / ".git").exists():
            return current
        if (current / "web").is_dir() and (current / "scripts").is_dir():
            return current
        if (current / "data").is_dir() and (current / "scripts").is_dir():
            return current
        if current.parent == current:
            break
        current = current.parent
    return start_dir.resolve()

def resolve_against_repo_root(path_value: str, repo_root: Path) -> Path:
    p = Path(path_value)
    if p.is_absolute():
        return p
    return (repo_root / p).resolve()

def parse_srt(path: Path) -> List[Dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", text.strip())

    entries: List[Dict[str, Any]] = []
    for block in blocks:
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if len(lines) < 2:
            continue

        if "-->" in lines[0]:
            time_line = lines[0]
            text_lines = lines[1:]
        else:
            time_line = lines[1] if len(lines) > 1 else ""
            text_lines = lines[2:]

        match = TIME_RE.search(time_line)
        if not match:
            continue

        start = t2s(match.group(1))
        end = t2s(match.group(2))

        subtitle = " ".join(text_lines)
        subtitle = re.sub(r"<[^>]+>", "", subtitle)
        subtitle = re.sub(r"\{\\.*?\}", "", subtitle)
        subtitle = re.sub(r"\[[^\]]+\]", "", subtitle)
        subtitle = subtitle.replace("♪", " ")
        subtitle = re.sub(r"\s+", " ", subtitle).strip()

        if subtitle:
            entries.append({"start": start, "end": end, "text": subtitle})
    return entries

def merge_adjacent_entries(entries: List[Dict[str, Any]], merge_gap_seconds: float) -> List[Dict[str, Any]]:
    if not entries:
        return []
    merged: List[Dict[str, Any]] = []
    current = dict(entries[0])
    for nxt in entries[1:]:
        gap = nxt["start"] - current["end"]
        if gap <= merge_gap_seconds:
            current["end"] = max(current["end"], nxt["end"])
            current["text"] = (current["text"].rstrip() + " " + nxt["text"].lstrip()).strip()
        else:
            merged.append(current)
            current = dict(nxt)
    merged.append(current)
    return merged

def chapter_id(seconds: float, chapter_minutes: int) -> int:
    return int(seconds // (chapter_minutes * 60)) + 1

def collect_de_range_monotonic(
    it_start: float,
    it_end: float,
    de_entries: List[Dict[str, Any]],
    start_index: int,
    pad_seconds: float,
    max_lines: int
) -> (str, int):
    """
    Collect DE lines that overlap [it_start-pad, it_end+pad], starting from start_index.
    Returns: concatenated_text, next_start_index
    """
    if not de_entries:
        return "", start_index

    window_start = max(0.0, it_start - pad_seconds)
    window_end = it_end + pad_seconds

    texts: List[str] = []
    i = start_index

    # advance to first plausible overlap (or close)
    while i < len(de_entries) and de_entries[i]["end"] < window_start:
        i += 1

    j = i
    while j < len(de_entries) and len(texts) < max_lines:
        d = de_entries[j]
        # stop if DE starts after window ends (no more overlaps)
        if d["start"] > window_end:
            break
        # include if overlaps window
        if d["end"] >= window_start and d["start"] <= window_end:
            texts.append(d["text"])
        j += 1

    # next start index should not go backwards; keep j-1 as last consumed index
    next_index = max(start_index, j-1 if j > start_index else start_index)
    # de-duplicate simple adjacent duplicates
    compact: List[str] = []
    for t in texts:
        if not compact or compact[-1] != t:
            compact.append(t)
    return " ".join(compact).strip(), next_index

def build_phrase_cards(
    it_entries: List[Dict[str, Any]],
    de_entries: List[Dict[str, Any]],
    chapter_minutes: int,
    de_pad_seconds: float,
    de_max_lines: int
) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    de_index = 0
    for idx, it in enumerate(it_entries):
        de_text, de_index = collect_de_range_monotonic(
            it["start"], it["end"], de_entries, de_index, de_pad_seconds, de_max_lines
        )
        cards.append({
            "id": f"p_{idx+1:04d}",
            "type": "phrase",
            "chapterId": chapter_id(it["start"], chapter_minutes),
            "start": it["start"],
            "end": it["end"],
            "timestamp": hms(it["start"]),
            "it": it["text"],
            "de": de_text,
            "source": {"it": "srt", "de": "srt-range-monotonic"}
        })
    return cards

def build_word_cards(
    it_entries: List[Dict[str, Any]],
    phrase_cards: List[Dict[str, Any]],
    chapter_minutes: int,
    min_word_length: int,
    max_words_per_chapter: int,
    stopwords_it: set,
    max_examples_per_token: int = 2
) -> List[Dict[str, Any]]:
    # Use phrase_cards as the aligned context (already contains de text)
    chapter_token_counts = defaultdict(Counter)
    chapter_examples = defaultdict(lambda: defaultdict(list))

    for it, phrase in zip(it_entries, phrase_cards):
        ch = chapter_id(it["start"], chapter_minutes)
        tokens = [t.lower().replace("’", "'") for t in TOKEN_RE.findall(it["text"])]
        tokens = [t for t in tokens if len(t) >= min_word_length and t not in stopwords_it]
        de_text = phrase.get("de","")

        for token in tokens:
            chapter_token_counts[ch][token] += 1
            ex_list = chapter_examples[ch][token]
            if len(ex_list) < max_examples_per_token:
                ex_list.append({"timestamp": hms(it["start"]), "it": it["text"], "de": de_text})

    cards: List[Dict[str, Any]] = []
    for ch, counter in sorted(chapter_token_counts.items()):
        for token, count in counter.most_common(max_words_per_chapter):
            cards.append({
                "id": f"w_c{ch}_{token}",
                "type": "word",
                "chapterId": ch,
                "it": token,
                "de": "",
                "freq": count,
                "examples": chapter_examples[ch][token],
                "wordInfo": {"pos": "", "lemma": "", "infinitive": ""},
                "source": {"it": "srt-derived", "de": "manual/override-or-api-later"}
            })
    return cards

def fail(message: str, exit_code: int = 2) -> int:
    print(f"[ERROR] {message}")
    return exit_code

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--it", required=True, help="Italian SRT path")
    parser.add_argument("--de", required=True, help="German SRT path")
    parser.add_argument("--out", required=True, help="Output folder (e.g., web/paths/<path-id>/cards)")
    parser.add_argument("--path-id", default="italian-with-harry")
    parser.add_argument("--movie-id", default="hp1")
    parser.add_argument("--max-minutes", type=int, default=14)
    parser.add_argument("--chapter-minutes", type=int, default=7)
    parser.add_argument("--min-word-length", type=int, default=3)
    parser.add_argument("--max-words-per-chapter", type=int, default=80)
    parser.add_argument("--merge-it-adjacent", action="store_true")
    parser.add_argument("--merge-it-gap-ms", type=int, default=350)
    parser.add_argument("--de-pad-ms", type=int, default=250, help="Padding around IT time window when collecting DE lines")
    parser.add_argument("--de-max-lines", type=int, default=4, help="Max number of DE lines to concatenate per IT card")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    repo_root = detect_repo_root(script_dir)

    it_path = resolve_against_repo_root(args.it, repo_root)
    de_path = resolve_against_repo_root(args.de, repo_root)
    out_dir = resolve_against_repo_root(args.out, repo_root)

    if not it_path.exists():
        return fail(f"IT SRT not found: {it_path}\nTip: run from repo root or pass an absolute path.")
    if not de_path.exists():
        return fail(f"DE SRT not found: {de_path}\nTip: run from repo root or pass an absolute path.")

    max_seconds = args.max_minutes * 60
    merge_gap_seconds = max(0.0, args.merge_it_gap_ms / 1000.0)
    de_pad_seconds = max(0.0, args.de_pad_ms / 1000.0)

    print(f"[INFO] Repo root: {repo_root}")
    print(f"[INFO] IT: {it_path}")
    print(f"[INFO] DE: {de_path}")
    print(f"[INFO] OUT: {out_dir}")
    print(f"[INFO] Window: 00:00:00 - {hms(max_seconds)}")

    it_entries = [e for e in parse_srt(it_path) if e["start"] < max_seconds]
    de_entries = [e for e in parse_srt(de_path) if e["start"] < max_seconds]

    if args.merge_it_adjacent:
        it_entries = merge_adjacent_entries(it_entries, merge_gap_seconds)

    phrases = build_phrase_cards(it_entries, de_entries, args.chapter_minutes, de_pad_seconds, args.de_max_lines)
    words = build_word_cards(it_entries, phrases, args.chapter_minutes, args.min_word_length, args.max_words_per_chapter, DEFAULT_STOPWORDS_IT)

    out_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "autoversion": "v0.2.5",
        "pathId": args.path_id,
        "movieId": args.movie_id,
        "window": {"start": 0, "end": max_seconds, "endHms": hms(max_seconds)},
        "chapterMinutes": args.chapter_minutes,
        "counts": {"phrases": len(phrases), "words": len(words)},
        "alignment": {
            "method": "DE range collection by overlap with padding",
            "monotonic": True,
            "dePadMs": args.de_pad_ms,
            "deMaxLines": args.de_max_lines,
            "mergeItalianAdjacent": bool(args.merge_it_adjacent),
            "mergeItalianGapMs": args.merge_it_gap_ms
        },
        "notes": [
            "DE for phrases is built by concatenating multiple overlapping DE subtitle lines (favor duplication over omission).",
            "This reduces cases where parts of a sentence would be missing due to split/merge differences between subtitle tracks.",
            "Word cards do not have direct DE meanings yet; use examples or add overrides later."
        ]
    }

    (out_dir / "phrases.base.de.json").write_text(json.dumps({"meta": meta, "cards": phrases}, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "words.base.de.json").write_text(json.dumps({"meta": meta, "cards": words}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] Wrote {out_dir / 'phrases.base.de.json'}")
    print(f"[OK] Wrote {out_dir / 'words.base.de.json'}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
