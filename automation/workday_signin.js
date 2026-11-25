async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  // Signs in to a Workday career site that's open in a tab whose URL contains globalThis.__WD_HOST
  // (e.g. 'paypal.wd1'). BEFORE running, put the password on the clipboard (never print it):
  //   security find-generic-password -s jobhunt:<site>-workday -w | tr -d '\n' | pbcopy
  // and AFTER: printf '' | pbcopy
  // Some Workday sign-in pages have two password inputs (sign-in + create-account); target current-password.
  const host = globalThis.__WD_HOST || '';
  const p =
    page
      .context()
      .pages()
      .find((x) => host && x.url().includes(host)) || page;
  const signIn = p.locator('[data-automation-id=utilityButtonSignIn]').first();
  if (await signIn.count()) {
    await signIn.click();
    await p.waitForTimeout(3000);
  }
  const pw = p.locator('input[autocomplete=current-password]').first();
  if (!(await pw.count())) return { stop: 'no sign-in form', url: p.url() };
  const form = pw.locator('xpath=ancestor::form[1]');
  const scoped = (await form.count()) > 0;
  const email = scoped ? form.locator('input[data-automation-id=email]') : p.locator('input[data-automation-id=email]').last();
  await email.fill(P.email);
  await pw.fill('');
  await pw.focus();
  await p.keyboard.press('Meta+V');
  await p.waitForTimeout(400);
  if (!(await pw.evaluate((e) => e.value.length))) return { stop: 'paste failed: is the password on the clipboard?' };
  const btn = scoped
    ? form.locator('[data-automation-id=signInSubmitButton]')
    : p.locator('[data-automation-id=signInSubmitButton]').last();
  await btn.first().click({ force: true });
  // Don't wait on a URL regex: the sign-in URL carries the return path as a parameter.
  await p
    .waitForFunction(
      () => /Sign Out|My Account|Candidate Home|Apply Manually|Use My Last Application/i.test(document.body.innerText),
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
  const t = await p.evaluate(() => document.body.innerText);
  if (/verify your (account|email)|verification/i.test(t) && !/Sign Out/.test(t))
    return { stop: 'needs email verification: open the link from Gmail (automation/gmail_codes.js)' };
  if (/invalid|incorrect|locked/i.test(t) && !/Sign Out/.test(t)) return { stop: 'sign-in rejected', text: t.slice(0, 300) };
  return { ok: true, url: p.url() };
}
