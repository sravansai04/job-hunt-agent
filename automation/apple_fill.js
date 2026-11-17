async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Apple jobs flow (signed in with your Apple ID). Put the job URL in localStorage.__apple_job_url on jobs.apple.com first.
  const url = await page.evaluate(() => localStorage.getItem('__apple_job_url'));
  if (!url) return { stop: 'no url' };
  await page.goto(url);
  await page.waitForTimeout(5000);
  const ap = page.getByRole('button', { name: /Apply Now/i }).first();
  if (await ap.count()) await ap.click();
  else
    await page
      .getByRole('link', { name: /Apply Now|Submit Resume/i })
      .first()
      .click();
  await page.waitForTimeout(6000);
  let t = await page.evaluate(() => document.body.innerText);
  if (/already (applied|submitted)/i.test(t)) return { stop: 'already applied' };
  // Step 1: resume
  if (/stepName=resume$/.test(page.url()) || /Add Resume\n\n/.test(t)) {
    const hasPdf = new RegExp(P.resume_filename_regex, 'i').test(t);
    if (hasPdf) {
      await page.getByRole('button', { name: 'Remove' }).first().click();
      await page.waitForTimeout(2500);
    }
    await page.locator('input[type=file]').first().setInputFiles(P.resume_pdf);
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: 'Submit', exact: true }).last().click();
    await page.waitForTimeout(6000);
  }
  // Step 2: profile (manual option is default)
  if (/stepName=resumeParsedinfo/.test(page.url()) && !(await page.locator('#profile-firstname').count())) {
    await page.getByRole('button', { name: 'Continue' }).last().click();
    await page.waitForTimeout(6000);
  }
  if (/stepName=resumeParsedinfo/.test(page.url())) {
    const setv = async (sel, v) => {
      const el = page.locator(sel);
      if ((await el.count()) && (await el.inputValue()) !== v) await el.fill(v);
    };
    await setv('#profile-field-line1', P.address.line1);
    await setv('#profile-field-city', P.address.city);
    await setv('#profile-field-zip', P.address.zip);
    const jobs = P.work_history.map((w) => [
      w.employer,
      w.title,
      w.current,
      w.start_month,
      w.start_year,
      w.end_month,
      w.end_year,
      w.description,
    ]);
    if (!(await page.locator('#parsedmodal-employer-0-suggestion-textbox').count())) {
      for (let n = 0; n < jobs.length; n++) {
        const [emp, title, cur, sm, sy, em, ey, desc] = jobs[n];
        await page.getByText('Add employment', { exact: true }).last().click();
        await page.waitForTimeout(1500);
        await page.locator(`#parsedmodal-employer-${n}-suggestion-textbox`).fill(emp);
        await page.waitForTimeout(900);
        await page.keyboard.press('Escape');
        await page.locator(`#parsedmodal-jobtitle-${n}`).fill(title);
        const rid = await page.evaluate(
          ([n, cur]) => {
            const r = [
              ...document.querySelectorAll(`input[type=radio][id^="parsedmodal-currentemployer-${cur ? 'yes' : 'no'}"]`),
            ];
            return r[n] ? r[n].id : null;
          },
          [n, cur],
        );
        if (rid)
          await page
            .locator(`label[for="${rid}"]`)
            .click()
            .catch(() => page.locator(`[id="${rid}"]`).check({ force: true }));
        await page.waitForTimeout(400);
        await page.locator(`#parsedmodal-startmonth-${n}`).selectOption({ label: sm });
        await page.locator(`#parsedmodal-startyear-${n}`).selectOption({ label: sy });
        if (em) {
          await page.locator(`#parsedmodal-endmonth-${n}`).selectOption({ label: em });
          await page.locator(`#parsedmodal-endyear-${n}`).selectOption({ label: ey });
        }
        await page.locator(`#parsedmodal-job-description-${n}`).fill(desc);
      }
    }
    if (!(await page.locator('#parsedmodal-school-0-suggestion-textbox').count())) {
      const edus = P.education.map((e) => [e.school, e.degree, e.major]);
      for (let n = 0; n < edus.length; n++) {
        await page.getByText('Add education', { exact: true }).last().click();
        await page.waitForTimeout(1500);
        const s = page.locator(`#parsedmodal-school-${n}-suggestion-textbox`);
        await s.pressSequentially(edus[n][0], { delay: 30 });
        await page.waitForTimeout(1600);
        const ex = page
          .locator('[role=option], li[id*=suggestion]')
          .filter({ hasText: new RegExp('^' + edus[n][0] + '$', 'i') })
          .first();
        if (await ex.count()) await ex.click();
        else await page.keyboard.press('Escape');
        const m = page.locator(`#parsedmodal-major-${n}-suggestion-textbox`);
        await m.pressSequentially(edus[n][2], { delay: 30 });
        await page.waitForTimeout(1600);
        const mx = page
          .locator('[role=option], li[id*=suggestion]')
          .filter({ hasText: new RegExp('^' + edus[n][2] + '$') })
          .first();
        if (await mx.count()) await mx.click();
        else await page.keyboard.press('Escape');
        await page.locator(`#parsedmodal-degree-${n}`).selectOption({ label: edus[n][1] });
        await page
          .locator(`label[for="parsedmodal-gradstatus-${n}-graduationStatus-YES"]`)
          .click()
          .catch(() => page.locator(`#parsedmodal-gradstatus-${n}-graduationStatus-YES`).check({ force: true }));
      }
    }
    await page.getByRole('button', { name: 'Continue' }).last().click();
    await page.waitForTimeout(6000);
  }
  // Step 3: questions
  // Apple's agency-worker question is the contractor fact; everything else goes through answerFor() as asked.
  const shapeQ = (q) => (/temporary agency worker/i.test(q) ? 'Have you worked here as a contract worker?' : q);
  const log = [];
  if (/stepName=questionnaire/.test(page.url())) {
    const groups = await page.evaluate(() => {
      const g = {};
      [...document.querySelectorAll('input[type=radio]')].forEach((r) => {
        const l = document.querySelector(`label[for="${r.id}"]`);
        let p = r,
          q = '';
        for (let i = 0; i < 8 && p; i++) {
          p = p.parentElement;
          const lg = p && p.querySelector('legend');
          if (lg) {
            q = lg.innerText.trim();
            break;
          }
        }
        (g[r.name] = g[r.name] || { q, opts: [] }).opts.push([r.id, l ? l.innerText.trim() : '']);
      });
      return g;
    });
    for (const k of Object.keys(groups)) {
      const { q, opts } = groups[k];
      const r = answerFor(shapeQ(q), P);
      if (!r || r.stop) return { stop: r ? r.stop : 'unknown question', q, log };
      const a = [q, ['Yes', 'No'].find((x) => r.pick.test(x))];
      const o = opts.find((o) => o[1] === a[1]);
      if (!o) return { stop: 'no matching option', q, log };
      await page
        .locator(`label[for="${o[0]}"]`)
        .click()
        .catch(() => page.locator(`[id="${o[0]}"]`).check({ force: true }));
      log.push(q.slice(0, 50) + ' => ' + a[1]);
    }
    const other = await page.evaluate(() =>
      [...document.querySelectorAll('textarea, select, input[type=text], input[type=checkbox]')]
        .filter((e) => e.offsetParent !== null && !/search/i.test(e.id))
        .map((e) => e.id),
    );
    if (other.length) return { stop: 'extra fields', other, log };
    await page.getByRole('button', { name: 'Continue' }).last().click();
    await page.waitForTimeout(7000);
  }
  if (!/stepName=reviewinfo/.test(page.url())) return { stop: 'not at review', url: page.url(), log };
  t = await page.evaluate(() => document.body.innerText);
  const i = t.indexOf('Review and Submit');
  const j = t.indexOf('Information Release');
  const r = t.slice(i, j);
  const checks = {
    addr: r.includes(P.address.line1) && r.includes(P.address.zip),
    resume: new RegExp(P.resume_filename_regex, 'i').test(r),
    job: r.includes(P.work_history[0].title),
    spons: new RegExp('sponsorship[^\\n]*\\n\\n' + (P.work_auth.needs_sponsorship ? 'Yes' : 'No')).test(r),
    auth: /legally authorized[^\n]*\n\n(Yes|No)/.test(r),
    vet: /veteran/i.test(r),
  };
  return { stop: 'REVIEW_READY', checks, log, title: (t.match(/submitted for ([^\n]*)/) || [])[1] };
}
