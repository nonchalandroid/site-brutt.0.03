// Abre o HTML completo: antiFrame, folhas de estilo, bibliotecas, boot,
// menu e consultas. Apenas o cliente Supabase é simulado; não usa produção.
// Executar na raiz: node scripts/estoque-ui.test.cjs (Playwright + Chromium).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const categories = [
  { id: 'agua', name: 'Água', slug: 'agua' },
  { id: 'head', name: 'Headshop', slug: 'headshop' },
  { id: 'narg', name: 'Narguilé', slug: 'narguile' },
  { id: 'ess', name: 'Essências', slug: 'essencias' }
];
const examples = [
  ['Narguile de Termoplástico Dourado', '000119', 'narg'],
  ['Água Mineral Gás Terê', '000817', 'agua'],
  ['Anel de Silicone Sadhu', '000363', 'head'],
  ['Bolador Lion Rolling Circus', '000281', 'head'],
  ['Bong Acrílico Grande Verde', '000436', 'head'],
  ['Bong Acrílico Laranja Grande', '000435', 'head'],
  ['Bong Vidro Simples Torcido Grande 26 cm', '000604', 'head'],
  ['Carvão Coco Brasil 250 g', '000192', 'narg'],
  ['Essência Ziggy Fresh Watermelon', '000209', 'ess'],
  ['Narguile Dubai Prata com Mala de Transporte', '000503', 'narg'],
  ['Essência Zomo Strong Mint', '000931', 'ess'],
  ['Piteira de Vidro Sadhu Longa', '000612', 'head']
];
const products = Array.from({ length: 85 }, (_, i) => {
  const [name, sku, category_id] = examples[i % examples.length];
  return {
    id: 'p' + i, site_product_id: i === 14 ? 'adm-14' : 'p' + i,
    sku: i < examples.length ? sku : String(1000 + i).padStart(6, '0'),
    name: name + (i < examples.length ? '' : ' · ' + (i + 1)), category_id,
    stock: i < 7 ? 0 : i === 7 ? 4 : i % 5 === 0 ? 120 : i % 3 === 0 ? 8 : 24,
    price: category_id === 'narg' ? 100 : 18, promo_price: null,
    cost_price: i === 1 || i === 14 ? null : category_id === 'narg' ? 65 : 9,
    sales_count: i % 5 === 0 ? 0 : 30, is_active: i !== 84,
    ean: i === 8 ? '7891234567890' : null, brand: 'Brutt', icon: '📦',
    description: '', specs: [], flavor_profile: null, whisky_details: null
  };
});

function mockClient() {
  const session = { user: { id: 'test-user' }, access_token: 'test-only' };
  window.__mockState = { missingPeriod: false, failProducts: false, productWrites: 0 };
  function from(table) {
    let equals = [], single = false, options = {};
    const q = {
      select(_columns, opts = {}) { options = opts; return q; },
      eq(key, val) { equals.push([key, val]); return q; },
      order() { return q; }, limit() { return q; }, not() { return q; },
      lt() { return q; }, lte() { return q; }, gt() { return q; },
      gte() { return q; }, is() { return q; }, in() { return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update() { window.__mockState.productWrites++; return q; },
      then(resolve, reject) {
        let data = [];
        if (table === 'staff') data = [{ user_id: 'test-user', role: 'owner', name: 'Gestão Brutt', active: true }];
        if (table === 'categories') data = window.__categories;
        if (table === 'products') {
          if (window.__mockState.failProducts) return Promise.resolve({ error: { message: 'Falha simulada' }, data: null }).then(resolve, reject);
          data = window.__products.filter(p => equals.every(([k, v]) => p[k] === v));
        }
        if (table === 'vendas_periodo' && !window.__mockState.missingPeriod) data = [{ id: 1, inicio: '2026-09-18', fim: '2026-10-17', dias: 30 }];
        if (table === 'nex_sync_log') data = [{ ok: true, modo: 'real', ran_at: new Date().toISOString(), detalhe: { resumo: { sem_par_site: 20, conflitos: 2 } } }];
        return Promise.resolve({ data: options.head ? null : single ? data[0] || null : data, count: options.count ? data.length : null, error: null }).then(resolve, reject);
      }
    };
    return q;
  }
  window.supabase = { createClient: () => ({ from, auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user: session.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  } }) };
}

(async () => {
  fs.mkdirSync('work', { recursive: true });
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1536, height: 1060 } });
    page.setDefaultTimeout(10000);
    const errors = [], attemptedProduction = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', route => {
      if (route.request().url().includes('supabase.co')) attemptedProduction.push(route.request().url());
      return route.abort();
    });
    await page.route('**/vendor/supabase-js-2.117.2.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `window.__products=${JSON.stringify(products)};window.__categories=${JSON.stringify(categories)};(${mockClient.toString()})();`
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/#/estoque-baixo`);
    await page.locator('#estRows tr').first().waitFor();
    assert.equal(await page.locator('#antiFrame').count(), 0, 'o bloco temporário foi removido pelo script real');
    assert.equal(await page.locator('.est-kpis').evaluate(el => getComputedStyle(el).display), 'grid', 'CSS deve continuar ativo após o boot');
    assert.equal(await page.locator('.est-toolbar').evaluate(el => getComputedStyle(el).display), 'grid');
    assert.equal(await page.locator('.est-product-name').first().evaluate(el => getComputedStyle(el).display), 'block', 'nome e metadados não podem ficar colados');
    assert.equal(await page.locator('#estRows tr').count(), 40);
    await page.screenshot({ path: 'work/estoque-redesign-desktop.png' });
    await page.locator('#estBusca').fill('000119');
    assert.equal(await page.locator('#estRows tr').count(), 1);
    assert((await page.locator('#estRows').innerText()).includes('Dourado'));
    await page.getByRole('button', { name: 'Conferir / ajustar Narguile de Termoplástico Dourado', exact: true }).click();
    await page.locator('#mvQty').waitFor();
    assert((await page.locator('.drawer').innerText()).includes('Narguile de Termoplástico Dourado'));
    await page.locator('[data-close]').first().click();
    await page.locator('#estLimpar').click();
    await page.locator('#estNext').click();
    assert.equal(await page.locator('#estPage').innerText(), 'Página 2 de 3');
    await page.locator('[data-est-filtro="sem-custo"]').click();
    assert.equal(await page.locator('#estRows tr').count(), 1);
    await page.locator('#estLimpar').click();
    await page.locator('#estOrigem').selectOption('manual');
    assert.equal(await page.locator('#estRows tr').count(), 1);
    await page.locator('#estLimpar').click();
    await page.locator('#estBusca').fill('7891234567890');
    assert.equal(await page.locator('#estRows tr').count(), 1);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#estExport').click();
    const downloaded = await downloadPromise;
    assert.equal(downloaded.suggestedFilename(), 'estoque-filtrado.csv');
    await downloaded.saveAs('work/estoque-test-export.csv');
    assert(fs.readFileSync('work/estoque-test-export.csv', 'utf8').includes('7891234567890'));
    await page.locator('#estLimpar').click();
    await page.locator('#estBusca').fill('produto inexistente');
    assert((await page.locator('#estRows').innerText()).includes('Nenhum produto encontrado'));
    await page.locator('#estLimpar').click();
    await page.locator('.est-quality summary').click();
    assert((await page.locator('.est-quality').innerText()).includes('Histórico desatualizado'));
    await page.locator('.est-quality summary').click();
    for (const width of [1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `sem overflow em ${width}px`);
      if (width === 1024) await page.screenshot({ path: 'work/estoque-redesign-1024.png' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'work/estoque-redesign-mobile.png' });
    await page.locator('.est-work').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 65));
    await page.screenshot({ path: 'work/estoque-redesign-mobile-lista.png' });
    assert.equal(await page.locator('#estRows tr').first().evaluate(el => getComputedStyle(el).display), 'grid');
    await page.evaluate(() => { window.__mockState.missingPeriod = true; });
    await page.locator('#estRefresh').click();
    await page.locator('#estRows tr').first().waitFor();
    assert((await page.locator('#estBody').innerText()).includes('Sem relatório de vendas'));
    assert.equal(await page.locator('[data-est-kpi="critico"] strong').innerText(), '0');
    await page.evaluate(() => { window.__mockState.failProducts = true; });
    await page.locator('#estRefresh').click();
    await page.getByText('Não foi possível carregar os saldos.', { exact: false }).waitFor();
    assert.equal(await page.locator('#estExport').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__mockState.productWrites), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(attemptedProduction, []);
    console.log('OK: HTML completo + antiFrame + CSS persistente; busca, filtros, ficha, paginação, exportação, estados vazio/erro/sem histórico e cinco larguras. Nenhuma chamada à produção.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
