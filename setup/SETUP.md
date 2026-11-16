# First-time setup (about 30 minutes)

Do these with Claude Code open in this folder. You can say "walk me through setup/SETUP.md" and Claude will do most steps with you.

## 1. Tools
- macOS (the Keychain password flow is macOS-only; on Linux/Windows swap in your password manager's CLI).
- Python 3.9+ (scanner has no third-party dependencies).
- Node 18+ and the Playwright MCP server in Claude Code, pointed at a DEDICATED Chrome profile, for example:
  `claude mcp add playwright -- npx @playwright/mcp@latest --user-data-dir ~/.job-hunt-browser`
- Optional: MacTeX or TeX Live (`pdflatex`) if you don't use Overleaf.

## 2. Your profile (stays local, git-ignored)
```
cp config/profile.example.json config/profile.json
cp config/search.example.json  config/search.json
cp config/targets.example.json config/targets.json
cp resume/summaries.example.md config/summaries.md
cp resume/template.tex         resume/base.tex
```
- `profile.json`: real answers only. Set `repo_dir`, `resume_pdf`, `overleaf.base_tex` to absolute paths. Set `auto_submit` to false if you want to approve each application.
- `search.json`: put YOUR skills in `skills` (regex: weight). Change `title_keep`/`title_drop`, years penalties, location mode, and `needs_sponsorship`.
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
