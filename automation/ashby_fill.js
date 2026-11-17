async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Generic Ashby (jobs.ashbyhq.com/<company>/<id>/application) filler, from the 2026-11 Ramp and OpenAI runs.
  // Fills system fields, resume, phone consents, location and Yes/No questions. Free-text questions
  // ("What have you built recently?") and anything unknown come back in `review`: draft those from
  // confirmed facts (ask the candidate for subjective ones), then fill them and submit after checking.
  const log = [],
    review = [];
  const field = (el) =>
    (el.closest('[class*=fieldEntry]') || el.closest('fieldset') || { innerText: '' }).innerText
      .split('\n')[0]
      .replace(/\*$/, '')
      .trim();

  // 1. Resume first: Ashby's parse can overwrite fields typed before it.
  const resumeInput = page.locator('input[type=file][name=_systemfield_resume], input[type=file]').last();
  await resumeInput.setInputFiles(P.resume_pdf);
  await page.waitForTimeout(8000);
  const fill = async (sel, v) => {
    const e = page.locator(sel).first();
    if (!(await e.count()) || !v) return;
    await e.fill(v);
    log.push(sel.slice(0, 40) + '=' + (await e.inputValue()).slice(0, 40));
  };
  await fill('[name=_systemfield_name]', P.name.full_legal);
  await fill('[name=_systemfield_email]', P.email);
  await fill('input[type=tel]', P.phone.digits);

  // 2. Text inputs and textareas by their question label.
  const inputs = await page.evaluate((fieldSrc) => {
    const field = new Function('return ' + fieldSrc)();
    return [...document.querySelectorAll('input[type=text], input:not([type]), textarea')]
      .filter((e) => e.offsetParent && !/^_systemfield_(name|email)$/.test(e.name) && e.name !== 'g-recaptcha-response')
      .map((e) => [e.name || e.id, e.tagName, e.getAttribute('role'), field(e), e.value]);
  }, field.toString());
  for (const [key, tag, role, label, val] of inputs) {
    const el = page.locator(`[name="${key}"], [id="${key}"]`).first();
    if (/linkedin/i.test(label)) {
      await el.fill(P.links.linkedin);
      log.push('LinkedIn');
      continue;
    }
    if (/github/i.test(label) && P.links.github) {
      await el.fill(P.links.github);
      continue;
    }
    if (/website|portfolio/i.test(label) && P.links.website) {
      await el.fill(P.links.website);
      continue;
    }
    if (role === 'combobox' && /where|location|city|based/i.test(label)) {
      await el.click();
      await el.pressSequentially(P.address.city, { delay: 80 });
      await page.waitForTimeout(2500);
      const o = page.locator('[role=option]', { hasText: new RegExp('^' + P.address.city + ', ' + P.address.state) }).first();
      if (await o.count()) {
        await o.click();
        await page.waitForTimeout(800);
        log.push(label.slice(0, 40) + ' => ' + (await el.inputValue()));
      } else review.push('LOCATION ' + label);
      continue;
    }
    if (!val) review.push((tag === 'TEXTAREA' ? 'FREE TEXT ' : 'TEXT ') + label);
  }

  // 3. Phone consent radios (Ashby uses value=given / notGiven).
  for (const [name, q] of [
    ['smsConsent', 'Receive text message notifications'],
    ['whatsAppConsent', 'WhatsApp messages'],
  ]) {
    if (!(await page.locator(`input[name=${name}]`).count())) continue;
    const a = name === 'smsConsent' ? answerFor(q, P) : null;
    const yes = a && a.pick && a.pick.test('Yes');
    await page.locator(`input[name=${name}][value=${yes ? 'given' : 'notGiven'}]`).check({ force: true });
    log.push(name + '=' + (yes ? 'given' : 'notGiven'));
  }

  // 4. Location-preference checkboxes: ticked only from profile.ashby_location_checkboxes (exact option names).
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('input[type=checkbox]')].filter((e) => e.offsetParent).map((e) => e.name),
  );
  for (const b of boxes) {
    if ((P.ashby_location_checkboxes || []).includes(b)) {
      await page.locator(`input[type=checkbox][name="${b}"]`).check({ force: true });
      log.push('box ' + b);
    }
  }
  const unchecked = boxes.filter((b) => !(P.ashby_location_checkboxes || []).includes(b));
  if (boxes.length && unchecked.length === boxes.length)
    review.push('CHECKBOXES none matched profile.ashby_location_checkboxes: ' + boxes.join(' | '));

  // 5. Yes/No button questions (OpenAI style) through the shared answers.
  const yn = await page.evaluate(() =>
    [...document.querySelectorAll('[class*=fieldEntry]')]
      .filter((f) => f.offsetParent && [...f.querySelectorAll('button')].some((b) => /^(Yes|No)$/.test(b.innerText.trim())))
      .map((f) => f.innerText.split('\n')[0].replace(/\*$/, '').trim()),
  );
  for (const q of yn) {
    const a = answerFor(q, P);
    if (!a || a.stop) {
      review.push('YES/NO ' + (a ? a.stop + ' :: ' : '') + q);
      continue;
    }
    const ans = ['Yes', 'No'].find((o) => a.pick.test(o));
    await page
      .locator('[class*=fieldEntry]')
      .filter({ hasText: q })
      .getByRole('button', { name: ans, exact: true })
      .first()
      .click();
    log.push(q.slice(0, 50) + ' => ' + ans);
  }

  const t = await page.evaluate(() => document.body.innerText);
  return {
    resume: new RegExp(P.resume_filename_regex, 'i').test(t),
    log,
    review,
    note: 'Fill review items, read every field back, then click "Submit Application" only if auto_submit is true.',
  };
}
