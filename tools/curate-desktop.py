#!/usr/bin/env python3
"""Copy pad-ready jungle/DnB one-shots into Desktop/PULSE-Elite.

Run this on your Windows machine (or ask a local Cursor agent to run it).
Originals are never deleted — files are copied.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

AUDIO = re.compile(r"\.(wav|wave|mp3|mpeg|ogg|oga|aif|aiff|flac|m4a)$", re.I)
ZIP = re.compile(r"\.zip$", re.I)
SKIP = re.compile(
    r"(house|disco|nu[\s_-]?disco|tech[\s_-]?house|og house|phil weeks|s\.?k\.?t|"
    r"909 fill|acapella|acapellas|vocal collection|mantra vocal|leo wood|"
    r"keys|strings|brass|wind|midi[/\\]|[/\\]midi|serum|rex2|construction kit|"
    r"melodic loop|bass loop)",
    re.I,
)
KEEP = re.compile(
    r"(one[\s_-]?shot|drum hit|drum one|kicks?|snares?|hats?|perc|jungle|dnb|"
    r"d&b|drum ?& ?bass|amen|break|timeless|breakage|zenith|cia|roller|low res)",
    re.I,
)
RULES = [
    ("kick", re.compile(r"(kick|bd_|_bd|bassdrum|808|boom|kik)", re.I)),
    ("snare", re.compile(r"(snare|snr|sd_|_sd|rimshot|amen)", re.I)),
    ("clap", re.compile(r"(clap|clp|handclap)", re.I)),
    ("hat", re.compile(r"(hat|chh|ohh|hhc|hho|hh_)", re.I)),
    ("tom", re.compile(r"(tom|floor)", re.I)),
    ("cym", re.compile(r"(crash|ride|cym|china)", re.I)),
    ("perc", re.compile(r"(perc|shaker|tamb|conga|bongo|clave|cowbell|rim|top)", re.I)),
    ("fx", re.compile(r"(fx|riser|sweep|impact|stab|reese)", re.I)),
    ("loop", re.compile(r"(loop|break|groove|beat|amen)", re.I)),
]
PER_ROLE = {
    "kick": 24,
    "snare": 24,
    "clap": 12,
    "hat": 24,
    "tom": 12,
    "cym": 12,
    "perc": 20,
    "fx": 16,
    "loop": 8,
}
MAX_BYTES = 8 * 1024 * 1024


def desktop() -> Path:
    home = Path.home()
    for candidate in (home / "Desktop", home / "Skrivbord"):
        if candidate.exists():
            return candidate
    return home / "Desktop"


def classify(name: str) -> str:
    base = Path(name).name
    for role, pattern in RULES:
        if pattern.search(base):
            return role
    return "perc"


def wanted(path: str, size: int) -> bool:
    if size <= 0 or size > MAX_BYTES:
        return False
    if not AUDIO.search(path):
        return False
    if SKIP.search(path) and not KEEP.search(path):
        return False
    if not KEEP.search(path) and classify(path) == "perc" and "perc" not in path.lower():
        return False
    return True


def score(path: str) -> int:
    value = 0
    lower = path.lower()
    if KEEP.search(lower):
        value += 20
    if re.search(r"(jungle|amen|timeless|breakage|zenith|cia|roller)", lower):
        value += 18
    if SKIP.search(lower):
        value -= 80
    if re.search(r"one[\s_-]?shot|drum hit", lower):
        value += 16
    return value


def scan_roots() -> list[Path]:
    desk = desktop()
    roots = [
        desk,
        Path.home() / "Downloads",
        Path.home() / "Hämtade filer",
        desk / "Loopmasters",
        desk / "ljud",
        desk / "samples",
    ]
    extra = sys.argv[1:]
    roots.extend(Path(item) for item in extra)
    seen: list[Path] = []
    for root in roots:
        if root.exists() and root.resolve() not in [item.resolve() for item in seen]:
            seen.append(root)
    return seen


def collect() -> list[tuple[int, str, Path | tuple[Path, str]]]:
    hits: list[tuple[int, str, Path | tuple[Path, str]]] = []
    skip_names = {"pulse-elite"}
    for root in scan_roots():
        if root.name.lower() in skip_names:
            continue
        for path in root.rglob("*"):
            if path.is_dir() or "PULSE-Elite" in path.parts:
                continue
            if ZIP.search(path.name) and path.stat().st_size < 2_000_000_000:
                try:
                    with zipfile.ZipFile(path) as archive:
                        for info in archive.infolist():
                            if info.is_dir() or not wanted(info.filename, info.file_size):
                                continue
                            hits.append((score(info.filename), classify(info.filename), (path, info.filename)))
                except zipfile.BadZipFile:
                    continue
                continue
            if wanted(str(path), path.stat().st_size):
                hits.append((score(str(path)), classify(path.name), path))
    return hits


def unique_name(dest: Path, filename: str) -> Path:
    target = dest / filename
    if not target.exists():
        return target
    stem, suffix = Path(filename).stem, Path(filename).suffix
    index = 2
    while True:
        candidate = dest / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def main() -> int:
    dest_root = desktop() / "PULSE-Elite"
    if dest_root.exists():
        shutil.rmtree(dest_root)
    dest_root.mkdir(parents=True)

    hits = collect()
    by_role: dict[str, list] = defaultdict(list)
    for item in sorted(hits, key=lambda row: row[0], reverse=True):
        by_role[item[1]].append(item)

    copied = 0
    manifest: list[dict] = []
    for role, limit in PER_ROLE.items():
        folder = dest_root / role
        folder.mkdir(exist_ok=True)
        for _score, _role, source in by_role.get(role, [])[:limit]:
            if isinstance(source, tuple):
                zip_path, inner = source
                name = Path(inner).name
                target = unique_name(folder, name)
                with zipfile.ZipFile(zip_path) as archive:
                    target.write_bytes(archive.read(inner))
                origin = f"{zip_path.name}:{inner}"
            else:
                target = unique_name(folder, source.name)
                shutil.copy2(source, target)
                origin = str(source)
            copied += 1
            manifest.append({"role": role, "file": str(target.name), "from": origin, "score": _score})

    readme = dest_root / "README.txt"
    readme.write_text(
        "PULSE-Elite — gallrade jungle/DnB one-shots för padden.\n"
        "House, vocals och construction kits är bortfiltrerade.\n"
        "Originalen ligger kvar. I PULSE: Import → Skanna mapp → denna mapp.\n",
        encoding="utf-8",
    )
    (dest_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Skannade: {', '.join(str(root) for root in scan_roots())}")
    print(f"Kopierade {copied} filer → {dest_root}")
    for role in PER_ROLE:
        count = len(list((dest_root / role).glob("*")))
        if count:
            print(f"  {role:6} {count}")
    if copied == 0:
        print("Inga träffar. Packa upp Loopmasters-zippar på Desktop och kör igen.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
