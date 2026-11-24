# Job Hunt Agent: instructions for Claude Code

You run a candidate's job search from this repo: find roles, tailor a resume per job, fill and submit applications, and keep a tracker.
Read these before doing anything, every session:
1. `config/rules.md` (guardrails) and `config/rules.local.md` if it exists (the candidate's own rules, confirmed skills, holds).
2. `config/profile.json` (facts and form answers). **If it is missing, or `data/onboarding.json` is not marked done, start (or resume) the onboarding in `setup/ONBOARDING.md` right away, whatever the user's first message was.** The candidate should never need to edit a file or run a command themselves.
3. `data/NIGHT_STATE.md` (log of past runs) if it exists.
4. `docs/SITE_NOTES.md` section for any site before you touch it. Add new lessons there when you learn them.

## Layout
- `scan/scan.py`: pulls postings from public ATS feeds (Greenhouse, Lever, Ashby, Workday, Amazon, JazzHR) listed in `config/targets.json`, filters and scores with `config/search.json`, writes `data/today.md` and `data/new_jobs.json`. Usage: `cd scan && python3 scan.py --days 7 --min 62 [--all]`.
- `automation/*.js`: Playwright form fillers (Workday, Greenhouse, Ashby, OpenAI-Ashby, SmartRecruiters, Apple, Amazon, Microsoft, Tesla, Walmart) plus an Overleaf compiler. Every Yes/No screening answer comes from ONE shared module, `automation/lib/answers.js` (work authorization including "without sponsorship" wordings, legal statements, fixed facts from `profile.answers`, consents from `profile.consents`). Never hard-code an answer in a filler; add the rule there and the real wording to `tests/answers.test.js`, then run `node tests/answers.test.js`. The fillers contain `__PROFILE__` and `__ANSWERS__`; run `python3 setup/render.py` to build `automation/build/*.js`, then run a built file with the Playwright MCP tool `browser_run_code_unsafe` (filename=...). Fillers stop and return on any unknown question instead of guessing. Workday returns `REVIEW_READY`: verify every field on the review page yourself, then click Submit.
- `scan/sweep.js`: big-company sweep (Microsoft, Apple, Tesla, Atlassian, ServiceNow, JPMorgan, Goldman, Meta) for sites with no ATS feed. Run `automation/build/sweep.js` every 3rd keep-applying run and compare ids with the tracker.
- `automation/workday_signin.js`, `automation/gmail_codes.js`: Workday sign-in via clipboard paste, and reading verification emails in a background tab.
- `resume/`: `base.tex` (the candidate's full resume, git-ignored), `jobs/` (tailored copies), `upload/` (the PDF that gets uploaded). Compile with `automation/build/overleaf_compile.js` (Overleaf) or `setup/compile_resume.sh` (local pdflatex).
- `config/summaries.md`: the only resume summaries you may use.
- `tracker/tracker.html`: the tracker page. Rows live in its artifact database, collection from `profile.tracker.collection`.
- `prompts/`: the scheduled prompts and `SCHEDULES.md`.

## Per-application loop
1. Read the full job description. Check knockouts: years, location, sponsorship language, required skills not confirmed.
2. Collect unconfirmed skills across the batch (~5 jobs) and ask the candidate once.
3. Copy `resume/base.tex` to `resume/jobs/<date>_<company>_<id>_<role>.tex`. Pick the closest summary, reorder project blocks for the role (reorder before renaming headers), swap at most 2 bullets, reorder skills. Exactly one `\end{document}`.
4. Compile, then spawn a critique subagent (hiring manager + AI-tone + fact check). Fix, recompile, check page count.
5. Copy the PDF to `profile.resume_pdf`, fill the form, verify every field, submit (if `auto_submit`), update the tracker, log one line in `data/NIGHT_STATE.md`.
6. No filler for the site (Lever, JazzHR, Oracle, iCIMS, Meta, Google, Uber, ...)? Don't fill it freehand. Tailor the resume, draft every answer through `answerFor` / `textAnswerFor`, set the tracker row to "Ready: apply manually" (resume path + drafted answers), and tell the candidate.

## Learning loop
This repo improves from what every candidate's sessions teach. Two parts:

**1. Learn inside this install, as it happens.** Whenever something surprises you (a site changed its form, a filler stopped on a new question wording, a selector broke, a workaround fixed it, a scan source died, a rule produced a bad result), fix it and write the lesson down right away, not at the end of the run:
- Site behavior → `docs/SITE_NOTES.md` under that site.
- A new screening-question wording → the rule in `automation/lib/answers.js` plus the real wording in `tests/answers.test.js`, then `node tests/answers.test.js`.
- Anything about this candidate (skills, holds, preferences) → `config/rules.local.md` only.
- Also append one dated line to `data/LEARNINGS.md` (git-ignored): `YYYY-MM-DD | site or area | what happened | what fixed it`. This is the raw log the share step reads.
Read `data/LEARNINGS.md` at the start of each session along with `data/NIGHT_STATE.md`, so a lesson learned once is not learned twice.

**2. Share it upstream every 14 days.** Upstream is `https://github.com/sravansai04/job-hunt-agent` (the original repo, even when this is a fork). `data/feedback.json` holds `{"share": "auto" | "off", "last_shared": "YYYY-MM-DD"}`, set once during onboarding (Phase 0), where the candidate opts in or out. No per-issue approval after that.
- When `share` is `"auto"` and 14+ days have passed since `last_shared` (or since onboarding finished), run `/share-learnings` at the end of the next run. Posting runs `gh issue create`, which Claude Code asks permission for: in a scheduled run with nobody there to approve it, write the draft to `data/learnings_issue.md`, note it in the status, and post it at the start of the next session where the candidate is present. If `share` is `"off"` or the file is missing, do nothing.
- Rules for the issue:
  - Only generic, reusable lessons: site and form behavior, broken or changed selectors, new question wordings, scanner sources that died or moved, filler bugs and fixes, rules that worked badly, and what the candidate wished the agent could do.
  - **Strip everything personal**: names, emails, phone numbers, addresses, ZIP codes, employers, schools, visa details, salary, EEO answers, resume content, tracker URLs, account names, job IDs and the list of companies applied to. Say "a Workday tenant" or "a fintech on Greenhouse" when the company itself isn't the lesson; a site name is fine when the lesson is about that site.
  - If local code fixes are worth sending, describe them and include the diff of tracked files only (`git diff origin/main -- automation scan docs tests`).
  - Before posting, grep the issue text for every value in `config/profile.json` (name, emails, phone, address, ZIP, employers, schools, links). Any match: remove it and grep again. If it still can't be cleaned, don't post; keep the draft in `data/learnings_issue.md` and mention it in the status.
  - Post with `gh issue create --repo sravansai04/job-hunt-agent --title "Learnings: <month year>" --label learnings --body-file data/learnings_issue.md` (drop `--label` if it fails). If `gh` is not signed in, skip posting, keep the draft, and add one status line: "Learnings draft ready: data/learnings_issue.md (sign in with `gh auth login` to auto-share)".
  - Set `last_shared` to today and put the issue link in the run's status and `data/NIGHT_STATE.md`.
- The candidate can say "stop sharing learnings" at any time: set `share` to `"off"`.

## Slash commands
- `/onboard`: first-time setup. `/apply`: one application pass now. `/status`: short status. `/share-learnings`: post a privacy-scrubbed issue of what this install learned to the upstream repo (also runs itself every 14 days if the candidate opted in).

## Never
- Invent facts, push personal data to git, print passwords, enter an SSN, automate LinkedIn, contact anyone, or solve CAPTCHAs/2FA (hand them to the candidate).
