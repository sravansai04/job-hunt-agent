async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Greenhouse (job-boards.greenhouse.io) filler. Text fields + resume + react-select by label regex.
  const log = [];
  const txt = async (id, v) => {
    const el = page.locator(`[id="${id}"]`);
    if (await el.count()) {
      await el.fill(v);
      log.push(id + '=' + v);
    }
  };
  await txt('first_name', P.name.first);
  await txt('last_name', P.name.last);
  await txt('preferred_name', P.name.preferred);
  await txt('email', P.email);
  await txt('phone', P.phone.display);
  if (await page.locator('#resume').count()) await page.locator('#resume').setInputFiles(P.resume_pdf);
  await page.waitForTimeout(3000);
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('input[id]')]
      .filter((e) => e.type === 'text')
      .map((e) => {
        const l = document.querySelector(`label[for="${e.id}"]`);
        return [
          e.id,
          l ? l.innerText.replace(/\*$/, '').trim() : '',
          e.getAttribute('role') || (e.closest('.select__control') ? 'combobox' : ''),
        ];
      }),
  );
  const textRules = [
    [/LinkedIn/i, P.links.linkedin],
    [/How did you hear/i, P.how_heard],
    [/GitHub/i, P.links.github || ''],
    [/^Website|Portfolio/i, P.links.website || ''],
    [/salary|compensation/i, P.salary_short],
    [/notice period|when can you start|earliest start|^(available |desired )?start date\??$/i, P.notice_text],
  ];
  const selRules = [
    [/^Country/i, /^United States( of America| \+1)?$/],
    [/How did you hear/i, /career|company (web)?site|job board|other/i],
    [/^Country$/i, /^United States \+1$/],
    [/transgender/i, /don.?t wish|decline|prefer not/i],
    [/gender/i, new RegExp(P.eeo.gender, 'i')],
    [/sexual orientation/i, new RegExp(P.eeo.orientation, 'i')],
    [/transgender/i, /don.?t wish|decline|prefer not/i],
    [/Veteran/i, new RegExp(P.eeo.veteran, 'i')],
    [/disability/i, new RegExp(P.eeo.disability, 'i')],
    [/race|ethnicity/i, new RegExp(P.eeo.race, 'i')],
    [/Hispanic|Latin/i, new RegExp(P.eeo.hispanic, 'i')],
    [/^Degree$/i, new RegExp(P.education[0].degree_regex, 'i')],
    [/willing to work from/i, P.open_to_onsite ? /^Yes/ : /^No/],
    [/^I identify as:?$|transgender/i, /don.?t wish|decline|prefer not/i],
  ];
  const review = [];
  for (const [id, lab, role] of labels) {
    if (['first_name', 'last_name', 'preferred_name', 'email', 'country', 'phone'].includes(id) && id !== 'country') continue;
    const el = page.locator(`[id="${id}"]`);
    const isCombo = await el.evaluate(
      (e) => !!e.closest('.select__control, [class*=select__value-container]') || e.getAttribute('role') === 'combobox',
    );
    if (!isCombo) {
      const r = textRules.find((r) => r[0].test(lab));
      if (r) {
        if (r[1]) {
          await el.fill(r[1]);
          log.push(lab.slice(0, 40) + '=' + r[1]);
        }
      } else if (!(await el.inputValue())) review.push('TEXT ' + lab);
      continue;
    }
    // shared answers first (work auth, legal, fixed facts); a stop goes to the candidate
    const shared = answerFor(lab, P);
    if (shared && shared.stop) {
      review.push('STOP ' + shared.stop + ' :: ' + lab);
      continue;
    }
    const r = shared ? [null, shared.pick] : selRules.find((r) => r[0].test(lab));
    if (!r) {
      review.push('SELECT ' + lab);
      continue;
    }
    await el.scrollIntoViewIfNeeded();
    await el.click();
    await page.waitForTimeout(700);
    if (id === 'country' || /^Country/.test(lab)) {
      await el.pressSequentially('United States', { delay: 20 });
      await page.waitForTimeout(900);
    }
    const opts = await page.evaluate(() =>
      [...document.querySelectorAll('[class*=select__option], [role=option]')]
        .filter((o) => !o.closest('.iti__country-list') && !o.classList.contains('iti__country') && o.offsetParent !== null)
        .map((o) => o.innerText.trim()),
    );
    const pick = opts.find((o) => r[1].test(o));
    if (!pick) {
      review.push('NOOPT ' + lab + ' :: ' + opts.slice(0, 8).join(' | '));
      await page.keyboard.press('Escape');
      continue;
    }
    await page
      .locator('[class*=select__option]:not(.iti__country), [role=option]:not(.iti__country)')
      .filter({ hasText: new RegExp('^' + pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') })
      .first()
      .click();
    await page.waitForTimeout(400);
    log.push(lab.slice(0, 50) + ' => ' + pick);
  }
  // second pass: race field appears only after the Hispanic answer
  {
    const rid = await page.evaluate(() => {
      const l = [...document.querySelectorAll('label')].find((l) => /identify your race|race\/ethnic/i.test(l.innerText));
      if (!l) return null;
      const f = document.getElementById(l.getAttribute('for'));
      const c = f && f.closest('.select__control');
      return c && !c.querySelector('[class*=single-value],[class*=multi-value__label]') ? f.id : null;
    });
    if (rid) {
      const el = page.locator(`[id="${rid}"]`);
      await el.scrollIntoViewIfNeeded();
      await el.click();
      await page.waitForTimeout(700);
      const o = (
        await page.evaluate(() =>
          [...document.querySelectorAll('[class*=select__option]')].filter((o) => o.offsetParent).map((o) => o.innerText.trim()),
        )
      ).find((x) => new RegExp(P.eeo.race, 'i').test(x));
      if (o) {
        await page.locator('[class*=select__option]').filter({ hasText: o }).first().click();
        log.push('race => ' + o);
      } else {
        await page.keyboard.press('Escape');
        review.push('race');
      }
    }
  }
  const cb = page.locator('#gdpr_demographic_data_consent_given_1');
  if ((await cb.count()) && !(await cb.isChecked())) await cb.check({ force: true });
  return { log, review };
}
