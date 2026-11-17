async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  __ANSWERS__; // shared screening answers (automation/lib/answers.js)

  // Tesla careers apply form. Job id in localStorage.__tesla_job (set on tesla.com first). Stops at hCaptcha after Submit.
  const id = await page.evaluate(() => localStorage.getItem('__tesla_job'));
  await page.goto('https://www.tesla.com/careers/search/job/apply/' + id);
  await page.waitForTimeout(8000);
  const L = (t) => page.getByLabel(t, { exact: true });
  await L('Legal First Name').fill(P.name.first);
  await L('Legal Last Name').fill(P.name.last);
  await L('Phone Number').fill(P.phone.digits);
  await L('Contact Phone Type').selectOption({ label: P.phone.type });
  await L('Email').fill(P.email);
  await L('Country/Region of Residence').selectOption({ label: P.address.country });
  await page.locator('input[type=file]').first().setInputFiles(P.resume_pdf);
  await page.waitForTimeout(4000);
  const ev = P.evidence_of_excellence;
  if (await L('Evidence of Excellence').count()) await L('Evidence of Excellence').fill(ev);
  await L('Profile Link').fill(P.links.linkedin);
  const plt = L('Profile Link Type');
  const o = await plt.evaluate((s) => [...s.options].map((o) => o.text));
  const li = o.find((x) => /linkedin/i.test(x));
  if (li) await plt.selectOption({ label: li });
  const file = await page.evaluate((src) => new RegExp(src, 'i').test(document.body.innerText), P.resume_filename_regex);
  if (!file) return { stop: 'no resume' };
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true });
  await page.waitForTimeout(6000);
  const radio = async (name, val) => {
    const rid = await page.evaluate(
      ([n, v]) => {
        const e = [...document.querySelectorAll(`input[name="${n}"]`)].find(
          (e) => (document.querySelector(`label[for="${e.id}"]`) || {}).innerText?.trim() === v,
        );
        return e && e.id;
      },
      [name, val],
    );
    if (!rid) return false;
    await page.locator(`[id="${rid}"]`).check({ force: true });
    return true;
  };
  const C = P.consents || {};
  if (!P.notice_options || !P.notice_options.tesla)
    return { stop: 'no Tesla notice-period option in profile (notice_options.tesla, e.g. "In 1-2 weeks")' };
  await page.locator('select[name="legal.legalNoticePeriod"]').selectOption({ label: P.notice_options.tesla });
  // every Yes/No below comes from the profile through answerFor(); a missing answer stops the run
  const ans = (q) => {
    const a = answerFor(q, P);
    if (!a || a.stop) throw new Error('STOP ' + (a ? a.stop : 'no rule') + ' :: ' + q);
    return ['Yes', 'No'].find((o) => a.pick.test(o));
  };
  try {
    await radio('legal.legalImmigrationSponsorship', ans('Will you require immigration sponsorship?'));
    await radio('legal.legalConsiderOtherPositions', ans('Contact me about future opportunities'));
    await radio('legal.legalFormerTeslaEmployee', ans('Have you previously worked for Tesla?'));
    await radio('legal.legalFormerTeslaInternOrContractor', ans('Are you a former Tesla intern or contract worker?'));
    await radio('legal.legalReceiveNotifications', ans('Receive text message notifications'));
  } catch (e) {
    return { stop: String(e.message) };
  }
  if (!C.terms_and_conditions || !C.arbitration || !C.e_signature)
    return {
      stop: 'Tesla needs the general acknowledgment, the arbitration agreement and your typed legal name as a signature; consents.terms_and_conditions, consents.arbitration and consents.e_signature must all be true',
    };
  for (const n of [
    'legal.legalAcknowledgment',
    'legal.legalAcknowledgmentTalentPrivacyNotice',
    'legal.legalAcknowledgmentArbitrationAgreement',
  ])
    await page.locator(`input[name="${n}"]`).check({ force: true });
  await page.locator('input[name="legal.legalAcknowledgmentName"]').fill(P.name.full_legal);
  const unknown = await page.evaluate(() => {
    const known =
      /legalNoticePeriod|legalImmigrationSponsorship|legalConsiderOtherPositions|legalFormerTeslaEmployee|legalFormerTeslaInternOrContractor|legalReceiveNotifications|legalAcknowledgment/;
    return [...document.querySelectorAll('input, select, textarea')]
      .filter((e) => e.offsetParent && e.type !== 'hidden' && !known.test(e.name))
      .map((e) => e.name + ' :: ' + ((document.querySelector(`label[for="${e.id}"]`) || {}).innerText || ''));
  });
  if (unknown.length) return { stop: 'unknown legal fields', unknown };
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY.match(/auto|scroll/))
        e.scrollTop = e.scrollHeight;
    });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1500);
  await page.locator('input[name="eeo.eeoAcknowledgment"]').check({ force: true });
  const pick = async (name, re) => {
    const s = page.locator(`select[name="${name}"]`);
    const o = await s.evaluate((s) => [...s.options].map((o) => o.text));
    const v = o.find((x) => re.test(x));
    if (v) await s.selectOption({ label: v });
    return v;
  };
  const eeo = [
    await pick('eeo.eeoGender', new RegExp(P.eeo.gender, 'i')),
    await pick('eeo.eeoVeteranStatus', new RegExp(P.eeo.veteran, 'i')),
    await pick('eeo.eeoRaceEthnicity', new RegExp(P.eeo.race, 'i')),
  ];
  await page.locator('input[name="eeo.eeoDisabilityStatusName"]').fill(P.name.full_legal);
  const title = await page.evaluate(() => (document.body.innerText.match(/Job Application\n([^\n]*)/) || [])[1]);
  // Submit only with standing approval. Otherwise stop here so the candidate (or Claude after a "go") clicks Submit.
  if (P.auto_submit !== true) return { stop: 'READY_TO_SUBMIT (auto_submit is off)', title, eeo };
  await page.getByRole('button', { name: 'Submit', exact: true }).click({ force: true });
  await page.waitForTimeout(6000);
  const t = await page.evaluate(() => document.body.innerText);
  const cap = await page.evaluate(
    () => [...document.querySelectorAll('iframe')].filter((f) => /hcaptcha/.test(f.src) && f.offsetParent).length,
  );
  return { stop: /Has Been Received/.test(t) ? 'SUBMITTED' : cap ? 'CAPTCHA_WAITING' : 'check', title, eeo };
}
