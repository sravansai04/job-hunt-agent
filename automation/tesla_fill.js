async (page) => {
  const P = __PROFILE__;  // filled in by setup/render.py from config/profile.json

  // Tesla careers apply form. Job id in localStorage.__tesla_job (set on tesla.com first). Stops at hCaptcha after Submit.
  const id = await page.evaluate(() => localStorage.getItem('__tesla_job'));
  await page.goto('https://www.tesla.com/careers/search/job/apply/' + id); await page.waitForTimeout(8000);
  const L = (t) => page.getByLabel(t, { exact: true });
  await L('Legal First Name').fill(P.name.first); await L('Legal Last Name').fill(P.name.last);
  await L('Phone Number').fill(P.phone.digits); await L('Contact Phone Type').selectOption({ label: P.phone.type });
  await L('Email').fill(P.email); await L('Country/Region of Residence').selectOption({ label: P.address.country });
  await page.locator('input[type=file]').first().setInputFiles(P.resume_pdf); await page.waitForTimeout(4000);
  const ev = P.evidence_of_excellence;
  if (await L('Evidence of Excellence').count()) await L('Evidence of Excellence').fill(ev);
  await L('Profile Link').fill(P.links.linkedin);
  const plt = L('Profile Link Type'); const o = await plt.evaluate(s => [...s.options].map(o => o.text)); const li = o.find(x => /linkedin/i.test(x)); if (li) await plt.selectOption({ label: li });
  const file = await page.evaluate((src) => new RegExp(src, 'i').test(document.body.innerText), P.resume_filename_regex);
  if (!file) return { stop: 'no resume' };
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true }); await page.waitForTimeout(6000);
  const radio = async (name, val) => { const rid = await page.evaluate(([n, v]) => { const e = [...document.querySelectorAll(`input[name="${n}"]`)].find(e => (document.querySelector(`label[for="${e.id}"]`) || {}).innerText?.trim() === v); return e && e.id; }, [name, val]); if (!rid) return false; await page.locator(`[id="${rid}"]`).check({ force: true }); return true; };
  await page.locator('select[name="legal.legalNoticePeriod"]').selectOption({ label: 'In 1-2 weeks' });
  await radio('legal.legalImmigrationSponsorship', P.work_auth.needs_sponsorship ? 'Yes' : 'No'); await radio('legal.legalConsiderOtherPositions', 'Yes');
  await radio('legal.legalFormerTeslaEmployee', 'No'); await radio('legal.legalFormerTeslaInternOrContractor', 'No'); await radio('legal.legalReceiveNotifications', 'Yes');
  for (const n of ['legal.legalAcknowledgment', 'legal.legalAcknowledgmentTalentPrivacyNotice', 'legal.legalAcknowledgmentArbitrationAgreement']) await page.locator(`input[name="${n}"]`).check({ force: true });
  await page.locator('input[name="legal.legalAcknowledgmentName"]').fill(P.name.full_legal);
  const unknown = await page.evaluate(() => { const known = /legalNoticePeriod|legalImmigrationSponsorship|legalConsiderOtherPositions|legalFormerTeslaEmployee|legalFormerTeslaInternOrContractor|legalReceiveNotifications|legalAcknowledgment/; return [...document.querySelectorAll('input, select, textarea')].filter(e => e.offsetParent && e.type !== 'hidden' && !known.test(e.name)).map(e => e.name + ' :: ' + ((document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '')); });
  if (unknown.length) return { stop: 'unknown legal fields', unknown };
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true }); await page.waitForTimeout(6000);
  await page.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY.match(/auto|scroll/)) e.scrollTop = e.scrollHeight; }); window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(1500);
  await page.locator('input[name="eeo.eeoAcknowledgment"]').check({ force: true });
  const pick = async (name, re) => { const s = page.locator(`select[name="${name}"]`); const o = await s.evaluate(s => [...s.options].map(o => o.text)); const v = o.find(x => re.test(x)); if (v) await s.selectOption({ label: v }); return v; };
  const eeo = [await pick('eeo.eeoGender', new RegExp(P.eeo.gender, 'i')), await pick('eeo.eeoVeteranStatus', new RegExp(P.eeo.veteran, 'i')), await pick('eeo.eeoRaceEthnicity', new RegExp(P.eeo.race, 'i'))];
  await page.locator('input[name="eeo.eeoDisabilityStatusName"]').fill(P.name.full_legal);
  const title = await page.evaluate(() => (document.body.innerText.match(/Job Application\n([^\n]*)/) || [])[1]);
  await page.getByRole('button', { name: 'Submit', exact: true }).click({ force: true }); await page.waitForTimeout(6000);
  const t = await page.evaluate(() => document.body.innerText);
  const cap = await page.evaluate(() => [...document.querySelectorAll('iframe')].filter(f => /hcaptcha/.test(f.src) && f.offsetParent).length);
  return { stop: /Has Been Received/.test(t) ? 'SUBMITTED' : (cap ? 'CAPTCHA_WAITING' : 'check'), title, eeo };
}
