async (page) => {
  const P = __PROFILE__; // filled in by setup/render.py from config/profile.json

  // Compiles resumes/upload/overleaf_in.tex in Overleaf -> resumes/upload/overleaf_out.pdf,
  // then restores the project to your base resume (P.overleaf.base_tex).
  // Needs: an Overleaf project with one main.tex, and the browser signed in to Overleaf.
  const ROOT = P.repo_dir + '/resume';
  // Reuse a spare tab (never the caller's page) so no new tab pops the window open; keep it minimized.
  const spare = page
    .context()
    .pages()
    .find((x) => x !== page && x.url() === 'about:blank');
  const created = !spare;
  const p = spare || (await page.context().newPage());
  const minimize = async () => {
    try {
      const s = await page.context().newCDPSession(p);
      const { windowId } = await s.send('Browser.getWindowForTarget');
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } catch (e) {}
  };
  await minimize();
  const readLocal = async (path) => {
    await p.evaluate(() => {
      let i = document.getElementById('__ol_in');
      if (!i) {
        i = document.createElement('input');
        i.type = 'file';
        i.id = '__ol_in';
        i.style.display = 'none';
        document.body.appendChild(i);
      }
    });
    await p.setInputFiles('#__ol_in', path);
    return await p.evaluate(async () => await document.getElementById('__ol_in').files[0].text());
  };
  const setDoc = async (text) => {
    await p.evaluate((t) => {
      const v = document.querySelector('.cm-content').cmView.view;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
    }, text);
    await p.waitForTimeout(2500);
  };
  const compile = async () => {
    await p.locator('button:has-text("Recompile")').first().click();
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(1500);
      const busy = await p.locator('button:has-text("Compiling")').count();
      if (!busy && i > 2) break;
    }
    await p.waitForTimeout(1500);
  };
  try {
    await p.goto(P.overleaf.project_url);
    await p.waitForSelector('.cm-content', { timeout: 60000 });
    await p.waitForTimeout(3000);
    const tex = await readLocal(`${ROOT}/upload/overleaf_in.tex`);
    if ((tex.match(/\\end\{document\}/g) || []).length !== 1) return { error: 'bad end{document} count' };
    await setDoc(tex);
    await compile();
    const errs = await p.evaluate(() => (document.body.innerText.match(/(\d+)\s*(errors?)/i) || [''])[0]);
    const href = await p.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((a) => /output\.pdf/.test(a.href));
      return a ? a.href : null;
    });
    let saved = false;
    if (href) {
      const resp = await p.request.get(href);
      if (resp.ok()) {
        const buf = await resp.body();
        // write via download trick
        const [dl] = await Promise.all([
          p.waitForEvent('download', { timeout: 30000 }),
          p.evaluate((u) => {
            const a = document.createElement('a');
            a.href = u;
            a.download = 'output.pdf';
            document.body.appendChild(a);
            a.click();
          }, href),
        ]);
        await dl.saveAs(`${ROOT}/upload/overleaf_out.pdf`);
        saved = buf.length;
      }
    }
    const base = await readLocal(P.overleaf.base_tex);
    await setDoc(base);
    await compile();
    return { saved, errs, href: !!href };
  } finally {
    if (created) await p.close();
    await minimize();
  }
}
