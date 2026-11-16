# Schedules

Claude Code session crons expire after 7 days and stop when the session ends, so the renewer recreates all of them every 5 days, itself included.
In a new session say: "Set up the job-hunt schedules from prompts/SCHEDULES.md". Claude replaces {{REPO_DIR}}, {{TRACKER_URL}} and {{COLLECTION}} from config/profile.json and creates each entry with CronCreate.

| id | cron (local time) | prompt file | notes |
|---|---|---|---|
| 1a | `0,30 8-21 * * 1-5` | keep_applying.md | weekday daytime, every 30 min on the hour and half hour |
| 1b | `0 23,2,5 * * *` | keep_applying.md | nights, every 3 h |
| 1c | `0 8,11,14,17,20 * * 0,6` | keep_applying.md | weekend daytime, every 3 h |
| 2 | `0 7 * * 1-5` | morning_scan.md | weekday morning scan |
| 3 | `30 7 * * *` | mail_check.md | daily inbox check |
| 4 | `0 6 */5 * *` | renew_schedules.md | keeps everything alive |

Times are on the hour or half hour so runs are easy to predict. Claude Code adds a fixed per-job delay (up to half the interval, max 30 min), so a 7:00 job may start a little after 7:00, never before. Change the times to fit your day. Fewer "keep applying" runs are fine: quality beats volume.
