#!/usr/bin/env python3
"""Run: python3 tests/scan_test.py

Checks the scanner rules that come from the candidate's config, without network:
- no config/search.json (or no search_terms) -> "Run onboarding first", never the example preset
- the no-sponsorship filter is on if sponsorship is needed now OR later (OPT), off for citizens,
  and older profiles with needs_sponsorship still work
- Amazon queries default to search_terms; Workday searches every term and dedupes by job id
"""
import importlib.util, json, shutil, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
fails, n = 0, 0


def check(ok, msg):
    global fails, n
    n += 1
    if not ok:
        fails += 1
    print(("ok   " if ok else "FAIL ") + msg)


def tree(search=None, profile=None):
    """A throwaway repo layout with scan/scan.py and the given config files."""
    d = Path(tempfile.mkdtemp())
    (d / "scan").mkdir()
    (d / "config").mkdir()
    shutil.copy(REPO / "scan" / "scan.py", d / "scan" / "scan.py")
    shutil.copy(REPO / "config" / "targets.example.json", d / "config" / "targets.example.json")
    shutil.copy(REPO / "config" / "search.example.json", d / "config" / "search.example.json")
    if search is not None:
        (d / "config" / "search.json").write_text(json.dumps(search))
    if profile is not None:
        (d / "config" / "profile.json").write_text(json.dumps(profile))
    return d


def load(d):
    spec = importlib.util.spec_from_file_location("scan_under_test", d / "scan" / "scan.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


EXAMPLE = json.loads((REPO / "config" / "search.example.json").read_text())
ANALYST = dict(EXAMPLE, search_terms=["data analyst", "business analyst"], title_keep="analyst", title_drop="intern")

# 1. search.json is required; the example is never used as a fallback
for label, search in [("no search.json", None), ("search.json without search_terms", dict(EXAMPLE, search_terms=[]))]:
    d = tree(search=search)
    r = subprocess.run([sys.executable, "scan/scan.py", "--days", "1"], cwd=d, capture_output=True, text=True)
    check(r.returncode != 0 and "Run onboarding first" in (r.stdout + r.stderr), f"{label} -> exits with 'Run onboarding first'")

# 2. visa filter: on if sponsorship is needed now or later
for who, wa, want in [
    ("citizen", {"sponsorship_now": False, "sponsorship_future": False}, False),
    ("H-1B", {"sponsorship_now": True, "sponsorship_future": True}, True),
    ("OPT (later only)", {"sponsorship_now": False, "sponsorship_future": True}, True),
    ("legacy needs_sponsorship", {"needs_sponsorship": True}, True),
    ("legacy no sponsorship", {"needs_sponsorship": False}, False),
]:
    m = load(tree(search=ANALYST, profile={"work_auth": dict(authorized_us=True, **wa)}))
    check((m.VISA_FLAGS is not None) == want, f"visa filter {'on' if want else 'off'} for {who}")

# 3. Amazon queries default to search_terms; explicit queries win
m = load(tree(search=ANALYST))
seen = []
m.get = lambda url, data=None, timeout=25: seen.append(url) or {"jobs": []}
m.amazon({"sponsor": "likely"})
check(any("data%20analyst" in u for u in seen) and any("business%20analyst" in u for u in seen), "Amazon uses search_terms when queries is not set")
seen.clear()
m.amazon({"sponsor": "likely", "queries": ["sales engineer"]})
check(seen and all("sales%20engineer" in u for u in seen), "Amazon uses targets.json queries when set")

# 4. Workday searches every term and dedupes by job id
m = load(tree(search=ANALYST))
terms = []


def fake_get(url, data=None, timeout=25):
    terms.append(data["searchText"])
    return {"jobPostings": [{"title": "Data Analyst", "externalPath": "/job/X/Data-Analyst_R1", "locationsText": "Austin, TX"}]}


m.get = fake_get
jobs = m.workday("Acme", 1, "acme.wd1.myworkdayjobs.com", "acme", "External", "likely")
check(terms == ["data analyst", "business analyst"], f"Workday searched each term: {terms}")
check(len(jobs) == 1, f"Workday deduped the same posting across terms: {len(jobs)} job(s)")

print(f"\n{fails} of {n} FAILED" if fails else f"\nall {n} passed")
sys.exit(1 if fails else 0)
