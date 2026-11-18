const { chromium, devices } = require('playwright');
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');

const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body>
<h2 id="dTitle">Finalizar pedido</h2><div id="dBody"></div><div id="dFoot"></div>
<script>
window.__MP={publicKey:"test-public"};window.__SUPA={url:"https://checkout.test",key:"test"};
window.$=s=>document.querySelector(s);window.esc=s=>String(s||"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
window.toast=s=>window.lastToast=s;window.ic=()=>"";window.END_LOJA="Loja";
window.cart={p1:1};window.ship="frete";window.entrega={};window.cartView="";
window.total=()=>25;window.taxaAtual=()=>0;window.byId={p1:{price:25,st:5}};window.sent=[];
window.mount=()=>{document.getElementById("dBody").innerHTML=MPX.whatsHTML(false)};
</script><script src="/js/checkout-mp.js"></script><script>mount()</script></body></html>`;

(async () => {
  const server = http.createServer((req, res) => {
    const js = req.url.startsWith('/js/');
    res.setHeader('Content-Type', js ? 'text/javascript' : 'text/html; charset=utf-8');
    res.end(js ? fs.readFileSync('js/checkout-mp.js') : html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage(mobile ? devices['iPhone 13'] : { viewport: { width: 1366, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://**/*', async route => {
        assert(route.request().url().startsWith('https://checkout.test/'), 'nenhuma chamada à produção');
        await page.evaluate(body => window.sent.push(body), route.request().postDataJSON());
        await route.fulfill({ status: 400, json: { ok: false, erro: 'Resposta simulada' } });
      });
      await page.goto('http://127.0.0.1:' + server.address().port);
      const phone = page.locator('#whats');
      const examples = [
        ['21987654321', '(21) 98765-4321'],
        ['+5521987654321', '(21) 98765-4321'],
        ['+55 (21) 98765-4321', '(21) 98765-4321'],
        ['55 21 98765-4321', '(21) 98765-4321'],
        ['0055 21 98765-4321', '(21) 98765-4321'],
        ['+55 (11) 3456-7890', '(11) 3456-7890'],
        ['1134567890', '(11) 3456-7890'],
        ['55987654321', '(55) 98765-4321'],
        ['+55 (55) 98765-4321', '(55) 98765-4321'],
        ['5534567890', '(55) 3456-7890']
      ];
      for (const [raw, formatted] of examples) {
        await phone.fill(raw);
        assert.equal(await phone.inputValue(), formatted, raw);
        assert.equal(await page.evaluate(() => MPX.whatsOk()), true);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('brutt_whats'))), formatted);
      }
      await phone.fill(''); await phone.pressSequentially('+5521987654321');
      assert.equal(await phone.inputValue(), '(21) 98765-4321', 'digitação internacional não perde dígitos');
      await phone.fill(''); await phone.pressSequentially('55987654321');
      assert.equal(await phone.inputValue(), '(55) 98765-4321', 'DDD 55 nacional não é removido');
      await phone.fill('(21) 98765-4321');
      await phone.evaluate(el => { el.focus(); el.setSelectionRange(1, 3); });
      await page.keyboard.insertText('11');
      assert.equal(await phone.inputValue(), '(11) 98765-4321');
      assert.equal(await phone.evaluate(el => el.selectionStart), 3, 'editar DDD preserva o cursor');
      for (const raw of ['+1 212 555 1234', '+55 (21) 98765-432199', '219876543211', 'abc', '(55) 21971-8002']) {
        await phone.fill(raw);
        assert.equal(await page.evaluate(() => MPX.whatsInvalido()), true, raw);
      }
      await phone.fill('+55 (21) 98765-432199');
      assert.equal((await phone.inputValue()).replace(/\D/g, ''), '552198765432199', 'entrada longa não é truncada para parecer válida');
      await page.evaluate(() => {
        const el = document.getElementById('whats');
        el.value = '+55 (21) 98765-4321';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.equal(await phone.inputValue(), '(21) 98765-4321', 'autofill com apenas change');
      await page.evaluate(() => {
        const el = document.getElementById('whats');
        el.value = '+55 (55) 98765-4321';
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      });
      assert.equal(await phone.inputValue(), '(55) 98765-4321');
      await page.evaluate(() => localStorage.setItem('brutt_whats', JSON.stringify('+5521987654321')));
      await page.reload();
      assert.equal(await phone.inputValue(), '(21) 98765-4321', 'valor internacional salvo também é apresentado corretamente');
      await page.evaluate(() => {
        document.getElementById('whats').value = '+55 (11) 98765-4321';
        mount();
      });
      assert.equal(await phone.inputValue(), '(11) 98765-4321', 'redesenhar o checkout preserva autofill sem eventos');
      await page.evaluate(() => {
        document.getElementById('whats').value = '+55 (55) 98765-4321';
        document.getElementById('email').value = 'cliente@example.test';
        MPX.iniciar({nome:'Cliente',reserva:false});
      });
      await page.waitForFunction(() => window.sent.length === 1);
      const payload = await page.evaluate(() => window.sent[0]);
      assert.equal(payload.whats, '(55) 98765-4321', 'envio lê DOM mesmo sem eventos de autofill');
      assert.equal(payload.email, 'cliente@example.test');
      await page.evaluate(() => { mount(); document.getElementById('whats').value = '+55 (21) 98765-432199'; MPX.iniciar({nome:'Cliente'}); });
      assert.equal(await page.evaluate(() => window.sent.length), 1, 'contato inválido não gera pedido');
      await page.evaluate(() => { mount(); document.getElementById('whats').value = ''; document.getElementById('email').value=''; MPX.iniciar({nome:'Cliente'}); });
      await page.waitForFunction(() => window.sent.length === 2);
      assert.equal(await page.evaluate(() => window.sent[1].whats), '', 'contato continua opcional');
      assert.deepEqual(errors, []);
      console.log((mobile ? 'Mobile' : 'Desktop') + ': +55/0055, DDD 55, fixo/celular, autofill input/change/silencioso, cursor, persistência e envio OK.');
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
