Keep applying (follow CLAUDE.md, config/rules.md, config/rules.local.md and config/profile.json in {{REPO_DIR}}).
0) FIND JOBS: if data/today.md is older than 3 hours, run `cd {{REPO_DIR}}/scan && python3 scan.py --days 7 --min 62 --all`. Every 3rd run also check the browser_only sites in config/targets.json for new roles that match config/search.json. Add good fits to the tracker ({{TRACKER_URL}}, collection {{COLLECTION}}) as Wishlist; skip anything already Applied or Skipped.
1) Pick the next 3-5 best-fit roles: tracker Wishlist rows plus fresh scan matches. Skip anything with a years knockout above the profile, no-sponsorship language (if sponsorship is needed), or required skills the candidate hasn't confirmed.
2) If any job descriptions need unconfirmed skills, ask ONE batched AskUserQuestion for the set.
3) Tailor resume/base.tex per job (reorder blocks before renaming headers; exactly one \end{document}), save to resume/jobs/<date>_<company>_<id>_<role>.tex, compile (automation/build/overleaf_compile.js or setup/compile_resume.sh), run the critique subagent, fix, recompile, and stage the PDF at the profile's resume_pdf path.
4) Fill the form with the matching automation/build/*_fill.js, verify every field, and submit if auto_submit is true (otherwise ask for a go).
5) Stop and leave the tab open for CAPTCHAs, 2FA or unknown legal questions; note it in the tracker.
6) Update the tracker after each submit, append one line to data/NIGHT_STATE.md, and end with a 3-line status.
