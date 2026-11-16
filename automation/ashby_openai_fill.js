async (page) => {
  const P = __PROFILE__;  // filled in by setup/render.py from config/profile.json

  // OpenAI (Ashby) application filler. Other Ashby forms differ: use this as a starting point.
  // Leaves "I confirm I have read the above" (personal-completion certification) for YOU to tick.
  const resume = P.resume_pdf;
  const T = (n) => page.getByRole('textbox', { name: n, exact: true });
  await page.waitForTimeout(2000);
  await T('Legal Name*').fill(P.name.full_legal);
  await T('Preferred Name (if applicable)').fill(P.name.preferred);
  await T('Email*').fill(P.email);
  await T('Phone Number*').fill(P.phone.intl);
  if (!new RegExp(P.resume_filename_regex, 'i').test(await page.evaluate(() => document.body.innerText))) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(i => i.id));
    const rid = ids.find(i => /resume/i.test(i)) || ids[ids.length - 1];
    await page.locator(`[id="${rid}"]`).setInputFiles(resume); await page.waitForTimeout(6000);
  }
  const loc = page.getByRole('combobox', { name: 'Start typing...' }); await loc.click(); await loc.fill(''); await page.waitForTimeout(500); await loc.pressSequentially(P.address.metro_typed, { delay: 120 }); await page.waitForTimeout(5000);
  await page.getByRole('option', { name: P.address.metro }).click(); await page.waitForTimeout(800);
  const d = page.getByRole('textbox', { name: 'Pick date...' }); await d.click(); await d.fill((() => { const x = new Date(Date.now() + P.start_date_offset_days * 864e5); return `${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}/${x.getFullYear()}`; })()); await page.keyboard.press('Enter'); await page.waitForTimeout(600); await page.keyboard.press('Escape');
  for (const [q, yes] of [[/authorized to work in the country/, P.work_auth.authorized_us], [/require sponsorship for employment visa/, P.work_auth.needs_sponsorship], [/work from our US office three days/, P.open_to_onsite]]) {
    const ans = yes ? 'Yes' : 'No';
    const blk = page.locator('div').filter({ hasText: q }).filter({ has: page.getByRole('button', { name: ans, exact: true }) }).last();
    await blk.getByRole('button', { name: ans, exact: true }).click(); await page.waitForTimeout(300);
  }
  await page.getByRole('checkbox', { name: /Arbitration Agreement/ }).check({ force: true });
  for (const re of [P.eeo.gender, P.eeo.race, P.eeo.veteran]) { const r = page.getByRole('radio', { name: new RegExp(re, 'i') }).first(); if (await r.count()) await r.check({ force: true }); }
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => document.body.innerText);
  return { title: await page.title(), resume: new RegExp(P.resume_filename_regex, 'i').test(t), name: await T('Legal Name*').inputValue().catch(() => '?'), loc: await loc.inputValue(), date: await d.inputValue(), arb: await page.getByRole('checkbox', { name: /Arbitration Agreement/ }).isChecked(), confirm: await page.getByRole('checkbox', { name: 'I confirm I have read the above.' }).isChecked() };
}
