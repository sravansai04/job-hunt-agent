# Onboarding (Claude runs this; the candidate only answers questions)

Goal: from a fresh clone to a running job search, with the candidate doing nothing technical.
Rules while onboarding:
- Do every technical step yourself (install, copy files, convert the resume, write configs, publish the tracker, create schedules).
- Ask with AskUserQuestion in batches of up to 4 questions. Offer sensible options plus "Other". Never ask for something you can read from their resume.
- Record progress in `data/onboarding.json` (`{"phase": n, "done": [...]}`) after each phase, so a restart resumes where it stopped.
- Never ask for or store passwords in files. Never ask for SSN or bank details.
- Explain each permission prompt in one line before it appears ("Next you'll see a prompt to let me run the scanner; choose 'Yes, and don't ask again'").

## Phase 0: welcome and permissions (once)
1. Say in 4-5 lines what will happen: install tools, read your resume, ask about your experience, set up a browser for applications, start the search. About 20-30 minutes, then it runs on its own.
2. Explain the permissions you'll ask for once, so later runs are hands-off:
   - Running the scanner, installer and resume compiler (`.claude/settings.json` pre-approves these for this folder).
   - Controlling a separate Chrome window (Playwright) for job sites and Gmail. It uses its own profile in `~/.job-hunt-browser`, not their normal Chrome.
   - Saving generated career-site passwords in the macOS Keychain under `jobhunt:<site>`.
   - Submitting applications on their behalf when every guardrail passes (ask: auto-submit, or approve each one?). Save the answer as `auto_submit`.
   - Legal steps the fillers would take in their name. Ask about EACH one separately, show a real example, and save the answer in `profile.consents` (false = the filler stops and asks every time):
     - `terms_and_conditions`: ticking a site's terms, disclaimers or candidate code of conduct (Workday, Microsoft, Tesla).
     - `arbitration`: agreeing to an arbitration agreement (Tesla, OpenAI). This waives the right to sue in court for some claims.
     - `e_signature`: typing their legal name as an electronic signature (Tesla acknowledgment, Workday disability self-ID).
   - Yes/No facts typed on every form (non-compete, worked here before, relatives at the company, background check, SMS, ...). Go through `profile.answers` one by one; leave a value null if the answer depends on the company.
   - Sharing lessons with the project: every 2 weeks, post a GitHub issue to the upstream repo with what this install learned (site changes, new question wordings, broken selectors, what they wished it could do), with all personal data stripped and checked before posting. It posts from their GitHub account (`gh auth login`, skip if they don't want it). Ask once: "Share automatically" / "Don't share". Save `data/feedback.json` as `{"share": "auto" or "off", "last_shared": "<today>"}`.
   Ask them to approve the project MCP server and settings if Claude Code prompts.
3. Run `./setup/install.sh`. Fix anything missing yourself (Homebrew, Node). Ask only if a system password prompt is needed, and let them type it.

## Phase 1: resume
1. Ask them to drag their resume file (PDF, DOCX or .tex) into the chat, or paste the path or text.
2. Read it (PDF: Read tool; DOCX: `textutil -convert txt`; .tex: as is). Copy it to `resume/original/` (git-ignored via resume/).
3. Build `resume/base.tex` from `resume/template.tex`: their real header, every job, every project block, skills, education, publications. Keep their wording; don't add anything. Compile it and show them the PDF. Ask: "Anything wrong or missing?"

## Phase 2: experience deep-dive (this is what makes tailoring good)
Ask in batches, skipping anything the resume already answers:
1. For each job/project on the resume: team size, their exact role, the tech used day to day, the hardest problem, any numbers (scale, latency, users, money, time saved). Which claims would they be comfortable defending in an interview?
2. Projects or work NOT on the resume (side projects, internal tools, open source).
3. Skills inventory. Show the skills found in the resume plus the 30 most common skills in their target roles, and ask for each: use daily / used in production / know the concepts only / never. Store this in `config/rules.local.md` under "Confirmed skills" and "NOT confirmed". Concept-only skills are never claimed as hands-on.
4. Phrasing check: for anything ambiguous (for example "deployed to Kubernetes" when a platform team runs deploys), ask how they'd describe it and save the honest wording.

## Phase 3: what they want
1. Job titles, levels and search terms come only from the candidate. Never assume software engineering.
   - Ask (AskUserQuestion) their target job titles: a multi-select of common families (software engineer, data analyst, data engineer, data scientist, product manager, designer, QA/test, DevOps/SRE, IT support, business analyst, ...) plus Other for their own words. Then their levels: intern, new grad, junior, mid, senior, staff+. Then title words to exclude, and roles to avoid.
   - Build `title_keep`, `title_drop`, `title_bonus`, `search_terms`, the Amazon `queries` in `targets.json` and `amazon_require_level` from those answers only. Derive `years_penalty` and `stretch_years` from their years of experience. `config/search.example.json` is an example preset for a mid-level software engineer, not a default.
   - Before saving, explain the result in plain language ("I'll search for X and Y, keep titles with ..., drop titles with ..."), then save it as a draft `config/search.json` and do a quick check on real postings: pull titles from a few feeds in `targets.json` (one short Python snippet against the Greenhouse/Workday endpoints `scan/scan.py` uses), apply `title_keep`/`title_drop`, and show 10 real titles that would be KEPT and 10 that would be DROPPED. Ask them to confirm or adjust, and repeat until they confirm.
2. Locations: cities, remote, relocation, on-site/hybrid OK.
3. Work authorization: authorized in which country, a one-sentence explanation for forms, visa type. Ask the two sponsorship questions separately:
   - `work_auth.sponsorship_now`: "Do you need an employer to sponsor you to start this job?"
   - `work_auth.sponsorship_future`: "Will you need sponsorship later?" (OPT or STEM OPT ending, H-4 EAD, a green card).
   Someone on OPT is usually No now and Yes later.
4. Salary expectation and notice period / earliest start.
5. Dream companies, companies to avoid (current employer, competitors), any per-company holds.
6. Auto-submit or approve each application? Then the daily limit (AskUserQuestion with options 5 / 8 (Recommended) / 15 / No daily limit), saved as `daily_cap` (a number, or null for no daily limit). Explain in one line: per-company limits still apply, and Claude usage limits and account flags are the real ceiling. Then ask `per_run`, roles per keep-applying run, the same way (options 3 / 5 (Recommended) / 10 / As many as qualify = null).
Write `config/profile.json`, `config/search.json` (from step 1, plus skills -> weights from Phase 2 and location filters) and trim `config/targets.json` to relevant companies (add their dream companies if they have a public ATS feed).

## Phase 4: form answers
1. Contact details (from the resume; confirm), legal name, preferred name, address for forms, LinkedIn/GitHub/website.
2. Voluntary self-ID (gender, race/ethnicity, veteran, disability): explain it's optional and offer "decline to answer" for each.
3. Standard questions: previously worked at the company (default No), relatives at the company, non-compete, government official, age 18+.
4. Short "evidence of excellence" paragraph: draft from Phase 2 facts, then ask them to edit or approve.
Update `config/profile.json`, then run `python3 setup/render.py`.

## Phase 5: summaries
Draft 3-5 summaries (one per role type they target) from Phase 2 facts only. Run the critique subagent on them. Show them and ask which to keep or change. Save the approved ones to `config/summaries.md`.

## Phase 6: browser and accounts
1. Open the Playwright browser (any `browser_navigate`) and go to https://mail.google.com. Ask them to sign in to the email they want employers to use (recommend a dedicated job-search Gmail). Wait, then confirm the inbox loads.
2. Optional: Overleaf. Navigate to overleaf.com, let them sign in with Google, create a blank project yourself, save its URL in `profile.overleaf.project_url`. If they skip it, use `setup/compile_resume.sh` (run `./setup/install.sh --latex` first).
3. Explain: for each new career site you'll create the account with that email, generate a strong password, store it in the Keychain, and read verification emails from Gmail yourself. They will only be asked for CAPTCHAs and 2FA codes.
4. Sites needing their personal login (for example Apple ID, Amazon if they already have an account): note them in `config/rules.local.md`.

## Phase 7: tracker
Publish `tracker/tracker.html` as an artifact (db capability, owner read/write rule, user capability). Save the URL to `profile.tracker.url`. Tell them it's private and works on their phone.

## Phase 8: phone access
Tell them how to follow and steer the search from their phone:
1. Install the Claude app (iOS/Android) and sign in with the same account.
2. Keep this Mac awake and Claude Code running in this folder, started with remote control: `claude --remote-control "Job Hunt"`. The session then shows up in the Claude app, where they can read progress, answer questions (skills, CAPTCHAs waiting, approvals) and type commands like "status" or "apply now".
3. The tracker link opens in any phone browser. Daily summaries and new-job picks are sent to the session (and to the phone as notifications when Remote Control is on).
4. CAPTCHAs and 2FA still need the Mac's browser window, so a pending CAPTCHA waits until they're at the computer (it's noted in the tracker).
Offer to restart now with remote control if they want it.

## Phase 9: first run and schedules
1. Run the scan (`cd scan && python3 scan.py --days 7 --min 60 --all`), show the top 10 matches, and ask if the mix looks right. Adjust `search.json` weights/filters from their feedback and re-run once.
2. Do one full application together, end to end, showing each step, with explicit approval to submit even if auto-submit is on.
3. Create the schedules from `prompts/SCHEDULES.md` (ask whether the default times suit them).
4. Mark onboarding done in `data/onboarding.json`, and finish with: what runs when, what will need them, how to check status (`/status`), how to pause ("stop applying"), and, if they opted in, that a privacy-scrubbed learnings issue goes to the project every 2 weeks ("stop sharing learnings" turns it off).
