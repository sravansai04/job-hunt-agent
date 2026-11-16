async (page) => {
  const P = __PROFILE__;  // filled in by setup/render.py from config/profile.json

  // Microsoft (Eightfold) apply form filler. Run on /careers/apply?pid=... after sign-in.
  // Fills locations, resume, contact fixes, work auth, acks. Answers job-specific
  // min-qual radios only when the years asked are <= P.years_experience; otherwise returns them for review.
  const log = [];
  const sa = page.getByText('Select All', { exact: true }).first();
  if (await sa.count()) { await sa.click(); await page.waitForTimeout(2500); }
  await page.locator('input[type=file]').first().setInputFiles(P.resume_pdf);
  await page.waitForTimeout(7000);
  const setText = async (id, v) => { const el = page.locator(`[id="${id}"]`); if (!(await el.count())) return 'missing'; if ((await el.inputValue()) === v) return v; await el.fill(''); await el.pressSequentially(v, { delay: 20 }); await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.waitForTimeout(300); return el.inputValue(); };
  log.push('addr=' + await setText('Contact_Information_q_address', P.address.line1));
  log.push('city=' + await setText('Contact_Information_q_city', P.address.city));
  log.push('zip=' + await setText('Contact_Information_q_zip', P.address.zip));
  log.push('legalFirst=' + await setText('Contact_Information_q_cust_firstname', P.name.first).catch(() => 'n/a'));
  // comboboxes by question text
  const combos = await page.evaluate(() => [...document.querySelectorAll('input[role=combobox], input[aria-autocomplete]')].filter(e => e.offsetParent !== null).map(e => { let p = e, q = ''; for (let i = 0; i < 8 && p; i++) { p = p.parentElement; const t = p && p.innerText ? p.innerText.trim() : ''; if (t.length > 25) { q = t.split('\n')[0]; break; } } return [e.id, q, e.value]; }));
  const yn = (b) => b ? 'Yes' : 'No';
  const want = (q) => /legally authorized/i.test(q) ? yn(P.work_auth.authorized_us) : /sponsorship/i.test(q) ? yn(P.work_auth.needs_sponsorship) : null;
  for (const [id, q, v] of combos) {
    const w = want(q); if (!w || v === w) continue;
    const el = page.locator(`[id="${id}"]`); await el.scrollIntoViewIfNeeded(); await el.click(); await page.waitForTimeout(700);
    const o = page.locator('[role=option]', { hasText: new RegExp('^' + w + '$') }).first(); if (await o.count()) { await o.click(); await page.waitForTimeout(600); }
    log.push(q.slice(0, 40) + ' => ' + await el.inputValue());
  }
  // job-specific radios
  const js = await page.evaluate(() => { const g = {}; [...document.querySelectorAll('input[type=radio][id^=Job_specific]')].forEach(e => { const k = e.name || e.id.replace(/-\d\.\d$/, ''); let p = e, q = ''; for (let i = 0; i < 8 && p; i++) { p = p.parentElement; const t = p && p.innerText ? p.innerText.trim() : ''; if (t.length > 40) { q = t.split('\n')[0]; break; } } const l = document.querySelector(`label[for="${e.id}"]`); (g[k] = g[k] || { q, opts: [] }).opts.push([e.id, l ? l.innerText.trim() : '', e.checked]); }); return g; });
  const review = [];
  for (const k of Object.keys(js)) {
    const { q, opts } = js[k];
    const yrs = [...q.matchAll(/(\d+)\+ years/g)].map(m => +m[1]);
    const minYrs = yrs.length ? Math.min(...yrs) : 0;
    const generic = /Bachelor'?s Degree in Computer Science or related technical field AND \d\+ years technical engineering experience with coding/i.test(q);
    if (generic && minYrs <= P.years_experience) { const y = opts.find(o => o[1] === 'Yes'); if (y && !y[2]) await page.locator(`label[for="${y[0]}"]`).click(); log.push('JS Yes: ' + q.slice(0, 60)); }
    else review.push(q);
  }
  for (const p of ['Acknowledgment_q_cust_disclaimer-', 'Acknowledgment_q_cust_disclaimer2-', 'Acknowledgment_q_cust_Candidatecodeofcon']) {
    const el = page.locator(`input[id^="${p}"]`).first(); if (await el.count() && !(await el.isChecked())) { const id = await el.getAttribute('id'); const l = page.locator(`label[for="${id}"]`); if (await l.count()) await l.click(); else await el.check({ force: true }); }
  }
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => [...document.querySelectorAll('input')].filter(e => e.type !== 'hidden' && e.type !== 'file').map(e => (e.type === 'checkbox' || e.type === 'radio') ? (e.id.slice(0, 34) + (e.checked ? ' [x]' : ' [ ]')) : (e.id.slice(0, 34) + '=' + e.value.slice(0, 40))));
  const workAuthShown = await page.evaluate(() => /Work Authorization - United States/.test(document.body.innerText));
  return { review, workAuthShown, log, state };
}
