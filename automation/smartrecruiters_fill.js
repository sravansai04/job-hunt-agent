async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // SmartRecruiters "Easy Apply" filler (jobs.smartrecruiters.com/oneclick-ui/company/<Co>/publication/<uuid>),
  // from the 2026-11 NBCUniversal run. Run it on the open form tab. It works in two phases:
  //   page 1 (personal info, resume)        -> fills, then clicks Next only when nothing needs review
  //   page 2 ("Preliminary questions", /screening) -> fills what the profile answers, returns the rest in `review`
  // It never clicks Submit. Read every value back (full-page screenshot) and submit only if auto_submit is true.
  //
  // The form is built from shadow-DOM web components: ids exist on both the host and the inner <input>
  // (use input#id), option text is empty to innerText, and radios have no names (values 1 = Yes, 0 = No).
  const log = [],
    review = [];
  const tab = page.context().pages().find((x) => /smartrecruiters\.com\/oneclick-ui/.test(x.url())) || page;
  const inp = (id) => tab.locator(`input#${id}, textarea#${id}`).first();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Every label / legend / question text in DOM order, piercing shadow roots.
  const deepLabels = () =>
    tab.evaluate(() => {
      const out = [];
      const walk = (r) => {
        for (const e of r.querySelectorAll('*')) {
          if (e.shadowRoot) walk(e.shadowRoot);
          if (e.tagName === 'LABEL' && e.htmlFor) out.push([e.htmlFor, e.textContent.replace(/\s+/g, ' ').trim()]);
        }
      };
      walk(document);
      return out;
    });

  // Options of the listbox the combobox opened, read through the accessibility tree.
  const openOptions = async () => {
    const lb = tab.getByRole('listbox').last();
    const snap = await lb.ariaSnapshot({ timeout: 3000 }).catch(() => '');
    return [...snap.matchAll(/option "([^"]+)"/g)].map((m) => m[1]);
  };
  const pickCombo = async (combo, pickRe, label) => {
    await combo.scrollIntoViewIfNeeded();
    await combo.click();
    await tab.waitForTimeout(700);
    const opts = await openOptions();
    const hit = opts.find((o) => pickRe.test(o));
    if (!hit) {
      await tab.keyboard.press('Escape');
      review.push(`DROPDOWN ${label} :: options: ${opts.join(' | ')}`);
      return;
    }
    await tab.getByRole('listbox').last().getByRole('option', { name: hit, exact: true }).click();
    await tab.waitForTimeout(400);
    log.push(`${label.slice(0, 50)} => ${hit}`);
  };

  if (!/\/screening/.test(tab.url())) {
    // ---------- Page 1: personal information ----------
    // Resume first: the dropzone parse can fill fields. The last file input is the Resume field
    // (the first one is the "autocomplete from resume" box).
    await tab.locator('input[type=file]').last().setInputFiles(P.resume_pdf);
    await tab.waitForTimeout(5000);
    const set = async (id, v) => {
      if (!v || !(await inp(id).count())) return;
      await inp(id).fill(v);
      log.push(`${id}=${(await inp(id).inputValue()).slice(0, 40)}`);
    };
    await set('first-name-input', P.name.first);
    await set('last-name-input', P.name.last);
    await set('email-input', P.email);
    await set('confirm-email-input', P.email);
    await set('linkedin-input', P.links.linkedin);
    await set('website-input', P.links.website);
    const tel = tab.locator('input[type=tel]').first();
    if (await tel.count()) {
      await tel.fill(P.phone.digits);
      log.push('phone=' + (await tel.inputValue()));
    }
    // Postal code / city: an autocomplete. Type slowly and click the suggestion for the profile's city.
    for (const [id, label] of await deepLabels()) {
      if (!/postal|zip|city|location/i.test(label)) continue;
      const el = inp(id);
      if (!(await el.count()) || (await el.inputValue())) continue;
      const typed = /postal|zip/i.test(label) ? P.address.zip : P.address.city;
      await el.click();
      await el.pressSequentially(typed, { delay: 120 });
      await tab.waitForTimeout(2500);
      const opts = await openOptions();
      const want = new RegExp('^' + esc(typed) + '.*' + esc(P.address.city), 'i');
      const hit = opts.find((o) => want.test(o)) || opts.find((o) => o.startsWith(typed));
      if (hit) {
        await tab.getByRole('option', { name: hit, exact: true }).first().click();
        await tab.waitForTimeout(800);
        log.push(`${label.slice(0, 30)} => ${await el.inputValue()}`);
      } else review.push(`LOCATION ${label} :: suggestions: ${opts.join(' | ')}`);
    }
    const text = await tab.evaluate(() => document.body.innerText);
    const resumeOk = new RegExp(P.resume_filename_regex, 'i').test(
      await tab.evaluate(() => {
        let t = '';
        const walk = (r) => {
          for (const e of r.querySelectorAll('*')) {
            if (e.shadowRoot) walk(e.shadowRoot);
          }
          t += r.textContent || '';
        };
        walk(document);
        return t;
      }),
    );
    if (!resumeOk) review.push('RESUME upload not shown on the page');
    if (!review.length) {
      await tab.getByRole('button', { name: /^Next$/ }).click();
      await tab.waitForTimeout(8000);
      return {
        phase: 'page1 done',
        url: tab.url(),
        log,
        review,
        note: 'Run this filler again to fill the Preliminary questions page.',
      };
    }
    return { phase: 'page1', log, review, note: 'Fix review items, click Next, then run again.', page_text: text.slice(0, 300) };
  }

  // ---------- Page 2: Preliminary questions ----------
  // Questions come from the accessibility tree: each radiogroup / combobox is preceded by its question text.
  const snap = await tab.locator('body').ariaSnapshot();
  const lines = snap.split('\n').map((l) => l.trim());
  const questions = []; // { kind: 'radio' | 'combo' | 'checkbox', q, idx }
  let lastText = '',
    comboIdx = 0,
    groupIdx = 0;
  for (const l of lines) {
    let m;
    if ((m = l.match(/^- text: "?(.+?)"?$/))) lastText = m[1];
    else if ((m = l.match(/^- radiogroup "(.+)"/))) questions.push({ kind: 'radio', q: m[1], idx: groupIdx++ });
    else if (/^- combobox/.test(l)) questions.push({ kind: 'combo', q: lastText, idx: comboIdx++ });
    else if ((m = l.match(/^- checkbox "(.+)"/))) questions.push({ kind: 'checkbox', q: m[1] });
  }
  // Radios: global order. Each group's radios are consecutive; count them per group from the DOM.
  const radioCounts = await tab.evaluate(() => {
    const groups = [];
    const walk = (r) => {
      for (const e of r.querySelectorAll('*')) {
        if (e.shadowRoot) walk(e.shadowRoot);
        if (e.getAttribute && e.getAttribute('role') === 'radiogroup') {
          let n = 0;
          const count = (x) => {
            for (const c of x.querySelectorAll('*')) {
              if (c.shadowRoot) count(c.shadowRoot);
              if (c.tagName === 'INPUT' && c.type === 'radio') n++;
            }
          };
          count(e);
          groups.push(n);
        }
      }
    };
    walk(document);
    return groups;
  });
  const radios = tab.getByRole('radio');
  const radioLabels = async (start, n) => {
    const out = [];
    for (let i = start; i < start + n; i++)
      out.push((await radios.nth(i).getAttribute('aria-label')) || ['Yes', 'No', 'Prefer not to answer'][i - start] || '');
    return out;
  };

  const eeo = P.eeo || {};
  const eeoFor = (q) =>
    /hispanic|latin/i.test(q)
      ? eeo.hispanic
      : /race|ethnic/i.test(q)
        ? eeo.race
        : /\bsex\b|gender/i.test(q)
          ? eeo.gender
          : /protected veteran|veteran status/i.test(q)
            ? eeo.veteran
            : /disab/i.test(q)
              ? eeo.disability
              : null;

  let rStart = 0;
  for (const item of questions) {
    if (item.kind === 'radio') {
      const n = radioCounts[item.idx] || 2;
      const labels = await radioLabels(rStart, n);
      const ex = eeoFor(item.q);
      let i = -1;
      if (ex) i = labels.findIndex((l) => new RegExp(ex, 'i').test(l));
      else {
        const a = answerFor(item.q, P);
        if (a && a.pick) i = labels.findIndex((l) => a.pick.test(l));
        else review.push('RADIO ' + (a && a.stop ? a.stop + ' :: ' : '') + item.q);
      }
      if (i >= 0) {
        await radios.nth(rStart + i).click({ force: true });
        log.push(`${item.q.slice(0, 60)} => ${labels[i]}`);
      } else if (ex) review.push(`RADIO (EEO) no option matched profile.eeo :: ${item.q} :: ${labels.join(' | ')}`);
      rStart += n;
      continue;
    }
    if (item.kind === 'combo') {
      const combo = tab.getByRole('combobox').nth(item.idx);
      if (!item.q || /language/i.test(item.q)) continue; // optional language picker
      const ex = eeoFor(item.q);
      if (ex) {
        await pickCombo(combo, new RegExp(ex, 'i'), item.q);
        continue;
      }
      if (/compensation|salary|pay expectation/i.test(item.q)) {
        // Ranges like "$151,000 - $175,000/yr": pick the bucket that contains the profile's number.
        const want = Number(String(P.salary_short || '').replace(/[^\d]/g, '')) * (/k$/i.test(P.salary_short) ? 1000 : 1);
        if (!want) {
          review.push('COMPENSATION no profile.salary_short :: ' + item.q);
          continue;
        }
        await combo.click();
        await tab.waitForTimeout(700);
        const opts = await openOptions();
        await tab.keyboard.press('Escape');
        const num = (s) => Number(s.replace(/[^\d]/g, ''));
        const hit = opts.find((o) => {
          const m = o.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
          return m && num(m[1]) <= want && want <= num(m[2]);
        });
        if (hit) await pickCombo(combo, new RegExp('^' + esc(hit) + '$'), item.q);
        else review.push(`COMPENSATION no bucket contains ${want} :: ${opts.join(' | ')}`);
        continue;
      }
      if (/portfolio|work samples|attachments/i.test(item.q)) {
        await pickCombo(combo, P.links.website ? /^Yes$/ : /^No$/, item.q);
        continue;
      }
      if (/current .*employee|intern or page/i.test(item.q)) {
        const v = (P.answers || {}).current_employee_here;
        if (v === false) await pickCombo(combo, /^No\b/, item.q);
        else review.push('DROPDOWN current employee/intern :: ' + item.q);
        continue;
      }
      if (/served in the armed forces|armed force|spouse.*armed forces/i.test(item.q)) {
        const v = (P.answers || {}).military_service;
        if (v === false) await pickCombo(combo, /^No\b/, item.q);
        else review.push('DROPDOWN military :: ' + item.q);
        continue;
      }
      const a = answerFor(item.q, P);
      if (a && a.pick) await pickCombo(combo, a.pick, item.q);
      else review.push('DROPDOWN ' + (a && a.stop ? a.stop + ' :: ' : '') + item.q);
      continue;
    }
    if (item.kind === 'checkbox') {
      // Privacy notice: profile answers.privacy_ack. Accuracy / "not under contract" attestations: a legal
      // statement; tick it only when profile.answers.restrictive_agreement is false and acknowledge_ok matches.
      const a = answerFor(item.q, P);
      const yes = !!(a && a.pick && ['Yes', 'I agree', 'I acknowledge'].some((o) => a.pick.test(o)));
      const cb = tab.getByRole('checkbox', { name: item.q }).first();
      if (yes && !(await cb.isChecked())) {
        await cb.check({ force: true });
        log.push('checked: ' + item.q.slice(0, 60));
      } else if (!yes) review.push('CHECKBOX ' + (a && a.stop ? a.stop + ' :: ' : a ? 'profile says no :: ' : '') + item.q.slice(0, 160));
    }
  }
  return {
    phase: 'page2',
    log,
    review,
    note: 'Answer review items yourself, take a full-page screenshot and read every value back, then click Submit only if auto_submit is true.',
  };
}
