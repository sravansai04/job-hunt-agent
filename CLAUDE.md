# Job Hunt Agent: instructions for Claude Code

You run a candidate's job search from this repo: find roles, tailor a resume per job, fill and submit applications, and keep a tracker.
Read these before doing anything, every session:
1. `config/rules.md` (guardrails) and `config/rules.local.md` if it exists (the candidate's own rules, confirmed skills, holds).
2. `config/profile.json` (facts and form answers). **If it is missing, or `data/onboarding.json` is not marked done, start (or resume) the onboarding in `setup/ONBOARDING.md` right away, whatever the user's first message was.** The candidate should never need to edit a file or run a command themselves.
3. `data/NIGHT_STATE.md` (log of past runs) if it exists.
4. `docs/SITE_NOTES.md` section for any site before you touch it. Add new lessons there when you learn them.

## Layout
- `scan/scan.py`: pulls postings from public ATS feeds (Greenhouse, Lever, Ashby, Workday, Amazon, JazzHR) listed in `config/targets.json`, filters and scores with `config/search.json`, writes `data/today.md` and `data/new_jobs.json`. Usage: `cd scan && python3 scan.py --days 7 --min 62 [--all]`.
- `automation/*.js`: Playwright form fillers (Workday, Greenhouse, Ashby, OpenAI-Ashby, Apple, Amazon, Microsoft, Tesla, Walmart) plus an Overleaf compiler. Every Yes/No screening answer comes from ONE shared module, `automation/lib/answers.js` (work authorization including "without sponsorship" wordings, legal statements, fixed facts from `profile.answers`, consents from `profile.consents`). Never hard-code an answer in a filler; add the rule there and the real wording to `tests/answers.test.js`, then run `node tests/answers.test.js`. The fillers contain `__PROFILE__` and `__ANSWERS__`; run `python3 setup/render.py` to build `automation/build/*.js`, then run a built file with the Playwright MCP tool `browser_run_code_unsafe` (filename=...). Fillers stop and return on any unknown question instead of guessing. Workday returns `REVIEW_READY`: verify every field on the review page yourself, then click Submit.
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
6. No filler for the site (Lever, JazzHR, SmartRecruiters, Oracle, iCIMS, Meta, Google, Uber, ...)? Don't fill it freehand. Tailor the resume, draft every answer through `answerFor` / `textAnswerFor`, set the tracker row to "Ready: apply manually" (resume path + drafted answers), and tell the candidate.

## Slash commands
- `/onboard`: first-time setup. `/apply`: one application pass now. `/status`: short status.

## Never
- Invent facts, push personal data to git, print passwords, enter an SSN, automate LinkedIn, contact anyone, or solve CAPTCHAs/2FA (hand them to the candidate).
