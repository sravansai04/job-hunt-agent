async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json
  // Prepares a Workday sign-in (or create-account) page for the CANDIDATE to finish.
  // Claude never types, pastes or creates passwords. This script opens the form in the tab whose
  // URL contains globalThis.__WD_HOST (e.g. 'att.wd1'), fills the email, and returns a hand-off.
  // The candidate runs `./setup/signin.sh <company>-workday` (or `new <company>-workday` for a new
  // account), pastes with Cmd+V and clicks Sign In. Run again with globalThis.__WD_WAIT = true to
  // wait up to 5 minutes for them to finish; it returns { ok: true } once signed in.
  const host = globalThis.__WD_HOST || '';
  const site = (host.split('.')[0] || 'site') + '-workday';
  const p =
    page
      .context()
      .pages()
      .find((x) => host && x.url().includes(host)) || page;
  const signedIn = async () =>
    /Sign Out|Candidate Home|My Information|Autofill with Resume|Apply Manually/i.test(await p.evaluate(() => document.body.innerText)) &&
    !(await p.locator('input[autocomplete=current-password], input[type=password]').count());

  if (globalThis.__WD_WAIT) {
    for (let i = 0; i < 60; i++) {
      if (await signedIn()) return { ok: true, url: p.url() };
      await p.waitForTimeout(5000);
    }
    return { stop: 'not signed in after 5 minutes', url: p.url() };
  }
  if (await signedIn()) return { ok: true, url: p.url(), note: 'already signed in' };

  const signIn = p.locator('[data-automation-id=utilityButtonSignIn]').first();
  if (await signIn.count()) {
    await signIn.click();
    await p.waitForTimeout(3000);
  }
  // Some pages show sign-in and create-account forms together: fill the email in each.
  const emails = p.locator('input[data-automation-id=email]');
  const n = await emails.count();
  for (let i = 0; i < n; i++) await emails.nth(i).fill(P.email);
  const createOnly = /Create Account/i.test(await p.evaluate(() => document.body.innerText)) && !(await p.locator('[data-automation-id=signInSubmitButton]').count());
  return {
    handoff: createOnly ? 'create account' : 'sign in',
    url: p.url(),
    tell_candidate: createOnly
      ? `Open the ${host} tab. Run: ! ./setup/signin.sh new ${site}   then paste (Cmd+V) into both password boxes and click Create Account.`
      : `Open the ${host} tab (email is filled). Run: ! ./setup/signin.sh ${site}   then click the password box, press Cmd+V and click Sign In.`,
    next: 'After they confirm, run this script again with globalThis.__WD_WAIT = true, then continue with workday_fill.js.',
  };
}
