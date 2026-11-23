async (page) => {
  // Big-company sweep: career sites with no public ATS feed. Run from Playwright MCP
  // (browser_run_code_unsafe, filename=automation/build/sweep.js after setup/render.py).
  // Returns raw listings; Claude filters them with config/search.json and the tracker.
  const S = __SEARCH__;
  const keep = new RegExp(S.title_keep, 'i'),
    drop = new RegExp(S.title_drop, 'i');
  // Search terms come from the candidate's search.json (onboarding writes them). Sites with a keyword
  // search are queried once per term; listings are deduped by company + id.
  const TERMS = (S.search_terms || []).filter((t) => t && t.trim());
  if (!TERMS.length) return { error: 'config/search.json has no search_terms. Run onboarding first.' };
  const DAYS = 7,
    since = Date.now() - DAYS * 864e5;
  const ctx = page.context(),
    r = page.request,
    out = { listings: [], errors: [] },
    seenIds = new Set();
  const nonUs = new RegExp(S.location.non_us, 'i'),
    usHint = new RegExp(S.location.us_hint, 'i');
  const locOk = (loc) =>
    S.location.mode === 'any' || !loc || ((!nonUs.test(loc) || /united states|\busa?\b/i.test(loc)) && usHint.test(loc));
  const add = (company, id, title, location, posted, url) => {
    title = (title || '').trim();
    if (!title || !keep.test(title) || drop.test(title) || !locOk(location || '')) return;
    if (seenIds.has(company + ':' + id)) return;
    seenIds.add(company + ':' + id);
    if (posted && !isNaN(new Date(posted)) && new Date(posted).getTime() < since) return;
    out.listings.push({
      company,
      id: String(id),
      title,
      location: (location || '').slice(0, 80),
      posted: posted ? String(posted).slice(0, 10) : '',
      url,
    });
  };
  const safe = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      out.errors.push(name + ': ' + String(e).slice(0, 150));
    }
  };
  const cdp = await ctx.newCDPSession(page);
  const bg = async (url, wait = 9000) => {
    const p0 = ctx.waitForEvent('page', { timeout: 20000 });
    await cdp.send('Target.createTarget', { url, background: true });
    const tp = await p0;
    await tp.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
    await tp.waitForTimeout(wait);
    return tp;
  };

  for (const Q of TERMS)
    await safe('Microsoft: ' + Q, async () => {
      const d = await (
        await r.get(
          `https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=${encodeURIComponent(Q)}&location=United%20States&start=0&sort_by=timestamp`,
          { timeout: 30000 },
        )
      ).json();
      const list = d?.data?.positions || d?.positions || [];
      for (const j of list)
        add(
          'Microsoft',
          j.id || j.displayJobId,
          j.name || j.title,
          (j.locations || []).join('; ') || j.location,
          j.postedTs ? new Date(j.postedTs * 1000).toISOString() : j.postedDate,
          j.positionUrl
            ? 'https://apply.careers.microsoft.com' + j.positionUrl
            : `https://apply.careers.microsoft.com/careers/job/${j.id}`,
        );
    });
  await safe('Atlassian', async () => {
    const d = await (await r.get('https://www.atlassian.com/endpoint/careers/listings', { timeout: 30000 })).json();
    for (const j of Array.isArray(d) ? d : d.listings || []) {
      const loc = (j.locations || []).filter((l) => /united states|\busa?\b|americas/i.test(l)).join('; ');
      if (loc)
        add('Atlassian', j.id, j.title, loc, j.updatedDate || '', `https://www.atlassian.com/company/careers/details/${j.id}`);
    }
  });
  for (const Q of TERMS)
    await safe('ServiceNow: ' + Q, async () => {
      const d = await (
        await r.get(
          `https://api.smartrecruiters.com/v1/companies/ServiceNow/postings?q=${encodeURIComponent(Q)}&country=us&limit=100`,
          { timeout: 30000 },
        )
      ).json();
      for (const j of d.content || [])
        add(
          'ServiceNow',
          j.id,
          j.name,
          [j.location?.city, j.location?.region].filter(Boolean).join(', '),
          j.releasedDate,
          `https://jobs.smartrecruiters.com/ServiceNow/${j.id}`,
        );
    });
  for (const Q of TERMS)
    await safe('JPMorgan: ' + Q, async () => {
      const d = await (
        await r.get(
          `https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=CX_1001,keyword=${encodeURIComponent(Q)},sortBy=POSTING_DATES_DESC,limit=100`,
          { timeout: 30000 },
        )
      ).json();
      for (const j of d.items?.[0]?.requisitionList || [])
        add(
          'JPMorgan',
          j.Id,
          j.Title,
          j.PrimaryLocation,
          j.PostedDate,
          `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${j.Id}`,
        );
    });
  for (const Q of TERMS)
    await safe('Apple: ' + Q, async () => {
      const h = await (
        await r.get(
          `https://jobs.apple.com/en-us/search?search=${encodeURIComponent(Q)}&location=united-states-USA&sort=newest`,
          {
            timeout: 40000,
          },
        )
      ).text();
      const m = h.match(/window\.__staticRouterHydrationData = JSON\.parse\("(.*?)"\);/s);
      if (!m) throw new Error('hydration data not found (page layout changed)');
      const d = JSON.parse(JSON.parse('"' + m[1] + '"'));
      for (const j of d.loaderData?.search?.searchResults || [])
        add(
          'Apple',
          j.positionId,
          j.postingTitle,
          (j.locations || []).map((l) => l.name).join('; '),
          j.postDateInGMT,
          `https://jobs.apple.com/en-us/details/${j.positionId}`,
        );
    });
  await safe('Tesla', async () => {
    const p = await bg('https://www.tesla.com/careers/search/?site=US', 5000);
    const d = await p.evaluate(async () => (await fetch('/cua-api/apps/careers/state')).json());
    await p.close();
    const L = d.lookup || {};
    const newest = [...(d.listings || [])].sort((x, y) => Number(y.id) - Number(x.id)).slice(0, 300);
    const before = out.listings.length;
    for (const j of newest)
      add('Tesla', j.id, j.t, L.locations ? L.locations[j.l] : j.l, '', `https://www.tesla.com/careers/search/job/${j.id}`);
    out.listings.splice(before + 40); // keep the 40 newest matching Tesla roles
    out.note_tesla = 'Tesla listings have no date; higher ids are newer. Compare ids with the tracker.';
  });
  await safe('Goldman Sachs', async () => {
    const g = await bg('https://higher.gs.com/results?JOB_FUNCTION=Software%20Engineering&page=1&sort=POSTED_DATE');
    const rows = await g.evaluate(() =>
      [...document.querySelectorAll('a[href*="/roles/"]')].map((a) => [a.href, a.innerText.replace(/\s+/g, ' ').trim()]),
    );
    await g.close();
    for (const [href, txt] of rows)
      add(
        'Goldman Sachs',
        href.split('/roles/')[1],
        txt.split(/ [A-Z][a-z]+·/)[0].slice(0, 120),
        (txt.match(/([A-Z][A-Za-z .]+·[A-Za-z .]+)·/) || [, txt])[1],
        '',
        href,
      );
  });
  await safe('Meta', async () => {
    const m = await bg(
      'https://www.metacareers.com/jobsearch?roles[0]=Full%20time%20employment&teams[0]=Software%20Engineering&offices[0]=North%20America&sort_by_new=true',
      15000,
    );
    await m.mouse.wheel(0, 4000);
    await m.waitForTimeout(3000);
    const rows = await m.evaluate(() =>
      [...document.querySelectorAll('a[href*="/job_details/"], a[href*="/jobs/"]')]
        .map((a) => [a.href, a.innerText.replace(/\s+/g, ' ').trim()])
        .filter((x) => /\/(jobs|job_details)\/\d{8,}/.test(x[0])),
    );
    await m.close();
    for (const [href, txt] of rows) add('Meta', href.match(/\/(?:jobs|job_details)\/(\d+)/)[1], txt.slice(0, 120), '', '', href);
    if (!rows.length)
      out.errors.push('Meta: page loaded but no job links found (layout change or sign-in wall); check it by hand');
  });
  out.note = 'Google and Uber: no working endpoint; check the browser_only URLs in config/targets.json by hand.';
  return out;
}
