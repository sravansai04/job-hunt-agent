#!/usr/bin/env python3
"""Pre-push guard: fail if tracked files contain values from your private profile.

Usage: python3 setup/check_private.py   (run before every git push; also wired as a pre-commit hook by SETUP.md)
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
prof = ROOT / "config" / "profile.json"
if not prof.exists():
    print("no config/profile.json, nothing to check"); sys.exit(0)
P = json.loads(prof.read_text())
needles = set()
GENERIC = {"title", "major", "degree", "degree_regex", "start_month", "end_month", "start_year", "end_year", "current",
           "country", "state", "type", "collection", "metro", "metro_typed", "city"}
def walk(v):
    if isinstance(v, dict): [walk(x) for k, x in v.items() if not k.startswith("_") and k not in GENERIC]
    elif isinstance(v, list): [walk(x) for x in v]
    elif isinstance(v, str) and len(v) >= 6 and not v.startswith("^") and "\\" not in v: needles.add(v)
for k in ("name", "email", "phone", "address", "links", "work_history", "education", "tracker", "overleaf", "evidence_of_excellence", "repo_dir"):
    walk(P.get(k)) if not isinstance(P.get(k), str) else walk([P[k]])
ex = ROOT / "config" / "profile.example.json"
if ex.exists():
    ex_text = ex.read_text()
    needles = {n for n in needles if n not in ex_text}  # unchanged example placeholders are not private
files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout.split()
bad = []
for f in files:
    try: t = (ROOT / f).read_text(errors="ignore")
    except Exception: continue
    for n in needles:
        if n in t: bad.append((f, n[:40]))
if bad:
    print("PRIVATE DATA FOUND in files that would be committed:")
    for f, n in bad: print(f"  {f}: {n!r}")
    sys.exit(1)
print(f"ok: {len(files)} files clean of {len(needles)} private values")
