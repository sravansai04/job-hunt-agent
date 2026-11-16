#!/usr/bin/env python3
"""Fill the automation scripts with your profile.

Reads config/profile.json and writes automation/build/<name>.js with the
__PROFILE__ placeholder replaced. Run it again whenever you edit the profile.
Run the built files from Playwright MCP (browser_run_code with filename=...).
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
prof = ROOT / "config" / "profile.json"
if not prof.exists():
    sys.exit("config/profile.json not found. Copy config/profile.example.json and fill it in.")
P = json.loads(prof.read_text())
for k in ("name", "email", "phone", "address", "resume_pdf", "work_auth", "eeo", "education", "work_history"):
    if k not in P:
        sys.exit(f"profile.json is missing '{k}'")
if "example.com" in P["email"] or "/ABSOLUTE/PATH" in P["resume_pdf"]:
    sys.exit("profile.json still has example values (email or paths). Fill in your real details first.")
out = ROOT / "automation" / "build"
out.mkdir(exist_ok=True)
blob = json.dumps(P, ensure_ascii=False)
n = 0
for f in sorted((ROOT / "automation").glob("*.js")):
    (out / f.name).write_text(f.read_text().replace("__PROFILE__", blob, 1))
    n += 1
print(f"wrote {n} scripts to {out}")
