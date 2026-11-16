# Schedules

Claude Code session crons expire after 7 days and stop when the session ends, so the renewer recreates all of them every 5 days, itself included.
In a new session say: "Set up the job-hunt schedules from prompts/SCHEDULES.md". Claude replaces {{REPO_DIR}}, {{TRACKER_URL}} and {{COLLECTION}} from config/profile.json and creates each entry with CronCreate.

| id | cron (local time) | prompt file | notes |
|---|---|---|---|
| 1a | `23,53 8-21 * * 1-5` | keep_applying.md | weekday daytime, every 30 min |
| 1b | `23 23,2,5 * * *` | keep_applying.md | nights, every 3 h |
| 1c | `23 8,11,14,17,20 * * 0,6` | keep_applying.md | weekend daytime, every 3 h |
| 2 | `47 6 * * 1-5` | morning_scan.md | weekday morning scan |
| 3 | `12 7 * * *` | mail_check.md | daily inbox check |
| 4 | `5 6 */5 * *` | renew_schedules.md | keeps everything alive |

Change the times to fit your day. Fewer "keep applying" runs are fine: quality beats volume.
