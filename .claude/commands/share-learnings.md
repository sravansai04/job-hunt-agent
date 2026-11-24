---
description: Post a privacy-scrubbed GitHub issue of what this install has learned to the upstream repo.
---
Follow "Learning loop", part 2, in CLAUDE.md. If data/feedback.json has share "off" and the candidate did not type this command themselves, stop.
1. Read data/LEARNINGS.md, data/NIGHT_STATE.md (since last_shared) and `git diff origin/main -- automation scan docs tests`.
2. Write the issue to data/learnings_issue.md using the sections in .github/ISSUE_TEMPLATE/learnings.md. Generic lessons only: no names, emails, phones, addresses, employers, schools, visa details, salary, EEO answers, resume content, tracker URLs, account names, job IDs or the list of companies applied to. Skip the issue entirely if there is nothing new worth sharing.
3. Grep it for every value in config/profile.json (name, emails, phone, address, ZIP, employers, schools, links). Remove any match and grep again; if it can't be cleaned, don't post.
4. Post: `gh issue create --repo sravansai04/job-hunt-agent --title "Learnings: <month year>" --label learnings --body-file data/learnings_issue.md`. If gh is not signed in, keep the draft and say so in the status.
5. Set data/feedback.json last_shared to today and report the issue link.
