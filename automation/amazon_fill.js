async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json

  // Fills an amazon.jobs application in the existing Amazon tab (no new tabs) up to Review & submit.
  // Set globalThis.__AMZ_JOB = '<job id>' first (or edit the line below). Year answers come from P.amazon_years.
  const JOB = globalThis.__AMZ_JOB;
  const pick = (opts, list) => list.map((s) => opts.find((o) => o === s)).find(Boolean);
  const Y = P.amazon_years;
  const p =
    page
      .context()
      .pages()
      .find((x) => /amazon\.jobs/.test(x.url())) ||
    page
      .context()
      .pages()
      .find((x) => x !== page && !/jpmc|tesla|apple/i.test(x.url()));
  await p.goto(`https://www.amazon.jobs/applicant/jobs/${JOB}/apply`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(7000);
  const ansFor = (q, opts) => {
    const has = (s) => opts.find((o) => o === s);
    // Basic-qualification claims: answered only if the candidate confirmed them (answers.amazon_basic_quals).
    if (
      /bachelor|master's degree in computer science|at least one software programming language|version control systems and CI\/CD/i.test(
        q,
      )
    )
      return (P.answers || {}).amazon_basic_quals === 'Yes' ? has('Yes') : null;
    if (/non-internship professional software development|full software development life cycle/i.test(q))
      return pick(opts, Y.professional_sde);
    if (/design or architecture/i.test(q)) return pick(opts, Y.design_architecture);
    if (/C#, C\+\+, Java, or Perl/i.test(q)) return pick(opts, Y.language_years);
    if (/Object Oriented Design|software development engineer or related occupational/i.test(q))
      return pick(opts, Y.ood_or_sde_occupation);
    return null;
  };
  const log = [];
  for (let step = 0; step < 8; step++) {
    const t = await p.evaluate(() => document.body.innerText);
    if (/Review application and forms/.test(t)) break;
    const sels = await p.evaluate(() =>
      [...document.querySelectorAll('select')].map((s) => ({
        q: s.closest('fieldset,div.form-group,div')?.parentElement?.innerText || '',
        opts: [...s.options].map((o) => o.text),
        v: s.value,
      })),
    );
    const qs = t
      .split('\n')
      .filter((l) => /^Question/.test(l))
      .map((l) => l.slice(8));
    if (sels.length && qs.length >= sels.length) {
      for (let i = 0; i < sels.length; i++) {
        if (sels[i].v) continue;
        const a = ansFor(qs[i], sels[i].opts);
        if (!a) return { stop: 'unknown question', q: qs[i], opts: sels[i].opts, log };
        await p.locator('select').nth(i).selectOption({ label: a });
        log.push(qs[i].slice(0, 60) + ' => ' + a);
      }
    }
    const radios = await p.evaluate(() => {
      const g = {};
      document.querySelectorAll('input[type=radio]').forEach((r) => {
        g[r.name] = g[r.name] || false;
        if (r.checked) g[r.name] = true;
      });
      return g;
    });
    const set = {
      REQUIRE_SPONSORSHIP: P.work_auth.needs_sponsorship ? /^Yes/ : /^No/,
      GEF_EXT_USA_GOVERNMENT_EMPLOYEE:
        (P.answers || {}).government_official === 'No' ? /^No, I was NEVER/ : /^__ASK_CANDIDATE__$/,
    };
    for (const [n, re] of Object.entries(set))
      if (n in radios && !radios[n]) {
        await p.evaluate(
          ([n, src]) => {
            const re = new RegExp(src);
            [...document.querySelectorAll(`input[type=radio][name="${n}"]`)]
              .find((r) => re.test(r.labels?.[0]?.innerText || r.value))
              .click();
          },
          [n, re.source],
        );
        log.push(n);
        await p.waitForTimeout(1200);
      }
    const unset = await p.evaluate(() => {
      const g = {};
      document.querySelectorAll('input[type=radio]').forEach((r) => {
        if (r.name === 'consent-choice') return;
        g[r.name] = g[r.name] || r.checked;
      });
      return Object.keys(g).filter((k) => !g[k]);
    });
    if (unset.length) return { stop: 'unanswered radios', unset, log };
    const btn = p.locator('button.btn-primary', { hasText: /^(Continue|Save & continue)$/ }).first();
    await btn.click({ timeout: 10000 });
    await p.waitForTimeout(5000);
  }
  const fi = p.locator('#document-replace-input');
  await fi.setInputFiles(P.resume_pdf);
  await p.waitForTimeout(8000);
  const t = await p.evaluate(() => document.body.innerText);
  const j = t.indexOf('Upload your resume');
  return {
    log,
    review: /Review application and forms/.test(t),
    resume: t.slice(j, j + 120).replace(/\n+/g, ' | '),
    contact: t.slice(t.indexOf('Contact information'), t.indexOf('Contact information') + 200).replace(/\n+/g, ' | '),
  };
}
