async (page) => {
  // Reads recent emails (verification codes, account links) in a BACKGROUND tab so the user's view isn't disturbed.
  // Set globalThis.__GMAIL_Q first, e.g. 'from:goldman newer_than:1h' (defaults to verification mail from the last hour).
  // Needs the job-search Gmail signed in inside the Playwright browser. Opening a message marks it read.
  const q = globalThis.__GMAIL_Q || '(verification OR code OR verify) newer_than:1h';
  const ctx = page.context(); const cdp = await ctx.newCDPSession(page);
  const waitPage = ctx.waitForEvent('page', { timeout: 20000 });
  await cdp.send('Target.createTarget', { url: 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(q), background: true });
  const g = await waitPage; await g.waitForTimeout(10000);
  const rows = await g.evaluate(() => [...document.querySelectorAll('tr.zA')].slice(0, 5).map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 250)));
  let first = null;
  if (rows.length) {
    await g.locator('tr.zA').first().click(); await g.waitForTimeout(4000);
    const body = await g.evaluate(() => (document.querySelector('.a3s') || document.body).innerText);
    const links = await g.evaluate(() => [...document.querySelectorAll('.a3s a[href]')].map(a => a.href).filter(h => /verif|confirm|activate|token/i.test(h)).slice(0, 3));
    first = { codes: [...new Set((body.match(/\b\d{6}\b|\b[A-Z0-9]{6,8}\b/g) || []))].slice(0, 5), links, preview: body.slice(0, 400) };
  }
  await g.close();
  return { query: q, rows, first };
}
