# Job Hunt Agent

A Claude Code setup that runs a software-engineering job search end to end:

1. **Find jobs**: `scan/scan.py` reads ~70 companies' public career feeds (Greenhouse, Lever, Ashby, Workday, Amazon), drops roles that don't fit (level, location, no-sponsorship language), and scores the rest against your skills.
2. **Tailor every resume**: Claude edits your LaTeX resume per job description, using only facts you've confirmed and summaries you approved, then a critique subagent reviews it as a hiring manager and as an AI-writing detector before anything is sent.
3. **Apply**: Playwright scripts fill Workday, Greenhouse, Apple, Amazon, Microsoft, Tesla and Ashby forms from your profile, stop on any question they don't know, and hand CAPTCHAs/2FA back to you.
4. **Track**: a tracker page (Claude artifact) with stages, follow-ups and response rates; a daily inbox check updates it.
5. **Run on a schedule**: Claude Code crons apply in the background, scan each morning and check mail daily.

Everything personal (profile, resume, tracker URL, logs) lives in git-ignored files. The repo only holds code, templates and examples.

## Quick start
See [setup/SETUP.md](setup/SETUP.md). Then open Claude Code in this folder and say "Keep applying" or run the prompt in `prompts/keep_applying.md`.

## Use it responsibly
- **Only true answers.** The fillers type exactly what's in your profile into real applications.
- **Quality beats volume.** One tailored, honest application does better than ten generic ones. Recruiters discount AI-sounding text, so keep the critique step on.
- **Site terms.** Automated form filling may break some career sites' terms of service and can get accounts flagged. You are responsible for how you use this. Never automate LinkedIn.
- **Review auto-submit.** `auto_submit: true` lets Claude submit without asking when every guardrail passes. Set it to false until you trust your config.

## Layout
```
config/      example configs (copy to *.json / *.md, which are git-ignored), rules.md
scan/        scan.py
automation/  form fillers + Overleaf compiler (render with setup/render.py)
resume/      template.tex, summaries example; your base.tex/jobs/upload stay local
tracker/     tracker.html
prompts/     scheduled prompts + SCHEDULES.md
setup/       SETUP.md, render.py, check_private.py, compile_resume.sh, git hooks
CLAUDE.md    instructions Claude reads every session
```
