# Job Hunt Agent

## Before you clone: checklist

**Must have**
- [ ] **A Mac** (macOS). Site passwords go in the macOS Keychain and resumes are read with `textutil`. On Linux only the job scanner works.
- [ ] **Claude Code** installed and signed in, on a paid Claude plan. Scheduled runs use a lot of usage every day, so a higher-usage plan helps.
- [ ] **Homebrew** ([brew.sh](https://brew.sh)). The installer uses it to add Python, Node and the Playwright browser if they're missing.
- [ ] **Git** (`xcode-select --install` if `git` isn't found).
- [ ] **A Gmail for the job search.** A dedicated one is best. Career-site accounts are created with it and verification codes are read from it.
- [ ] **Your resume** as a PDF, Word file or LaTeX file.
- [ ] **About 30 minutes** for the first-time setup interview.
- [ ] **A Mac that can stay awake and online** while the schedules run (plugged in, sleep off or `caffeinate`).

**Have these answers ready** (onboarding asks for them)
- [ ] Target job titles, levels, locations, remote/hybrid/on-site and relocation.
- [ ] Work authorization: do you need visa sponsorship **now**, and will you need it **later** (OPT, STEM OPT, H-4 EAD, green card)?
- [ ] Salary expectation and notice period or earliest start date.
- [ ] For each job and project: your exact role, the tech you used daily, team size and real numbers (scale, latency, users, money or time saved).
- [ ] Which skills you use daily, have used in production, only know conceptually, or have never used.
- [ ] Dream companies, companies to avoid (current employer, competitors).
- [ ] Contact details, LinkedIn/GitHub, a mailing address for forms, and optionally voluntary self-ID answers (each can be "decline to answer").
- [ ] Whether Claude may submit on its own or you approve each application, and whether it may tick terms and conditions, agree to arbitration, or type your name as an e-signature.

**Optional**
- [ ] **Overleaf account** (free), signed in with the job-search Gmail, to compile resumes. Without it you need a full LaTeX install (`./setup/install.sh --latex` installs MacTeX). A minimal TeX install lacks the packages the resume uses.
- [ ] **Claude mobile app** to follow progress and answer questions from your phone.
- [ ] **Apple ID** if you want to apply to Apple (you sign in yourself).

**You'll still do by hand:** signing in to Gmail and Overleaf (and again if a session expires), CAPTCHAs, 2FA codes, answers only you can give ("Why this company?"), and anything on LinkedIn (never automated).

Built for **US** job searches (location filters, work-authorization and EEO questions).

---

A Claude Code setup that runs a software-engineering job search end to end:

1. **Find jobs**: `scan/scan.py` reads ~70 companies' public career feeds (Greenhouse, Lever, Ashby, Workday, Amazon), drops roles that don't fit (level, location, no-sponsorship language), and scores the rest against your skills.
2. **Tailor every resume**: Claude edits your LaTeX resume per job description, using only facts you've confirmed and summaries you approved, then a critique subagent reviews it as a hiring manager and as an AI-writing detector before anything is sent.
3. **Apply**: Playwright scripts fill Workday, Greenhouse, Apple, Amazon, Microsoft, Tesla and Ashby forms from your profile, stop on any question they don't know, and hand CAPTCHAs/2FA back to you.
4. **Track**: a tracker page (Claude artifact) with stages, follow-ups and response rates; a daily inbox check updates it.
5. **Run on a schedule**: Claude Code crons apply in the background, scan each morning and check mail daily.

Everything personal (profile, resume, tracker URL, logs) lives in git-ignored files. The repo only holds code, templates and examples.

## Quick start (no setup by hand)
1. Install [Claude Code](https://claude.com/claude-code) and sign in.
2. `git clone <this repo> && cd job-hunt-agent && claude`
3. Say hi. Claude sees there's no profile yet and starts onboarding:
   - installs what's missing (Node, the Playwright browser, optional LaTeX)
   - asks for your resume (drop in a PDF or DOCX) and converts it to LaTeX
   - interviews you about your projects, skills, numbers and what you want next, asking follow-ups until it can tailor honestly
   - asks for every permission once (browser control, Keychain for site passwords, auto-submit or approve-each)
   - opens a separate browser so you can sign in to Gmail (and Overleaf), then creates career-site accounts and reads verification emails itself
   - publishes your private tracker, runs a first scan, does one application with you, and turns on the schedules

After that it runs on its own. It only stops for CAPTCHAs, 2FA codes and questions only you can answer.

### From your phone
Start Claude Code with `claude --remote-control "Job Hunt"` and keep the Mac awake. The session appears in the Claude mobile app, where you can see progress, answer questions and say "status" or "apply now". The tracker link works in any phone browser. CAPTCHAs still need the Mac.

Commands: `/onboard` (re-run setup), `/apply` (one pass now), `/status`.
Manual setup reference: [setup/SETUP.md](setup/SETUP.md).

## Use it responsibly
- **Only true answers.** The fillers type exactly what's in your profile into real applications.
- **Quality beats volume.** One tailored, honest application does better than ten generic ones. Recruiters discount AI-sounding text, so keep the critique step on. You choose the pace: `daily_cap` (for example 8, or null for no daily limit) and `per_run` (roles per run, or null for as many as qualify). Even with no daily limit, per-company limits, holds, the skills check, the critique step and the honesty rules still apply.
- **Site terms.** Automated form filling may break some career sites' terms of service and can get accounts flagged. You are responsible for how you use this. Never automate LinkedIn.
- **Review auto-submit.** `auto_submit: true` lets Claude submit without asking when every guardrail passes. It is false in the example; turn it on once you trust your config.
- **Legal steps are opt-in.** Terms and conditions, arbitration agreements and typing your name as an e-signature each need their own `consents` flag. Without it the filler stops and asks.

## Scope
- **macOS.** Site passwords live in the macOS Keychain and resumes are read with `textutil`. Scanning works on Linux; the rest needs those steps swapped for your own tools.
- **Gmail.** Career-site accounts use a job-search Gmail, and verification codes are read from it in the automated browser.
- **US jobs.** Location filters, work-authorization answers and EEO questions assume US applications.

## Supported sites
| Site | Find jobs | Fill the application |
|---|---|---|
| Workday | scanner (public JSON) | filler (`workday_fill.js`) |
| Greenhouse | scanner | filler (`greenhouse_fill.js`) |
| Ashby | scanner | filler (`ashby_fill.js`; OpenAI has `ashby_openai_fill.js`) |
| Amazon | scanner | filler (`amazon_fill.js`) |
| Apple | sweep | filler (`apple_fill.js`, after you sign in with your Apple ID) |
| Microsoft (Eightfold) | sweep | filler (`microsoft_fill.js`) |
| Tesla | sweep | filler (`tesla_fill.js`) |
| Walmart | by hand | filler (`walmart_fill.js`) |
| Lever, JazzHR | scanner | no filler: resume and drafted answers are prepared, you apply ("Ready: apply manually") |
| SmartRecruiters Easy Apply (ServiceNow, NBCUniversal) | sweep or by hand | filler (`smartrecruiters_fill.js`, two pages, never submits) |
| Oracle (JPMorgan, Goldman, Uber), iCIMS (Atlassian) | sweep or by hand | no filler: you apply with the prepared resume and answers |
| Meta, Google | by hand | no filler: you apply with the prepared resume and answers |
| LinkedIn | never | never (automating it breaks LinkedIn's terms) |

## Stop and uninstall
1. Delete the schedules: ask Claude "delete the job-hunt schedules" (or close the Claude Code session that runs them).
2. Remove the saved site passwords: list them with `security dump-keychain | grep '"jobhunt:'` and delete each with `security delete-generic-password -s jobhunt:<site>`.
3. Delete the automated browser profile (its logins and cookies): `rm -rf ~/.job-hunt-browser`.
4. Delete the tracker artifact: ask Claude "delete my job-hunt tracker artifact", or delete it from your artifacts gallery on claude.ai.
5. Optionally delete this folder (your profile, resume and logs are only here).

## Layout
```
config/      example configs (copy to *.json / *.md, which are git-ignored), rules.md
scan/        scan.py
automation/  form fillers + Overleaf compiler (render with setup/render.py); lib/answers.js holds every screening answer
resume/      template.tex, summaries example; your base.tex/jobs/upload stay local
tracker/     tracker.html
tests/       answers.test.js: real screening-question wordings and the answer each must get (node tests/answers.test.js)
prompts/     scheduled prompts + SCHEDULES.md
setup/       ONBOARDING.md (what Claude runs), install.sh, render.py, check_private.py, compile_resume.sh, hooks
.claude/     project permissions + slash commands; .mcp.json registers the Playwright browser
CLAUDE.md    instructions Claude reads every session
```
