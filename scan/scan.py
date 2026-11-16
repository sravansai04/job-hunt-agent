#!/usr/bin/env python3
"""Career-page job scanner.

Pulls postings straight from company career systems (Amazon, Greenhouse, Lever,
Ashby, Workday, JazzHR), filters to US SWE roles that fit, drops visa red flags, scores fit,
and reports only postings not seen before.

Usage:  python3 scan.py [--days 7] [--all]   (--all ignores seen.json)
Output: today.md (readable), new_jobs.json (machine), seen.json (dedupe memory)
Meta / Google / Microsoft / Apple have no public feed: Claude checks them in the browser.
"""
import json, re, sys, time, html, ssl, os, argparse, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "data"
HERE.mkdir(exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (job-hunt-scanner)", "Accept": "application/json"}
NOW = dt.datetime.now(dt.timezone.utc)
CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)

# ---------- filters (loaded from config/search.json; see config/search.example.json) ----------
def _load_cfg(name):
    for p in (ROOT / "config" / f"{name}.json", ROOT / "config" / f"{name}.example.json"):
        if p.exists(): return json.loads(p.read_text())
    raise SystemExit(f"missing config/{name}.json")
S = _load_cfg("search")
_R = lambda s: re.compile(s, re.I)
TITLE_KEEP, TITLE_DROP = _R(S["title_keep"]), _R(S["title_drop"])
NON_US, US_HINT = _R(S["location"]["non_us"]), _R(S["location"]["us_hint"])
VISA_FLAGS = _R(S["visa_flags"]) if S.get("needs_sponsorship", True) else None
YEARS = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(?:\d{1,2}\s*)?\+?\s*years?", re.I)
SKILL_RE = [(_R(k), w) for k, w in S["skills"].items()]
OFF_STACK = _R(S["off_stack"]) if S.get("off_stack") else None
TITLE_BONUS = [(_R(k), w) for k, w in S.get("title_bonus", {}).items()]
YEARS_PENALTY = sorted(((int(k), v) for k, v in S.get("years_penalty", {}).items()), reverse=True)


def get(url, data=None, timeout=25):
    req = Request(url, data=json.dumps(data).encode() if data else None,
                  headers={**UA, **({"Content-Type": "application/json"} if data else {})})
    with urlopen(req, timeout=timeout, context=CTX) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(s or ""))).strip()


def age_days(d):
    if d is None: return None
    return (NOW - d).total_seconds() / 86400


# ---------- source fetchers → list of dict(company,tier,sponsor,title,location,url,posted,desc,id) ----------
def greenhouse(token, tier, name, sponsor):
    d = get(f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true")
    out = []
    for j in d.get("jobs", []):
        ts = j.get("first_published") or j.get("updated_at")
        posted = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
        out.append(dict(company=name, tier=tier, sponsor=sponsor, title=j["title"], location=(j.get("location") or {}).get("name", ""),
                        url=j.get("absolute_url"), posted=posted, desc=strip(j.get("content")), id=f"gh:{token}:{j['id']}"))
    return out


def lever(token, tier, name, sponsor):
    d = get(f"https://api.lever.co/v0/postings/{token}?mode=json")
    out = []
    for j in d:
        posted = dt.datetime.fromtimestamp(j["createdAt"] / 1000, dt.timezone.utc) if j.get("createdAt") else None
        cats = j.get("categories") or {}
        loc = cats.get("location") or ", ".join(cats.get("allLocations") or [])
        desc = strip(j.get("descriptionPlain") or j.get("description")) + " " + " ".join(strip(l.get("content")) for l in j.get("lists", []))
        out.append(dict(company=name, tier=tier, sponsor=sponsor, title=j["text"], location=loc, url=j.get("hostedUrl"),
                        posted=posted, desc=desc, id=f"lever:{token}:{j['id']}"))
    return out


def ashby(token, tier, name, sponsor):
    d = get(f"https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true")
    out = []
    for j in d.get("jobs", []):
        ts = j.get("publishedAt")
        posted = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
        loc = j.get("location") or ""
        if j.get("isRemote"): loc += " (Remote)"
        comp = (j.get("compensation") or {}).get("compensationTierSummary") or ""
        out.append(dict(company=name, tier=tier, sponsor=sponsor, title=j["title"], location=loc, url=j.get("jobUrl"),
                        posted=posted, desc=strip(j.get("descriptionPlain") or j.get("descriptionHtml")), pay=comp, id=f"ashby:{token}:{j['id']}"))
    return out


def jazzhr(sub, tier, name, sponsor):
    # JazzHR boards (e.g. ouster.applytojob.com) have no JSON feed: parse the HTML list, then fetch
    # descriptions only for titles that pass the title filters. No posted date is published.
    def page(u):
        with urlopen(Request(u, headers={"User-Agent": "Mozilla/5.0 (Macintosh)"}), timeout=25, context=CTX) as r:
            return r.read().decode("utf-8", "replace")
    t = page(f"https://{sub}.applytojob.com/apply")
    out, seen_u = [], set()
    rx = r'<a href="(https://' + re.escape(sub) + r'\.applytojob\.com/apply/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>(.{0,400})'
    for u, title, rest in re.findall(rx, t, re.S):
        if u in seen_u: continue
        seen_u.add(u)
        title = html.unescape(title)
        loc = strip(re.split(r"<h3|<div id=", rest)[0])
        desc = ""
        if TITLE_KEEP.search(title) and not TITLE_DROP.search(title):
            try:
                d = page(u)
                m = re.search(r'id="job-description"(.*?)(?:<form|id="resumator-application)', d, re.S)
                desc = strip(m.group(1) if m else d)
            except Exception:
                pass
        out.append(dict(company=name, tier=tier, sponsor=sponsor, title=title, location=loc, url=u, posted=None,
                        desc=desc, id=f"jazzhr:{sub}:{u.split('/apply/')[1].split('/')[0]}"))
    return out


def amazon(cfg):
    out, seen = [], set()
    for q in cfg["queries"]:
        for off in range(0, 300, 100):
            u = f"https://www.amazon.jobs/en/search.json?base_query={q.replace(' ', '%20')}&country=USA&result_limit=100&offset={off}&sort=recent"
            d = get(u)
            for j in d.get("jobs", []):
                if j["id_icims"] in seen: continue
                seen.add(j["id_icims"])
                try: posted = dt.datetime.strptime(re.sub(r"\s+", " ", j["posted_date"]), "%B %d, %Y").replace(tzinfo=dt.timezone.utc)
                except Exception: posted = None
                desc = strip(j.get("description", "")) + " " + strip(j.get("basic_qualifications", "")) + " " + strip(j.get("preferred_qualifications", ""))
                out.append(dict(company="Amazon", tier=1, sponsor=cfg["sponsor"], title=j["title"], location=j.get("normalized_location") or j.get("location", ""),
                                url="https://www.amazon.jobs" + j["job_path"], posted=posted, desc=desc, id=f"amazon:{j['id_icims']}"))
            if len(d.get("jobs", [])) < 100: break
    return out


def wd_posted(txt):
    t = (txt or "").lower()
    if "today" in t: return NOW
    if "yesterday" in t: return NOW - dt.timedelta(days=1)
    m = re.search(r"(\d+)\+?\s*days", t)
    return NOW - dt.timedelta(days=int(m.group(1))) if m else None


def workday(name, tier, host, tenant, site, sponsor, max_pages=15):
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    out = []
    for p in range(max_pages):
        d = get(base + "/jobs", {"appliedFacets": {}, "limit": 20, "offset": p * 20, "searchText": "software engineer"})
        posts = d.get("jobPostings", [])
        for j in posts:
            out.append(dict(company=name, tier=tier, sponsor=sponsor, title=j.get("title", ""), location=j.get("locationsText", ""),
                            url=f"https://{host}/en-US/{site}{j.get('externalPath','')}", posted=wd_posted(j.get("postedOn")),
                            desc="", _wd=(base, j.get("externalPath", "")), id=f"wd:{tenant}:{j.get('externalPath','')}"))
        if len(posts) < 20: break
    return out


def wd_detail(job):
    base, path = job.pop("_wd")
    try:
        d = get(base + path)
        info = d.get("jobPostingInfo", {})
        job["desc"] = strip(info.get("jobDescription"))
        job["location"] = job["location"] if US_HINT.search(job["location"] or "") else (info.get("location") or job["location"])
        if info.get("startDate"):
            job["posted"] = dt.datetime.fromisoformat(info["startDate"]).replace(tzinfo=dt.timezone.utc)
    except Exception:
        pass
    return job


# ---------- evaluation ----------
def is_us(loc):
    if S["location"].get("mode") == "any": return True
    if not loc: return False
    if NON_US.search(loc) and not re.search(r"united states|\busa?\b", loc, re.I): return False
    return bool(US_HINT.search(loc))


def min_years(desc):
    yrs = [int(m.group(1)) for m in YEARS.finditer(desc[:6000]) if 0 < int(m.group(1)) < 20]
    return yrs[0] if yrs else None


def pay_range(desc):
    m = re.search(r"\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])", desc)
    return f"${m.group(1)}–${m.group(2)}" if m else ""


def score(j):
    text = (j["title"] + " " + j["desc"])
    s = 30 + {1: 8, 2: 5, 3: 2}.get(j["tier"], 0)
    hits, sk = [], 0
    for rx, w in SKILL_RE:
        if rx.search(text): sk += w; hits.append(rx.pattern)
    s += min(sk, S.get("skills_cap", 45))
    t = j["title"].lower()
    for rx, w in TITLE_BONUS:
        if rx.search(t): s += w
    if S.get("amazon_require_level") and j["company"] == "Amazon" and not re.search(S["amazon_require_level"], t, re.I): s -= 15
    if OFF_STACK:
        off = len(set(m.group(0).lower() for m in OFF_STACK.finditer(text)))
        s -= min(off * 3, 12)
    y = j.get("years")
    if y is not None:
        for lim, pen in YEARS_PENALTY:
            if y >= lim: s -= pen; break
    return max(0, min(100, s)), hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--min", type=int, default=65)
    a = ap.parse_args()

    cfg = _load_cfg("targets")
    tasks = [("Amazon", lambda: amazon(cfg["amazon"]))]
    for k, (tier, name, sp) in cfg["greenhouse"].items(): tasks.append((name, lambda k=k, t=tier, n=name, s=sp: greenhouse(k, t, n, s)))
    for k, (tier, name, sp) in cfg["lever"].items(): tasks.append((name, lambda k=k, t=tier, n=name, s=sp: lever(k, t, n, s)))
    for k, (tier, name, sp) in cfg["ashby"].items(): tasks.append((name, lambda k=k, t=tier, n=name, s=sp: ashby(k, t, n, s)))
    for k, (tier, name, sp) in cfg.get("jazzhr", {}).items(): tasks.append((name, lambda k=k, t=tier, n=name, s=sp: jazzhr(k, t, n, s)))
    for name, (tier, host, ten, site, sp) in cfg["workday"].items():
        tasks.append((name, lambda n=name, t=tier, h=host, te=ten, si=site, s=sp: workday(n, t, h, te, si, s)))

    jobs, errors = [], []
    with ThreadPoolExecutor(12) as ex:
        futs = {ex.submit(fn): name for name, fn in tasks}
        for f, name in futs.items():
            try: jobs += f.result()
            except Exception as e: errors.append(f"{name}: {str(e)[:80]}")
    total = len(jobs)
    jobs = list({j['id']: j for j in jobs}.values())

    # cheap filters first
    jobs = [j for j in jobs if TITLE_KEEP.search(j["title"]) and not TITLE_DROP.search(j["title"]) and is_us(j["location"])]
    jobs = [j for j in jobs if j["posted"] is None or age_days(j["posted"]) <= a.days]
    wd = [j for j in jobs if "_wd" in j]
    with ThreadPoolExecutor(12) as ex: list(ex.map(wd_detail, wd))
    jobs = [j for j in jobs if is_us(j["location"]) and (j["posted"] is None or age_days(j["posted"]) <= a.days)]

    seen_p = HERE / "seen.json"
    seen = set(json.loads(seen_p.read_text())) if seen_p.exists() else set()
    kept, dropped_visa = [], []
    for j in jobs:
        if not a.all and j["id"] in seen: continue
        if VISA_FLAGS and VISA_FLAGS.search(j["desc"]): dropped_visa.append(j); continue
        j["years"] = min_years(j["desc"])
        j["pay"] = j.get("pay") or pay_range(j["desc"])
        j["score"], j["hits"] = score(j)
        j["stretch"] = bool(j["years"] and j["years"] >= S.get("stretch_years", 6))
        if j["score"] >= a.min: kept.append(j)

    kept.sort(key=lambda j: (-j["score"], j["tier"]))
    seen |= {j["id"] for j in jobs}
    seen_p.write_text(json.dumps(sorted(seen)))

    for j in kept:
        j["posted"] = j["posted"].date().isoformat() if j["posted"] else ""
        j.pop("desc", None); j.pop("_wd", None)
    (HERE / "new_jobs.json").write_text(json.dumps(kept, indent=1))

    lines = [f"# New matching jobs — {NOW.astimezone().strftime('%a %b %d %Y %H:%M')}",
             f"Scanned {total} postings from {len(tasks)} sources → {len(jobs)} US SWE roles in last {a.days}d → "
             f"**{len(kept)} new matches ≥{a.min}** ({len(dropped_visa)} dropped for no-sponsorship language).", ""]
    lines += ["| # | Fit | Company | Role | Location | Posted | Yrs | Pay | Visa |", "|---|---|---|---|---|---|---|---|---|"]
    for i, j in enumerate(kept, 1):
        role = f"[{j['title']}]({j['url']})" + (" ⚠️stretch" if j["stretch"] else "")
        lines.append(f"| {i} | {j['score']} | {j['company']} | {role} | {j['location'][:40]} | {j['posted']} | {j['years'] or ''} | {j['pay']} | {j['sponsor']} |")
    lines += ["", "Browser-only (check manually each run): " + ", ".join(f"[{k}]({v['url']})" for k, v in cfg["browser_only"].items())]
    if errors: lines += ["", "Source errors: " + "; ".join(errors)]
    (HERE / "today.md").write_text("\n".join(lines))
    print("\n".join(lines[:2]))
    if errors: print("errors:", errors)


if __name__ == "__main__":
    main()
