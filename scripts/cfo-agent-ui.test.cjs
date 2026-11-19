const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
function mockClient() {
  const session = { user: { id: 'test-user' }, access_token: 'test-only' };
  window.__writes = 0;
  function from(table) {
    let single = false;
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, not() { return q; }, lt() { return q; }, lte() { return q; }, gt() { return q; }, gte() { return q; }, is() { return q; }, in() { return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update() { window.__writes++; return q; }, upsert() { window.__writes++; return q; }, insert() { window.__writes++; return q; },
      then(resolve, reject) {
        const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const rows = {
          staff: [{ user_id: 'test-user', role: 'owner', name: 'Gestão', active: true }],
          financeiro: [{ id: 1, custos: [{ nome: 'Aluguel', valor: 2500 }], dia_a_dia: 500, faturamento: 15000 }],
          products: [{ id: 'p1', price: 100, cost_price: 60, stock: 10, sales_count: 30, category_id: 'c1' }],
          categories: [{ id: 'c1', name: 'Categoria', slug: 'categoria' }],
          vendas_dia: window.__noSales ? [] : [{ dia: now, faturamento: 1000.25, lucro_bruto: 400.10, vendas: 10 }],
          vendas_periodo: [{ id: 1, dias: 30 }]
        };
        const data = rows[table] || [];
        return Promise.resolve({ data: single ? data[0] || null : data, count: data.length, error: null }).then(resolve, reject);
      }
    }; return q;
  }
  window.supabase = { createClient: () => ({ from, auth: { getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user: session.user } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) };
}
(async () => {
  const root = process.cwd(); fs.mkdirSync('work', { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, body) => { if (error) return res.writeHead(404).end(); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' }[path.extname(file)] || 'application/octet-stream' }); res.end(body); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000);
    const errors = [], requests = []; let mode = 'ok';
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('**/vendor/supabase-js-2.117.2.js', route => route.fulfill({ contentType: 'text/javascript', body: `(${mockClient.toString()})();` }));
    await page.route('**/functions/v1/cfo-agent', async route => {
      requests.push(route.request().postDataJSON());
      if (mode === 'wait') await new Promise(resolve => setTimeout(resolve, 800));
      const answer = '### Parecer\n**O ponto de equilíbrio ainda não foi atingido.**\nFaltam R$ 6.499,75 em faturamento para cobrir os custos cadastrados.\n### Números utilizados\n- **Faturamento importado:** R$ 1.000,25\n- **Ponto de equilíbrio:** R$ 7.500,00\n### Compromissos e riscos\n| Indicador | Valor |\n| --- | --- |\n| Compromissos próximos | R$ 60,00 |\n| Saldo disponível | Não informado |\n> Faturamento acumulado não comprova caixa livre.\n### Próximo passo\n1. Confirme o saldo disponível e os recebíveis.\n2. Informe o valor da despesa para simular o impacto.';
      await route.fulfill({ status: mode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'error' ? { error: 'Tente novamente.' } : { answer: answer + (mode === 'formatted' ? '' : '\n<img src=x onerror=alert(1)>') }) }).catch(() => {});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/#/financeiro`);
    await page.waitForFunction(() => document.querySelector('.eq-term')?.cfoContext);
    const before = await page.locator('#lcGraf .eq-term').evaluate(e => e.cfoContext);
    assert.equal(before.financialContext.faturamentoAtual, 1000.25);
    assert.equal(before.financialContext.custosFixos, 2500);
    assert.equal(before.meta.outrosCustos, 500);
    await page.locator('#fnCfoIa').click(); await page.locator('.cfo-agent-drawer').waitFor();
    await page.getByRole('tab', { name: 'Contas a pagar', exact: true }).click();
    const today = await page.locator('input[name="dataCompra"]').inputValue();
    const date = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10);
    async function addBill(name, offset, value) {
      await page.locator('input[name="fornecedor"]').fill(name);
      await page.locator('input[name="dataCompra"]').fill(date(-10));
      await page.locator('input[name="dataVencimento"]').fill(date(offset));
      await page.locator('input[name="valor"]').fill(value);
      await page.getByRole('button', { name: 'Cadastrar boleto', exact: true }).click();
    }
    await addBill('Distante', 8, '1234,56'); await addBill('Próximo', 7, '100.25'); await addBill('Vencido', -1, '10'); await addBill('Hoje', 0, '20');
    assert.deepEqual(await page.locator('.cfo-agent-boleto strong').allTextContents(), ['Vencido', 'Hoje', 'Próximo', 'Distante']);
    assert.equal(await page.locator('.cfo-agent-due-soon').count(), 2);
    assert.equal(await page.locator('.cfo-agent-overdue').count(), 1);
    await page.getByRole('button', { name: 'Marcar Pago: Hoje', exact: true }).click();
    assert.equal(await page.locator('.cfo-agent-boleto').count(), 3);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('brutt:cfo-boletos:')))));
    assert.equal(stored.find(b => b.fornecedor === 'Hoje').status, 'pago');
    await page.getByRole('tab', { name: 'Análise', exact: true }).click();
    await page.getByText('Quanto falta para atingir o ponto de equilíbrio?', { exact: true }).click();
    await page.locator('.cfo-agent-assistant').waitFor();
    assert.deepEqual(requests[0].financialContext, { ...before.financialContext, boletosAbertos: stored.filter(b => b.status === 'aberto').sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)) });
    assert.equal(await page.locator('.cfo-agent-assistant img').count(), 0);
    assert.equal(await page.locator('.cfo-agent-assistant h3').count(), 4);
    assert.equal(await page.locator('.cfo-agent-assistant table').count(), 1);
    assert.equal(await page.locator('.cfo-agent-assistant ul li').count(), 2);
    assert.equal(await page.locator('.cfo-agent-assistant ol li').count(), 2);
    await page.locator('.cfo-agent-context summary').click();
    await page.screenshot({ path: 'work/cfo-agent-desktop.png' });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('#fnCfoIa').evaluate(el => el === document.activeElement), true);
    await page.locator('#eqSim').evaluate(el => { el.value = String(Number(el.value) + 200); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(previous => document.querySelector('.eq-term').cfoContext.financialContext.ritmoDiarioSimulado !== previous, before.financialContext.ritmoDiarioSimulado);
    await page.locator('#fnCfoIa').click();
    mode = 'error'; await page.locator('#cfo-agent-question').fill('Teste de erro'); await page.locator('.cfo-agent-send').click();
    await page.waitForFunction(() => document.querySelector('.cfo-agent-status').textContent === 'Tente novamente.');
    assert.equal(await page.locator('.cfo-agent-send').isEnabled(), true);
    assert.equal(requests.at(-1).meta.simulado, true);
    mode = 'ok'; await page.locator('.cfo-agent-send').click(); await page.waitForFunction(() => document.querySelectorAll('.cfo-agent-assistant').length === 2);
    for (const width of [360, 390, 430]) { await page.setViewportSize({ width, height: 850 }); assert.equal(await page.locator('.cfo-agent-drawer').evaluate(el => el.scrollWidth > el.clientWidth), false); }
    await page.screenshot({ path: 'work/cfo-agent-mobile.png' });
    mode = 'wait'; await page.locator('#cfo-agent-question').fill('Cancelar'); await page.locator('.cfo-agent-send').click(); await page.locator('.cfo-agent-close').click();
    await page.waitForFunction(() => !document.querySelector('.cfo-agent-send').disabled);
    await page.locator('#fnCfoIa').click(); await page.evaluate(() => location.hash = '#/pedidos');
    await page.waitForFunction(() => !document.querySelector('.cfo-agent-drawer').open);
    await page.waitForTimeout(350);
    await page.evaluate(() => { window.__noSales = true; location.hash = '#/financeiro'; });
    await page.waitForFunction(() => document.querySelector('#lcGraf .eq-term')?.cfoContext === null); await page.locator('#fnCfoIa').click();
    await page.waitForFunction(() => document.querySelector('.cfo-agent-drawer').open && document.querySelector('.cfo-agent-metrics').textContent.includes('indisponíveis'));
    assert.equal(await page.evaluate(() => window.__writes), 0);
    mode = 'ok'; await page.getByText('Analisar impacto dos boletos próximos', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cfo-agent-assistant'));
    assert.equal(requests.at(-1).financialContext, undefined);
    assert.equal(requests.at(-1).boletosAbertos.length, 3);
    await page.reload(); await page.locator('#eqSim').waitFor(); await page.locator('#fnCfoIa').click();
    await page.getByRole('tab', { name: 'Contas a pagar', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cfo-agent-boleto').length === 3);
    for (const width of [360, 390, 430]) { await page.setViewportSize({ width, height: 850 }); assert.equal(await page.locator('.cfo-agent-drawer').evaluate(el => el.scrollWidth > el.clientWidth), false); }
    await page.locator('.cfo-agent-close').click();
    await page.evaluate(({ two, three, purchase }) => {
      const key = Object.keys(localStorage).find(k => k.startsWith('brutt:cfo-boletos:v1:') && !k.endsWith(':aviso-2dias'));
      const bills = JSON.parse(localStorage.getItem(key));
      bills.push({ id: 'two-days', fornecedor: 'Em dois dias', dataCompra: purchase, dataVencimento: two, valor: 50, status: 'aberto' }, { id: 'three-days', fornecedor: 'Em três dias', dataCompra: purchase, dataVencimento: three, valor: 70, status: 'aberto' });
      localStorage.setItem(key, JSON.stringify(bills));
    }, { two: date(2), three: date(3), purchase: date(-10) });
    await page.reload();
    await page.locator('.cfo-agent-bill-alert').waitFor();
    const notice = await page.locator('.cfo-agent-bill-alert').innerText();
    assert(notice.includes('Em dois dias') && notice.includes('Vencido'));
    assert(!notice.includes('Em três dias') && !notice.includes('Distante') && !notice.includes('Hoje'));
    assert.equal(await page.locator('.cfo-agent-bill-alert li').count(), 2);
    assert(notice.includes('60,00'));
    for (const width of [360, 390, 430]) { await page.setViewportSize({ width, height: 850 }); assert.equal(await page.locator('.cfo-agent-bill-alert').evaluate(el => el.scrollWidth > el.clientWidth), false); }
    await page.getByRole('button', { name: 'Dispensar por hoje' }).click();
    await page.reload(); await page.locator('#eqSim').waitFor();
    await page.evaluate(async () => { const { CfoAgentDrawer } = await import('/admin/cfo-agent-drawer.js?v=20261119c'); await CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions); });
    assert.equal(await page.locator('.cfo-agent-bill-alert').count(), 0);
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.endsWith(':aviso-2dias'));
      localStorage.removeItem(key); window.dispatchEvent(new Event('focus'));
    });
    await page.locator('.cfo-agent-bill-alert').waitFor();
    await page.getByRole('button', { name: 'Ver boletos', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cfo-agent-boletos').open);
    await page.getByRole('button', { name: 'Marcar Pago: Em dois dias', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cfo-agent-bill-alert li').length === 1);
    await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
    assert.equal(await page.locator('.cfo-agent-message').count(), 0);
    assert.equal(await page.locator('.cfo-agent-empty').count(), 1);
    mode = 'wait'; await page.locator('#cfo-agent-question').fill('Descartar consulta'); await page.locator('.cfo-agent-send').click();
    await page.getByRole('button', { name: 'Nova conversa', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.cfo-agent-send').disabled);
    assert.equal(await page.locator('.cfo-agent-message').count(), 0);
    assert((await page.locator('.cfo-agent-status').textContent()).includes('boletos foram mantidos'));
    mode = 'formatted'; await page.locator('#cfo-agent-question').fill('Como está o ritmo para fechar o mês?'); await page.locator('.cfo-agent-send').click(); await page.locator('.cfo-agent-assistant').waitFor();
    assert.equal(requests.at(-1).messages.length, 1);
    assert.equal(requests.at(-1).financialContext.boletosAbertos.length, 4);
    await page.locator('.cfo-agent-context').evaluate(el => el.open = false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.cfo-agent-log').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: 'work/cfo-agent-desktop.png' });
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await page.locator('.cfo-agent-drawer').evaluate(el => el.scrollWidth > el.clientWidth), false);
      const rect = await page.locator('.cfo-agent-send').boundingBox(); assert(rect.y >= 0 && rect.y + rect.height <= 850);
    }
    await page.locator('.cfo-agent-log').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: 'work/cfo-agent-mobile.png' });
    await page.evaluate(() => localStorage.setItem(Object.keys(localStorage).find(k => k.startsWith('brutt:cfo-boletos:')), '{invalid'));
    await page.locator('#cfo-agent-question').fill('Teste de armazenamento inválido'); await page.locator('.cfo-agent-send').click();
    await page.waitForFunction(() => document.querySelector('.cfo-agent-status').textContent.includes('consulta foi interrompida'));
    assert(await page.locator('.cfo-agent-boleto-form fieldset').evaluate(el => el.disabled));
    assert.deepEqual(errors, []);
    console.log('CFO UI: indicadores, simulador, chat seguro, erro/retry, cancelamento, foco, navegação e 360/390/430px OK. Nenhuma escrita.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
