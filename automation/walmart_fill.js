async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Walmart careers (careers.walmart.com) wizard. Runs ONE step per call and returns the next step's heading,
  // so each step can be checked before moving on. Call it again until it returns { stop }.
  // Set MEETS_MIN_QUALS to true in the built copy only after checking the job's minimum qualifications yourself.
  const MEETS_MIN_QUALS = null;
  const body = async () =>
    page.evaluate(() => {
      const s = document.body.innerText.replace(/\n{2,}/g, '\n');
      const i = s.indexOf('Military\n');
      const j = s.indexOf('\nCareers\nStores');
      return s.slice(i + 9, j);
    });
  const t0 = await body();
  const head = t0.split('\n')[0];
  const cont = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent && /^(Continue|Next)$/.test((b.getAttribute('aria-label') || b.innerText).trim()))
        .pop();
      b.click();
    });
    await page.waitForTimeout(9000);
  };
  const selByLabel = async (re, optRe) => {
    const id = await page.evaluate((src) => {
      const r = new RegExp(src, 'i');
      const s = [...document.querySelectorAll('select')].find(
        (s) => s.offsetParent && s.labels && s.labels[0] && r.test(s.labels[0].innerText),
      );
      return s && s.id;
    }, re);
    if (!id) return 'noid ' + re;
    const sel = page.locator(`select[id="${id}"]`);
    const o = (await sel.evaluate((s) => [...s.options].map((o) => o.text))).find((x) => new RegExp(optRe, 'i').test(x));
    if (!o) return 'noopt ' + re;
    await sel.selectOption({ label: o });
    await page.waitForTimeout(1200);
    return o;
  };
  // Walmart's email/text inputs reject .fill() ("Invalid input"); type them instead.
  const fillByLabel = async (re, v) => {
    const id = await page.evaluate((src) => {
      const r = new RegExp(src, 'i');
      const e = [...document.querySelectorAll('input,textarea')].find(
        (e) => e.offsetParent && e.labels && e.labels[0] && r.test(e.labels[0].innerText),
      );
      return e && e.id;
    }, re);
    if (!id) return 'noid ' + re;
    const el = page.locator(`[id="${id}"]`);
    if ((await el.inputValue()) !== v) {
      await el.click();
      await el.fill('');
      await el.pressSequentially(v, { delay: 20 });
    }
    return v;
  };
  // Radio groups: find each group's question text, answer it with a function of that text.
  const radios = async (answerOf) => {
    const groups = await page.evaluate(() => {
      const g = {};
      document.querySelectorAll('input[type=radio]').forEach((r) => {
        if (!r.offsetParent) return;
        let p = r,
          q = '';
        for (let i = 0; i < 10 && p; i++) {
          p = p.parentElement;
          if (p.innerText.replace(/\b(Yes|No)\b/g, '').trim().length > 20) {
            q = p.innerText;
            break;
          }
        }
        (g[r.name] = g[r.name] || { q, opts: [] }).opts.push([r.id, r.labels && r.labels[0] ? r.labels[0].innerText.trim() : '']);
      });
      return g;
    });
    const out = [];
    for (const { q, opts } of Object.values(groups)) {
      const want = answerOf(q.replace(/\s+/g, ' '));
      if (!want || want.stop) {
        out.push('STOP ' + (want ? want.stop : 'unknown') + ' :: ' + q.slice(0, 100));
        continue;
      }
      const o = opts.find((o) => want.test(o[1]));
      if (!o) {
        out.push('NOOPT ' + q.slice(0, 80));
        continue;
      }
      await page.locator(`[id="${o[0]}"]`).check({ force: true });
      out.push(q.slice(0, 50) + ' => ' + o[1]);
    }
    return out;
  };
  const shared = (q) => {
    const a = answerFor(q, P);
    return a && a.pick ? a.pick : a;
  };
  const log = [head];

  if (/Tell us about yourself/.test(head)) {
    log.push(await selByLabel('How did you hear', P.walmart_source || 'Job Board'));
    if (P.walmart_source_detail) log.push(await selByLabel('Source detail', P.walmart_source_detail));
    log.push(
      ...(await radios((q) =>
        /English|Spanish|French/.test(q)
          ? /^English$/
          : /associate/i.test(q)
            ? shared('Are you a current employee of Walmart?')
            : shared(q),
      )),
    );
  } else if (/home address/.test(head)) {
    log.push(
      await fillByLabel('^Address line 1', P.address.line1),
      await fillByLabel('^City', P.address.city),
      await selByLabel('^State', '^' + P.address.state + '$'),
      await fillByLabel('^ZIP', P.address.zip),
    );
  } else if (/Employment history/.test(head)) {
    if (!(P.answers || {}).acknowledge_ok)
      return { stop: 'employment history accuracy statement; answers.acknowledge_ok not set', head };
    await page.evaluate(() => {
      const c = [...document.querySelectorAll('input[type=checkbox]')].find(
        (c) => c.offsetParent && c.labels && c.labels[0] && /accurate to the best/.test(c.labels[0].innerText),
      );
      if (c && !c.checked) c.click();
    });
    log.push('accuracy statement ticked');
  } else if (/^Voluntary disclosure/.test(head)) {
    const ans = (q) => {
      if (/minimum qualifications/i.test(q))
        return MEETS_MIN_QUALS === true
          ? /^Yes$/
          : { stop: 'minimum qualifications: check the job description, then set MEETS_MIN_QUALS in the built copy' };
      if (/within 3 days/i.test(q)) return shared('Can you complete I-9 verification of identity?');
      if (/immigration-related employment benefit/i.test(q)) return shared('Will you require immigration sponsorship?');
      if (/type of sponsorship/i.test(q)) return shared('What type of visa sponsorship will you require?');
      if (/direct family member/i.test(q)) return shared('Is a relative employed here?');
      if (/text message/i.test(q)) {
        const a = shared('Receive text message notifications');
        return a && a.test && a.test('Yes') ? /^Opt-In/ : a && a.test ? /^Opt-Out|^No/ : a;
      }
      return shared(q);
    };
    log.push(...(await radios(ans)));
    log.push(await selByLabel('age category', (P.answers || {}).over_18 === 'Yes' ? '^18 years' : 'NOPE'));
    await page.waitForTimeout(800);
    log.push(...(await radios(ans))); // the visa-type question appears after the first answers
    const ph = await page.evaluate(() => {
      const e = [...document.querySelectorAll('input')].find(
        (e) => e.offsetParent && e.labels && e.labels[0] && /10-digit mobile/.test(e.labels[0].innerText),
      );
      return e && e.id;
    });
    if (ph) {
      await page.locator(`[id="${ph}"]`).fill(P.phone.digits);
      log.push('phone');
    }
  } else if (/Equal employment/.test(head)) {
    log.push(await selByLabel('select your ethnicity', P.eeo.race), await selByLabel('select your gender', P.eeo.gender));
  } else if (/Military Service/.test(head)) {
    log.push(
      ...(await radios((q) =>
        /Active Duty|Guard|Spouse|Partner/i.test(q) ? shared('Have you served in the military?') : shared(q),
      )),
    );
  } else if (/WOTC questionnaire/.test(head) && !/Consent Form/.test(t0)) {
    // Work Opportunity Tax Credit survey: answers come from answers.wotc ("No" = answer No to every question).
    if ((P.answers || {}).wotc !== 'No')
      return { stop: 'WOTC tax-credit questionnaire; set answers.wotc or answer it yourself', head };
    log.push(...(await radios(() => /^No$/)));
  } else if (/Consent Form/.test(t0)) {
    if (!(P.consents || {}).e_signature)
      return { stop: 'WOTC consent asks for your typed name as a signature; consents.e_signature is not true', head };
    log.push(await fillByLabel('first and last name', P.name.full_legal));
  } else {
    return { stop: 'unknown step', head, text: t0.slice(0, 2500) };
  }
  if (log.some((x) => /^STOP|NOOPT|noid|noopt/.test(String(x)))) return { stop: 'check', log, text: t0.slice(0, 1500) };
  await cont();
  const errs = await page.evaluate(() =>
    [...document.querySelectorAll('[class*=error],[role=alert]')]
      .filter((e) => e.offsetParent && e.innerText.trim())
      .map((e) => e.innerText.trim().slice(0, 100)),
  );
  const t1 = await body();
  return { log, errs, next: t1.split('\n')[0], preview: t1.slice(0, 300) };
}
