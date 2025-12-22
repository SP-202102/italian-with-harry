#!/usr/bin/env python3
# GH-AUTOVERSION: v0.2.0
"""
Step 2 – Generate cards (phrases + words/tokens) from bilingual SRTs (IT + DE)

This script:
- Parses Italian SRT and German SRT
- Filters by a time window (default: first 14 minutes)
- Aligns IT->DE lines by timestamp overlap (fallback: nearest midpoint)
- Generates:
  - phrases.base.de.json   (phrase cards with IT text + aligned DE text)
  - words.base.de.json     (token cards with frequency + example IT/DE context)
- Does NOT use DeepL.
  DeepL can be added later as an optional enrichment step for word meanings.

Designed for a clean hybrid approach:
- Base translations are stored in repo as JSON.
- Users can override translations client-side (localStorage) and export overrides for dev merge.

Usage example:
  python scripts/step2-generate-cards.py ^
    --it "data/raw/Harry Potter 1 - Harry Potter e la Pietra Filosofale (Italian).srt" ^
    --de "data/raw/Harry Potter 1 - Harry Potter und der Stein der Weisen (deutsch).srt" ^
    --out "web/paths/italian-with-harry/cards" ^
    --movie-id hp1 ^
    --max-minutes 14 ^
    --chapter-minutes 7

Output:
  <out>/phrases.base.de.json
  <out>/words.base.de.json
"""

from __future__ import annotations
import argparse
import json
import math
import re
from pathlib import Path
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple


TIME_RE = re.compile(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})")
TOKEN_RE = re.compile(r"[a-zàèéìòóù']+", re.IGNORECASE)


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


def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def align_it_to_de(
    it_entries: List[Dict[str, Any]],
    de_entries: List[Dict[str, Any]],
    max_nearest_seconds: float = 6.0
) -> List[Optional[int]]:
    de_midpoints = [((d["start"] + d["end"]) / 2.0, i) for i, d in enumerate(de_entries)]
    aligned: List[Optional[int]] = []

    for it in it_entries:
        best_i: Optional[int] = None
        best_overlap = 0.0

        for i, d in enumerate(de_entries):
            ov = overlap(it["start"], it["end"], d["start"], d["end"])
            if ov > best_overlap:
                best_overlap = ov
                best_i = i

        if best_i is None or best_overlap == 0.0:
            it_mid = (it["start"] + it["end"]) / 2.0
            nearest_i = None
            nearest_dist = 1e18
            for mid, i in de_midpoints:
                dist = abs(mid - it_mid)
                if dist < nearest_dist:
                    nearest_dist = dist
                    nearest_i = i
            if nearest_i is not None and nearest_dist <= max_nearest_seconds:
                best_i = nearest_i
            else:
                best_i = None

        aligned.append(best_i)

    return aligned


def chapter_id(seconds: float, chapter_minutes: int) -> int:
    return int(seconds // (chapter_minutes * 60)) + 1


DEFAULT_STOPWORDS_IT = {
    "che","e","di","a","da","in","un","una","il","lo","la","i","gli","le",
    "mi","ti","si","ci","vi","non","per","con","su","ma","o","ora","poi",
    "sono","sei","era","hai","ho","ha","abbiamo","avete","hanno","del","della","dei","delle",
    "al","allo","alla","ai","agli","alle","nel","nello","nella","nei","negli","nelle",
    "un'","l'","d'","c'","m'","t'","s'","e'","è"
}


def build_phrase_cards(
    it_entries: List[Dict[str, Any]],
    de_entries: List[Dict[str, Any]],
    aligned_de_idx: List[Optional[int]],
    chapter_minutes: int
) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    for idx, it in enumerate(it_entries):
        de_i = aligned_de_idx[idx]
        de_text = de_entries[de_i]["text"] if de_i is not None else ""
        cards.append({
            "id": f"p_{idx+1:04d}",
            "type": "phrase",
            "chapterId": chapter_id(it["start"], chapter_minutes),
            "start": it["start"],
            "end": it["end"],
            "timestamp": hms(it["start"]),
            "it": it["text"],
            "de": de_text,
            "source": {"it": "srt", "de": "srt-aligned"}
        })
    return cards


def build_word_cards(
    it_entries: List[Dict[str, Any]],
    de_entries: List[Dict[str, Any]],
    aligned_de_idx: List[Optional[int]],
    chapter_minutes: int,
    min_word_length: int,
    max_words_per_chapter: int,
    stopwords_it: set
) -> List[Dict[str, Any]]:
    chapter_token_counts: Dict[int, Counter] = defaultdict(Counter)
    chapter_examples: Dict[int, Dict[str, List[Dict[str, str]]]] = defaultdict(lambda: defaultdict(list))

    for idx, it in enumerate(it_entries):
        ch = chapter_id(it["start"], chapter_minutes)
        tokens = [t.lower().replace("’", "'") for t in TOKEN_RE.findall(it["text"])]
        tokens = [t for t in tokens if len(t) >= min_word_length and t not in stopwords_it]

        de_i = aligned_de_idx[idx]
        de_text = de_entries[de_i]["text"] if de_i is not None else ""

        for token in tokens:
            chapter_token_counts[ch][token] += 1
            ex_list = chapter_examples[ch][token]
            if len(ex_list) < 2:
                ex_list.append({
                    "timestamp": hms(it["start"]),
                    "it": it["text"],
                    "de": de_text
                })

    cards: List[Dict[str, Any]] = []
    for ch, counter in sorted(chapter_token_counts.items()):
        for token, count in counter.most_common(max_words_per_chapter):
            cards.append({
                "id": f"w_c{ch}_{token}",
                "type": "word",
                "chapterId": ch,
                "it": token,
                "de": "",  # direct word meaning not derivable from SRT alignment alone
                "freq": count,
                "examples": chapter_examples[ch][token],
                "wordInfo": {
                    "pos": "",
                    "lemma": "",
                    "infinitive": ""
                },
                "source": {"it": "srt-derived", "de": "manual/override-or-api-later"}
            })
    return cards


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--it", required=True, help="Italian SRT path")
    parser.add_argument("--de", required=True, help="German SRT path (for alignment)")
    parser.add_argument("--out", required=True, help="Output folder (e.g., web/paths/<path-id>/cards)")
    parser.add_argument("--path-id", default="italian-with-harry", help="Learning path id")
    parser.add_argument("--movie-id", default="hp1", help="Movie id label for metadata")
    parser.add_argument("--max-minutes", type=int, default=14, help="Only process first N minutes")
    parser.add_argument("--chapter-minutes", type=int, default=7, help="Chapter size in minutes")
    parser.add_argument("--min-word-length", type=int, default=3, help="Minimum token length")
    parser.add_argument("--max-words-per-chapter", type=int, default=80, help="Top-N tokens per chapter")
    args = parser.parse_args()

    it_path = Path(args.it)
    de_path = Path(args.de)
    out_dir = Path(args.out)

    it_entries = parse_srt(it_path)
    de_entries = parse_srt(de_path)

    max_seconds = args.max_minutes * 60
    it_entries = [e for e in it_entries if e["start"] < max_seconds]
    de_entries = [e for e in de_entries if e["start"] < max_seconds]

    aligned = align_it_to_de(it_entries, de_entries)

    phrases = build_phrase_cards(it_entries, de_entries, aligned, args.chapter_minutes)
    words = build_word_cards(
        it_entries, de_entries, aligned,
        args.chapter_minutes, args.min_word_length,
        args.max_words_per_chapter, DEFAULT_STOPWORDS_IT
    )

    out_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "autoversion": "v0.2.0",
        "pathId": args.path_id,
        "movieId": args.movie_id,
        "window": {"start": 0, "end": max_seconds, "endHms": hms(max_seconds)},
        "chapterMinutes": args.chapter_minutes,
        "counts": {"phrases": len(phrases), "words": len(words)},
        "notes": [
            "DE text for phrases is aligned from DE SRT by timestamp overlap/nearest.",
            "Word cards do not have direct DE 'meaning' yet; use examples or add overrides later.",
            "POS/lemma/infinitive fields are placeholders for a later NLP step."
        ]
    }

    (out_dir / "phrases.base.de.json").write_text(
        json.dumps({"meta": meta, "cards": phrases}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    (out_dir / "words.base.de.json").write_text(
        json.dumps({"meta": meta, "cards": words}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Wrote {out_dir / 'phrases.base.de.json'}")
    print(f"Wrote {out_dir / 'words.base.de.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
