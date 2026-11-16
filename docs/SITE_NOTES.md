# Site notes

What we learned applying on each site, from real runs. Read the section for a site before touching it, and add to this file when you learn something new (that is how the agent gets better).

## General (all sites)
- **One browser, many tabs.** Open work in background tabs (CDP `Target.createTarget {url, background: true}` + `ctx.waitForEvent('page')`) so the user's window doesn't jump to the front. Keep the window minimized. Close finished tabs.
- **Playwright `browser_run_code_unsafe` limits:** no `process`, no `require`, no reaching `localhost` servers from the sandbox, and `filename` must live under the workspace roots (put generated scripts in `automation/build/`, not /tmp).
- **Passing a password:** clipboard only (`security ... -w | tr -d '\n' | pbcopy`, focus field, `Meta+V`, check `value.length`, then `printf '' | pbcopy`). Never print it, never put it in a script.
- **Verification emails:** `automation/gmail_codes.js` reads them in a background tab. Opening a message marks it read.
- **A restart loses tabs.** After the Mac restarts, tabs that were waiting on the user (CAPTCHA, half-filled forms) are gone; re-open and re-fill them, and note it in the tracker.
- **Verify before submit.** Every filler stops at review. Read the review page back and compare each field with profile.json before clicking Submit.
- **Waiting on sign-in:** don't `waitForURL(/home/)`; sign-in URLs often contain the return path as a parameter and match too early. Wait for page text instead (Sign Out, Candidate Home).

## Workday (`*.myworkdayjobs.com`)
- Each company (tenant) needs its own account. Create it with the job-search email, store the password as `jobhunt:<company>-workday`, verify via the email link.
- Sign-in pages can have two password inputs (sign in + create account): target `input[autocomplete=current-password]` and the email field in the same form (`automation/workday_signin.js`).
- `workday_fill.js` walks: Autofill with Resume, My Information, My Experience, Application Questions, Voluntary Disclosures, Self Identify, Review. It stops on any unknown question; answer it (ask the user if it's personal or legal), then re-run.
- Conditional questions appear after an answer (for example a visa-type dropdown after "needs sponsorship = Yes"). Re-scan the page after each answer.
- Some tenants put an assessment step right before Review whose footer button is **Submit**: it submits the whole application. Upload the tailored resume on My Experience before reaching it.
- The scanner reads Workday via `/wday/cxs/<tenant>/<site>/jobs` (public JSON). Big tenants sometimes time out; retry next run.

## Oracle Candidate Experience (Goldman Sachs `higher.gs.com` apply flow, JPMorgan `jpmc.fa.oraclecloud.com`)
- Flow: enter email, accept the terms dialog (click **AGREE** first or Next times out), then a 6-box one-time PIN from email: click the first box and type all 6 digits.
- Answers from a previous application are prefilled. Verify each (`aria-pressed` on button-style answers, `inputValue` on text) instead of re-clicking, which can toggle them off.
- The last page has an e-signature field `input[name=fullName]`: type the full legal name exactly.
- JPMorgan shows an **hCaptcha** on submit: leave the tab open for the user.
- Listings: JPMorgan's `hcmRestApi/resources/latest/recruitingCEJobRequisitions` (see `scan/sweep.js`); the job description is in `ExternalDescriptionStr` on the detail call.

## Greenhouse (`job-boards.greenhouse.io`, `boards.greenhouse.io`)
- Most fields are react-select comboboxes: click, read the visible options, click the exact match (`greenhouse_fill.js`).
- The race question appears only after the Hispanic/Latino answer: second pass needed.
- Custom free-text questions vary per company: the filler lists them in `review`; draft answers from facts and, for personal ones, ask the user.

## SmartRecruiters (ServiceNow and others)
- Public API: `api.smartrecruiters.com/v1/companies/<Company>/postings` and `/postings/<id>` for the full ad.
- After "willing to relocate = Yes" a follow-up "relocate at your own expense?" radio appears and shifts the radio order: re-read the questions before answering.

## Ashby (`jobs.ashbyhq.com`)
- Location is an autocomplete: type slowly, wait for the suggestion, click the exact option.
- OpenAI's form ends with a personal certification checkbox ("I confirm I have read the above"): the user must tick it themselves.
- Some companies limit how many open applications you can have: check before using a slot.

## Apple (`jobs.apple.com`)
- Applying needs the user's own Apple ID sign-in (hand it back). Once signed in, `apple_fill.js` handles resume, profile, work history, education and questions.
- Listings come from the search page's `window.__staticRouterHydrationData` JSON (see `scan/sweep.js`).

## Microsoft (`apply.careers.microsoft.com`, Eightfold)
- Limit: about 10 active applications at a time. Check the candidate's dashboard before applying.
- `microsoft_fill.js` answers the generic min-qual radio only when the years asked are within the profile; others come back for review.
- Listings: `apply.careers.microsoft.com/api/pcsx/search`.

## Amazon (`amazon.jobs`)
- Uses an Amazon account the user may already have (their login, their verification). Limit of roughly 10 active applications.
- Screening dropdowns ask years for several buckets; answers come from `profile.amazon_years`.
- Public search JSON: `amazon.jobs/en/search.json` (used by the scanner).

## Tesla
- Listings: open tesla.com/careers in a tab and `fetch('/cua-api/apps/careers/state')` from the page (direct requests are blocked). No dates: higher ids are newer.
- Submit triggers an hCaptcha: leave it for the user (`tesla_fill.js` returns `CAPTCHA_WAITING`).

## Google
- Max 3 applications per rolling 30 days, no withdrawals. Spend slots only on the best fits. No public endpoint: check the careers page by hand.

## Meta
- Listings render client-side; `scan/sweep.js` scrapes job links, but Meta often shows nothing to automated browsers. Check by hand when it reports no links.

## Atlassian
- Listings: `atlassian.com/endpoint/careers/listings` (all roles, all countries: filter for US/Americas).
- Applications go through iCIMS and often show a CAPTCHA: leave it for the user.

## Uber
- The old `loadSearchJobsResults` endpoint is gone (404). Check the careers page by hand.

## Overleaf
- `overleaf_compile.js` replaces the editor content through CodeMirror (`.cm-content` → `cmView.view.dispatch`), recompiles, downloads `output.pdf`, then restores the base resume so the project always holds the base version.
- Check the PDF afterwards: page count, and metadata (Creator LaTeX/pdfTeX, author = candidate). No AI tool names anywhere.
