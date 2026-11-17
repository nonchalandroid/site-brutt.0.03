const { chromium } = require('playwright');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');

function mockAdmin() {
  const user = { id: 'staff' };
  window.cms = { checkout: { ativo: false }, entrega: { loja: false }, contato: { whatsapp: '5521996600243' } };
  window.writes = 0;
  function from(table) {
    let one = false, row;
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
      lt() { return q; }, lte() { return q; }, gt() { return q; }, gte() { return q; },
      not() { return q; }, is() { return q; }, in() { return q; },
      maybeSingle() { one = true; return q; }, single() { one = true; return q; },
      upsert(value) { row = value; return q; },
      then(resolve, reject) {
        if (row && window.failSave) return Promise.resolve({ error: { message: 'Falha de gravação' } }).then(resolve, reject);
        if (row) { window.cms = row.config; window.writes++; }
        const rows = table === 'staff' ? [{ user_id: user.id, role: 'owner', active: true }] :
          table === 'site_cms_config' ? [{ config: window.cms }] : [];
        return Promise.resolve({ data: one ? rows[0] || null : rows, error: null }).then(resolve, reject);
      }
    };
    return q;
  }
  window.supabase = { createClient: () => ({ from, auth: {
    getSession: async () => ({ data: { session: { user } } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  } }) };
}

(async () => {
  const root = process.cwd(), errors = [];
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    const base = 'http://127.0.0.1:' + server.address().port, page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg=>{if(msg.type()==='error')console.error(msg.text())});
    let number = '5521988887777';
    await page.route('https://**/*', route => {
      const p = new URL(route.request().url()).pathname;
      if (p.endsWith('/site_cms_config')) return route.fulfill({ json: [{ config: { contato: { whatsapp: number } } }] });
      if (p.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
      return route.abort();
    });
    await page.route('**/vendor/supabase-js-2.117.2.js', route => route.fulfill({ contentType: 'text/javascript', body: '(' + mockAdmin + ')()' }));
    await page.goto(base + '/admin/#/site-cms');
    const input = page.locator('#cmsWhatsapp');
    await input.waitFor({timeout:5000}).catch(async e=>{console.error(errors,await page.locator('body').innerText());throw e});
    assert.equal(await input.inputValue(), '5521996600243');
    await input.fill('javascript:alert(1)'); await page.locator('#cmsWhatsappSave').click();
    assert.equal(await page.evaluate(() => window.writes), 0);
    await input.fill('(21) 98888-7777'); await page.locator('#cmsWhatsappSave').click();
    await page.waitForFunction(() => window.cms.contato.whatsapp === '5521988887777');
    assert.equal(await page.evaluate(() => window.cms.checkout.ativo), false);
    assert.equal(await page.evaluate(() => window.cms.entrega.loja), false);
    await page.locator('#siteCmsSave').click();
    await page.waitForFunction(() => window.writes === 2);
    assert.equal(await page.evaluate(() => window.cms.contato.whatsapp), number);
    await page.evaluate(() => window.failSave = true);
    await input.fill('21999998888'); await page.locator('#cmsWhatsappSave').click();
    await page.locator('#cmsWhatsappStatus').filter({ hasText: 'Não foi possível salvar' }).waitFor();
    assert.equal(await page.evaluate(() => window.cms.contato.whatsapp), number);
    for (const route of ['/', '/categoria/tabacos/', '/pedido/']) {
      await page.goto(base + route);
      await page.waitForFunction(n => window.BruttContato?.numero() === n, number);
      assert(await page.locator('a[href*="wa.me/"]').count(), route);
      assert(await page.locator('a[href*="wa.me/"]').evaluateAll((links, n) => links.every(a => new URL(a.href).pathname === '/' + n), number));
      number = number === '5521988887777' ? '5511977776666' : '5521988887777';
      await page.evaluate(() => BruttContato.carregar());
      assert.equal(await page.evaluate(() => BruttContato.numero()), number);
      number = number === '5521988887777' ? '5511977776666' : '5521988887777';
      await page.evaluate(() => {
        window.open = () => ({ location: { replace(url) { window.openedUrl = url; } } });
        const a = document.createElement('a');
        a.id = 'testContato'; a.href = 'https://wa.me/5521996600243?text=Pedido%20com%20espa%C3%A7o'; a.target = '_blank'; a.textContent = 'Contato de teste';
        document.body.appendChild(a); a.click();
      });
      await page.waitForFunction(() => !!window.openedUrl);
      const opened = new URL(await page.evaluate(() => window.openedUrl));
      assert.equal(opened.pathname, '/' + number, 'clique consulta novamente, inclusive em links antigos da IA');
      assert.equal(opened.searchParams.get('text'), 'Pedido com espaço');
    }
    assert.deepEqual(errors, []);
    console.log('WhatsApp CMS: validação, salvar, erro, preservação e troca nas três páginas OK.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
