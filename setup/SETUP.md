# Manual setup reference

You normally don't need this: open Claude Code in this folder and it runs setup/ONBOARDING.md for you. This page lists the same steps for anyone who prefers to do them by hand.

## 1. Tools
- macOS (the Keychain password flow is macOS-only; on Linux/Windows swap in your password manager's CLI).
- Python 3.9+ (scanner has no third-party dependencies).
- Node 18+. The Playwright MCP server is already registered in `.mcp.json` (separate browser profile in `~/.job-hunt-browser`); approve it when Claude Code asks.
- Optional: MacTeX or TeX Live (`pdflatex`) if you don't use Overleaf.

## 2. Your profile (stays local, git-ignored)
```
cp config/profile.example.json config/profile.json
cp config/targets.example.json config/targets.json
cp resume/summaries.example.md config/summaries.md
cp resume/template.tex         resume/base.tex
```
- `profile.json`: real answers only. Set `repo_dir`, `resume_pdf`, `overleaf.base_tex` to absolute paths. Set `auto_submit` to false if you want to approve each application. Set `work_auth.sponsorship_now` and `work_auth.sponsorship_future` separately (OPT: usually false now, true later); the scanner's no-sponsorship filter is on if either is true. Fill every value in `answers` yourself (they are null in the example and a null answer stops the filler). `daily_cap` is a number or null (no daily limit); `per_run` is roles per run or null (as many as qualify).
- `search.json`: there is no default; write your own. `config/search.example.json` is an EXAMPLE preset for a mid-level software engineer: use it only as a reference for the format. Set:
  - `search_terms`: the job titles to search for (for example `["data analyst", "business analyst"]`). The scanner's Workday searches, the sweep and Amazon (unless `targets.json` sets `amazon.queries`) use these.
  - `title_keep` / `title_drop` / `title_bonus`: regexes for the titles and levels you want and don't want.
  - `amazon_require_level`, `years_penalty` and `stretch_years` from your level and years of experience.
  - `skills` (regex: weight) from YOUR resume, and the location mode.
  Check it before running the schedules: run the scan and read `data/today.md` and `data/dropped.md`.
- `targets.json`: remove companies you don't want, add your own (find a company's ATS from its careers page URL: boards.greenhouse.io/<token>, jobs.lever.co/<token>, jobs.ashbyhq.com/<token>, <tenant>.wdN.myworkdayjobs.com/<site>).
- `base.tex` and `summaries.md`: your real resume and 3-6 summaries you wrote or approved.
- `config/rules.local.md`: confirmed and NOT-confirmed skills, companies to avoid, holds.

Then: `python3 setup/render.py` and `cd scan && python3 scan.py --days 7 --min 60 --all` to check the scan.

## 3. Browser accounts
In the dedicated Chrome profile, sign in to your job-search Gmail and Overleaf (optional). Claude creates career-site accounts with that email and stores generated passwords in the Keychain as `jobhunt:<site>`.

## 4. Tracker
Ask Claude: "Publish tracker/tracker.html as an artifact with the db capability (owner read/write) and save its URL in config/profile.json under tracker.url." The rows live in the artifact's database, collection `apps`.

## 5. Schedules
Ask Claude: "Set up the job-hunt schedules from prompts/SCHEDULES.md." Keep Claude Code running (crons are session-scoped; the renewer keeps them alive).

## 6. Before you ever push
```
git config core.hooksPath setup/hooks
python3 setup/check_private.py
```
The pre-commit hook blocks commits that contain values from your profile.json.
