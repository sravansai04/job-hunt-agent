# Changelog

Newest first. One plain-language line per change: what users will notice, not how it was built.
Claude reads the entries newer than the version a user has and tells them in one line after an update.
`[action]` marks a change the user has to act on (a new question, a new setting, a new login).

## 2026-11-24
- Automatic updates: Claude checks this repo for new versions, updates safely and tells you what changed. You choose at setup: update automatically, ask first, or never. [action] Existing installs are asked once at the next session.
- Learning loop: Claude logs what it learns about sites and forms on your machine. If you opt in, it shares a privacy-scrubbed summary with the project every 2 weeks as a GitHub issue. [action] Existing installs are asked once at the next session.
- README checklist of what to have ready before cloning.
- Uber: notes for applying through Uber's Oracle portal (terms dialog, 6-box code, Yes/No buttons, dropdowns).
- If the browser loses its Gmail or Overleaf sign-in, Claude now stops and asks you to sign in again instead of retrying.
- MIT license.

## 2026-11-23
- SmartRecruiters Easy Apply filler (ServiceNow, NBCUniversal and others): fills both pages, never clicks Submit.
- Meta sweep fixed after Meta changed its job-search page.
- Company tier bonus is now a setting (`tier_bonus` in search.json).

## 2026-11-17
- Your job titles and search terms come only from your own answers (works beyond software roles).
- Optional daily application limit and roles-per-run setting.
- Separate "sponsorship now" and "sponsorship later" answers (OPT, STEM OPT, H-4 EAD).
- One shared module answers every Yes/No screening question, with tests. Legal steps (terms, arbitration, e-signature) each need your consent.
- Walmart and Ashby fillers.

## 2026-11-15
- First public version: scanner, form fillers (Workday, Greenhouse, Apple, Amazon, Microsoft, Tesla), resume tailoring with critique, tracker page, schedules.
- Guided onboarding: Claude installs everything and interviews you.
- Tracker redesign: overview, board, searchable table, KPI trends.
- Runs close the browser when done unless a tab is waiting on you.
