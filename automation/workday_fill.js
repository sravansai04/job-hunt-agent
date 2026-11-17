async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Generic Workday filler. Stops (returns) on unknown required questions so a human can answer them.
  const log = [];
  const head = async () =>
    ((await page.evaluate(() => document.body.innerText)).match(/current step \d of \d\n[^\n]*/) || [''])[0].split('\n')[1] || '';
  const errs = async () => {
    const t = await page.evaluate(() => document.body.innerText);
    return t.includes('Errors Found') ? t.slice(t.indexOf('Errors Found'), t.indexOf('Errors Found') + 300) : '';
  };
  const next = async () => {
    await page.locator('[data-automation-id=pageFooterNextButton]').click();
    await page.waitForTimeout(8000);
  };
  const clickOpt = async (re) => {
    const b = await page.evaluate((src) => {
      const r = new RegExp(src, 'i');
      return [...document.querySelectorAll('[role=option]')]
        .filter((x) => x.offsetParent !== null && r.test(x.innerText.trim()))
        .map((x) => {
          const q = x.getBoundingClientRect();
          return [q.x + q.width / 2, q.y + q.height / 2];
        });
    }, re.source);
    if (!b.length) return false;
    await page.mouse.click(b[0][0], b[0][1]);
    await page.waitForTimeout(700);
    return true;
  };
  const btnPick = async (sel, re) => {
    const b = page.locator(sel).first();
    if (!(await b.count())) return 'missing';
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await page.waitForTimeout(800);
    const ok = await clickOpt(re);
    if (!ok) await page.keyboard.press('Escape');
    return (await b.innerText()).trim();
  };
  const fillId = async (id, v) => {
    const t = page.locator(`[id="${id}"]`);
    if (!(await t.count())) return;
    const cur = await t.inputValue();
    if (cur === v) return;
    await t.scrollIntoViewIfNeeded();
    await t.click();
    await t.fill('');
    await t.pressSequentially(v, { delay: 15 });
    await page.keyboard.press('Tab');
  };
  // Q&A rules (label regex -> answer regex)
  // Site-specific rules only. Work auth, legal statements and fixed facts come from answerFor() (automation/lib/answers.js).
  const rules = [
    ...Object.entries(P.workday_experience_bands || {})
      .filter(([k]) => k !== '_doc')
      .map(([k, v]) => [new RegExp('experience you have working with (' + k + ')', 'i'), new RegExp(v)]),
    [/how many years of (relevant |professional )?(work )?experience/i, new RegExp(P.years_answer_regex)],
  ];
  const textRules = [
    [
      /details on your (required )?sponsorship|explain.*sponsorship|sponsorship (details|required)/i,
      P.work_auth.sponsorship_details,
    ],
    [/salary|compensation|pay expectation/i, P.salary_text],
    [/notice period|start date|available to start|availability/i, P.notice_long],
    [/visa status|current (immigration|work authorization) status/i, P.work_auth.visa_status_text],
    [/city/i, P.address.city],
    [/state|province/i, P.address.state],
    [/location preference|preferred (office|location|geographic location)/i, P.location_preference],
    [/linkedin/i, P.links.linkedin],
    [/hear about/i, P.how_heard],
  ];
  const doQuestions = async () => {
    const qs = await page.evaluate(() =>
      [...document.querySelectorAll('[id^=primaryQuestionnaire], [id^=secondaryQuestionnaire]')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => {
          let b = e,
            lab = '';
          for (let i = 0; i < 8; i++) {
            b = b.parentElement;
            const l = b && b.querySelector('label, legend');
            if (l && l.innerText.trim().length > 3) {
              lab = l.innerText.trim();
              break;
            }
          }
          return [e.id, e.tagName, lab];
        }),
    );
    for (const [id, tag, label] of qs) {
      if (!['BUTTON', 'TEXTAREA', 'INPUT'].includes(tag)) continue;
      if (/date/i.test(id) && !/dateSection/.test(id)) {
        continue;
      }
      if (/dateSection/.test(id)) {
        if (/Month-input$/.test(id) && !(await page.locator(`[id="${id}"]`).inputValue())) {
          await page.evaluate((i) => {
            const e = document.getElementById(i);
            e.scrollIntoView({ block: 'center' });
            e.focus();
          }, id);
          const d = new Date();
          await page.keyboard.type(String(d.getMonth() + 1).padStart(2, '0'), { delay: 80 });
          await page.keyboard.type(String(d.getDate()).padStart(2, '0'), { delay: 80 });
          await page.keyboard.type(String(d.getFullYear()), { delay: 80 });
          await page.keyboard.press('Tab');
        }
        continue;
      }
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        const tr = textRules.find((r) => r[0].test(label));
        if (!tr) return { stop: 'unknown text question', label, log };
        const t = page.locator(`[id="${id}"]`);
        if (!(await t.inputValue())) await t.fill(tr[1]);
        log.push('T ' + label.slice(0, 40));
        continue;
      }
      {
        const cur = (
          await page
            .locator(`[id="${id}"]`)
            .innerText()
            .catch(() => '')
        ).trim();
        if (cur && !/^Select One/i.test(cur)) {
          log.push('KEEP ' + label.slice(0, 40) + ' => ' + cur);
          continue;
        }
      }
      const shared = answerFor(label, P);
      if (shared && shared.stop) return { stop: shared.stop, label, log };
      const rule = shared ? [null, shared.pick] : rules.find((r) => r[0].test(label));
      if (!rule) return { stop: 'unknown question', label, log };
      const got = await btnPick(`[id="${id}"]`, rule[1]);
      log.push(label.slice(0, 45) + ' => ' + got);
      if (/Select One/i.test(got)) return { stop: 'could not answer', label, log };
    }
    return null;
  };
  for (let guard = 0; guard < 10; guard++) {
    const h = await head();
    log.push('STEP ' + h);
    if (/Autofill with Resume/.test(h)) {
      const hasFile = await page.evaluate(() =>
        new RegExp('Successfully Uploaded|' + P.resume_filename_regex).test(document.body.innerText),
      );
      if (!hasFile) {
        await page.locator('input[type=file]').first().setInputFiles(P.resume_pdf);
        await page.waitForTimeout(9000);
      }
      await page.locator('[data-automation-id=pageFooterNextButton], button:has-text("Continue")').first().click();
      await page.waitForTimeout(8000);
      continue;
    }
    if (/My Information/.test(h)) {
      for (const [id, v] of [
        ['name--legalName--firstName', P.name.first],
        ['name--legalName--lastName', P.name.last],
        ['address--addressLine1', P.address.line1],
        ['address--city', P.address.city],
        ['address--postalCode', P.address.zip],
        ['phoneNumber--phoneNumber', P.phone.digits],
      ])
        await fillId(id, v);
      {
        const st0 = page.locator('[id="address--countryRegion"]');
        if ((await st0.count()) && !(await st0.innerText()).includes(P.address.state)) {
          await st0.scrollIntoViewIfNeeded();
          await st0.click();
          await page.waitForTimeout(800);
          await page.keyboard.type(P.address.state, { delay: 60 });
          await page.waitForTimeout(1200);
          if (!(await clickOpt(new RegExp('^' + P.address.state + '$')))) await page.keyboard.press('Enter');
          await page.waitForTimeout(600);
        }
      }
      const st = page.locator('[id="address--countryRegion"]');
      if ((await st.count()) && !(await st.innerText()).includes(P.address.state))
        log.push('state ' + (await btnPick('[id="address--countryRegion"]', new RegExp('^' + P.address.state + '$'))));
      const pt = page.locator('[id="phoneNumber--phoneType"]');
      if ((await pt.count()) && !/Mobile|Cellular/.test(await pt.innerText()))
        log.push('phone ' + (await btnPick('[id="phoneNumber--phoneType"]', /Mobile|Cellular/)));
      // "Have you previously worked for us?" radio: answer from profile.answers.previously_employed_here
      {
        const pw = answerFor('Have you previously worked for this company?', P);
        if (pw.stop) return { stop: pw.stop, label: 'previously worked here', log };
        const radios = await page.evaluate(() =>
          [...document.querySelectorAll('input[type=radio]')]
            .filter((e) => e.offsetParent !== null)
            .map((e) => {
              const l = document.querySelector(`label[for="${e.id}"]`);
              return [e.id, l ? l.innerText.trim() : '', e.checked];
            }),
        );
        const want = radios.find((r) => pw.pick.test(r[1]));
        if (want && !want[2]) await page.locator(`label[for="${want[0]}"]`).click();
      }
      // source
      const srcTxt = await page.evaluate(
        () => (document.body.innerText.match(/How Did You Hear About Us\?\*?\n([^\n]*)/) || [])[1] || '',
      );
      if (/^0 items|^Select One/i.test(srcTxt) || !srcTxt) {
        const s = page.locator('[id^="source--source"]').first();
        if (await s.count()) {
          await s.click();
          await page.waitForTimeout(1000);
          let done = false;
          for (const re of [/careers? (site|website)|company website|corporate website|website/i, /career|website/i]) {
            if (await clickOpt(re)) {
              await page.waitForTimeout(1000);
              await clickOpt(/career|website|site/i);
              done = true;
              break;
            }
          }
          if (!done) {
            for (const re of [/direct|company|corporate|external career/i]) {
              if (await clickOpt(re)) {
                await page.waitForTimeout(1200);
                await clickOpt(/career|website|site/i);
                break;
              }
            }
          }
          await page.keyboard.press('Escape');
        }
      }
      {
        const cur = await page.evaluate(
          () => (document.body.innerText.match(/How Did You Hear About Us\?\*?\n([^\n]*)/) || [])[1] || '',
        );
        if (/^0 items|^Select One|^Expanded/i.test(cur) || !cur) {
          const s = page.locator('[id^="source--source"]').first();
          if (await s.count()) {
            await s.fill('Career');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
            const pos = await page.evaluate(() => {
              const xs = [...document.querySelectorAll('[role=option]')].filter(
                (x) =>
                  x.offsetParent !== null &&
                  /career/i.test(x.innerText) &&
                  !/\+\d/.test(x.innerText) &&
                  !/event|women|graduate|university|fair|conference|diversity/i.test(x.innerText),
              );
              const x = xs[xs.length - 1];
              if (!x) return null;
              const q = x.getBoundingClientRect();
              return [q.x + q.width / 2, q.y + q.height / 2];
            });
            if (pos) {
              await page.mouse.click(pos[0], pos[1]);
              await page.waitForTimeout(1000);
            }
            await page.keyboard.press('Escape');
          }
        }
      }
      log.push(
        'source=' +
          (await page.evaluate(() => (document.body.innerText.match(/How Did You Hear About Us\?\*?\n([^\n]*)/) || [])[1] || '')),
      );
      await next();
      const e = await errs();
      if (e) return { stop: 'myinfo', e, log };
      continue;
    }
    if (/My Experience/.test(h)) {
      // Match each parsed job/degree to the profile by its own company/title/school text. Workday's resume parse
      // does not always keep the profile's order, so filling by position can put a description on the wrong job.
      const norm = (x) =>
        String(x || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      const near = (a, b) => {
        a = norm(a);
        b = norm(b);
        return !!a && !!b && (a.includes(b) || b.includes(a));
      };
      const jobs = await page.evaluate(() =>
        [...document.querySelectorAll('textarea[id^=workExperience]')].map((e) => {
          const pre = e.id.split('--')[0];
          const v = (k) => {
            const x = document.querySelector(`[id="${pre}--${k}"]`);
            return x ? x.value : '';
          };
          return [e.id, v('companyName'), v('jobTitle')];
        }),
      );
      for (const [id, co, title] of jobs) {
        const w =
          P.work_history.find((w) => near(w.employer, co) && near(w.title, title)) ||
          (P.work_history.filter((w) => near(w.employer, co)).length === 1
            ? P.work_history.find((w) => near(w.employer, co))
            : null);
        if (!w)
          return { stop: 'work history entry not in profile; fill the description yourself', label: co + ' / ' + title, log };
        const t = page.locator(`[id="${id}"]`);
        await t.click();
        await t.fill(w.description);
        await page.keyboard.press('Tab');
        log.push('desc -> ' + co + ' / ' + title);
      }
      const degs = await page.evaluate(() =>
        [...document.querySelectorAll('button[id$="--degree"]')].map((e) => {
          const pre = e.id.split('--')[0];
          const s = document.querySelector(`[id="${pre}--schoolName"], [id^="${pre}--school"]`);
          return [e.id, e.innerText.trim(), s ? s.value || s.innerText : ''];
        }),
      );
      for (let i = 0; i < degs.length; i++) {
        if (!/^Select One/i.test(degs[i][1])) continue;
        const ed = P.education.find((e) => near(e.school, degs[i][2]));
        if (!ed) return { stop: 'education entry not matched to profile school', label: degs[i][2], log };
        const want = new RegExp(ed.degree_regex, 'i');
        await page.locator(`[id="${degs[i][0]}"]`).scrollIntoViewIfNeeded();
        await page.locator(`[id="${degs[i][0]}"]`).focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        if (!(await clickOpt(want))) await page.keyboard.press('Escape');
      }
      {
        const del = page.locator('[data-automation-id=delete-file]');
        const fi = page.locator('[data-automation-id=file-upload-input-ref], input[type=file]').first();
        if (await fi.count()) {
          while (await del.count()) {
            await del.first().click();
            await page.waitForTimeout(1500);
          }
          await fi.setInputFiles(P.resume_pdf);
          await page.waitForTimeout(8000);
          log.push('resume replaced');
        }
      }
      const li = page.locator('[id="socialNetworkAccounts--linkedInAccount"]');
      if (await li.count()) await li.fill(P.links.linkedin);
      if (await page.locator('[id^=primaryQuestionnaire], [id^=secondaryQuestionnaire]').count()) {
        const r = await doQuestions();
        if (r) return r;
      }
      await next();
      const e = await errs();
      if (e) return { stop: 'experience', e, log };
      continue;
    }
    if (/Application Questions|Questionnaire|Additional Information/.test(h)) {
      const r = await doQuestions();
      if (r) return r;
      await next();
      const e = await errs();
      if (e) return { stop: 'questions', e, log };
      continue;
    }
    if (/Voluntary Disclosures/.test(h)) {
      for (const [sel, re] of [
        ['[id="personalInfoUS--gender"]', new RegExp(P.eeo.gender, 'i')],
        ['[id="personalInfoUS--hispanicOrLatino"]', new RegExp(P.eeo.hispanic, 'i')],
        ['[id="personalInfoUS--veteranStatus"]', new RegExp(P.eeo.veteran, 'i')],
        ['[id="personalInfoUS--ethnicity"]', new RegExp(P.eeo.race, 'i')],
      ]) {
        const b = page.locator(sel);
        if ((await b.count()) && /^Select One/i.test((await b.innerText()).trim()))
          log.push(sel + ' ' + (await btnPick(sel, re)));
      }
      const asian = await page.evaluate((src) => {
        const e = [...document.querySelectorAll('input[id$=ethnicityMulti]')].find((e) => {
          const l = document.querySelector(`label[for="${e.id}"]`);
          return l && new RegExp(src, 'i').test(l.innerText.trim());
        });
        return e ? [e.id, e.checked] : null;
      }, P.eeo.race);
      if (asian && !asian[1]) await page.locator(`label[for="${asian[0]}"]`).click();
      const tc = 'termsAndConditions--acceptTermsAndAgreements';
      const c = page.locator(`[id="${tc}"]`);
      if ((await c.count()) && !(await c.isChecked()) && !(P.consents || {}).terms_and_conditions)
        return { stop: 'terms and conditions checkbox; consents.terms_and_conditions is not true', log };
      if ((await c.count()) && !(await c.isChecked())) {
        const l = page.locator(`label[for="${tc}"]`);
        if (await l.count()) await l.click();
        else await c.click({ force: true });
      }
      await next();
      const e = await errs();
      if (e) return { stop: 'disclosures', e, log };
      continue;
    }
    if (/Self Identify/.test(h)) {
      const nm = page.locator('[id="selfIdentifiedDisabilityData--name"]');
      if ((await nm.count()) && !(P.consents || {}).e_signature)
        return { stop: 'self-ID form asks for your typed name as a signature; consents.e_signature is not true', log };
      if (await nm.count()) await nm.fill(P.name.full_legal);
      const m = page.locator('[id="selfIdentifiedDisabilityData--dateSignedOn-dateSectionMonth-input"]');
      if (await m.count()) {
        await m.evaluate((e) => {
          e.scrollIntoView({ block: 'center' });
          e.focus();
        });
        const d = new Date();
        await page.keyboard.type(String(d.getMonth() + 1).padStart(2, '0'), { delay: 80 });
        await page.keyboard.type(String(d.getDate()).padStart(2, '0'), { delay: 80 });
        await page.keyboard.type(String(d.getFullYear()), { delay: 80 });
      }
      const noId = await page.evaluate((src) => {
        const e = [...document.querySelectorAll('input[id$=disabilityStatus]')].find((e) => {
          const l = document.querySelector(`label[for="${e.id}"]`);
          return l && new RegExp(src, 'i').test(l.innerText.trim());
        });
        return e ? e.id : null;
      }, P.eeo.disability);
      if (noId) {
        await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), noId);
        await page.locator(`label[for="${noId}"]`).click();
        if (!(await page.locator(`[id="${noId}"]`).isChecked())) await page.locator(`[id="${noId}"]`).check({ force: true });
      }
      await next();
      const e = await errs();
      if (e) return { stop: 'self-identify', e, log };
      continue;
    }
    if (/Review/.test(h)) {
      return { stop: 'REVIEW_READY', log };
    }
    // NOTE: on AT&T, when Take Assessment is the last step before Review, the footer 'Submit' button
    // submits the whole application (skips Review). Upload the tailored resume in My Experience BEFORE reaching it.
    return { stop: 'unknown step', h, log };
  }
  return { stop: 'guard', log };
}
