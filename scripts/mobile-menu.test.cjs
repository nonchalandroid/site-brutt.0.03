const { chromium, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');

const cats = [
  ['e', 'Essências', 'essencias'], ['ez', 'Ziggy', 'essencias-ziggy', 'e'], ['en', 'Nay', 'essencias-nay', 'e'],
  ['n', 'Narguilé', 'narguile'], ['nn', 'Narguiles', 'narguile-narguiles', 'n'], ['nc', 'Carvão', 'narguile-carvao', 'n'],
  ['h', 'Headshop', 'headshop'], ['hs', 'Sedas', 'headshop-sedas', 'h'], ['hp', 'Piteiras', 'headshop-piteiras', 'h'],
  ['t', 'Tabacos', 'tabacos'], ['tp', 'Pacotes', 'tabacos-pacotes', 't'], ['tf', 'Filtros', 'tabacos-filtros', 't'],
  ['c', 'Charutos', 'charutos'], ['ci', 'Cigarros', 'cigarros'], ['p', 'Cigarros de Palha', 'palha'],
  ['b', 'Bebidas', 'bebidas'], ['bc', 'Cervejas', 'bebidas-cervejas', 'b'], ['bg', 'Gin', 'bebidas-gin', 'b'],
  ['i', 'Isqueiros', 'isqueiros'], ['d', 'Doces', 'doces']
].map(([id, name, slug, parent_id]) => ({ id, name, slug, parent_id: parent_id || null }));
const products = [
  ['Ziggy Melancia', 'ez'], ['Nay Manga Banana', 'en'], ['Narguilé Al Farid Storm', 'nn'], ['Carvão Coco Brasil', 'nc'],
  ['Seda Smoking', 'hs'], ['Piteira Bem Bolado', 'hp'], ['Tabaco Jungle', 'tp'], ['Filtro Papelito', 'tf'],
  ['Charuto Dona Flor', 'c'], ['Cigarro Lucky Strike', 'ci'], ['Cigarro de Palha', 'p'], ['Cerveja Heineken', 'bc'],
  ['Gin Rocks', 'bg'], ['Isqueiro Bic', 'i'], ['Bala Halls', 'd']
].map(([name, category_id], i) => ({ id: i, site_product_id: 'test-' + i, sku: 'X' + i, name, category_id, price: 25, stock: 5, is_active: true, is_featured: true }));
const fixture = process.env.BRUTT_CATALOGO_FIXTURE
  ? JSON.parse(fs.readFileSync(process.env.BRUTT_CATALOGO_FIXTURE, 'utf8'))
  : [products, cats, [], [{ config: { effects: { mode: 'leve', scrollSnap: false } } }]];

(async () => {
  fs.mkdirSync('work', { recursive: true });
  const root = process.cwd(), pages = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname, file = path.resolve(root, '.' + pathname);
    const safe = file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile();
    const target = safe ? file : path.join(root, 'index.html');
    res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    res.end(fs.readFileSync(target));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    async function openPage(width, reducedMotion = 'no-preference', config) {
      const page = await browser.newPage({ ...(width <= 640 ? devices['iPhone 13'] : {}), viewport: { width, height: 844 }, deviceScaleFactor: 1, reducedMotion });
      pages.push(page);
      page.setDefaultTimeout(8000);
      page.errors = [];
      page.on('pageerror', e => page.errors.push(e.message));
      await page.addInitScript(() => {
        localStorage.setItem('brutt_18', 'true');
        localStorage.setItem('brutt_fx', JSON.stringify({ v: 'leve', t: Date.now() }));
      });
      await page.route('https://**/*', route => {
        const url = new URL(route.request().url());
        const i = ['products', 'categories', 'product_images', 'site_cms_config'].indexOf(url.pathname.split('/').pop());
        if (url.pathname.startsWith('/rest/v1/') && i >= 0)
          return route.fulfill({ json: config && i === 3 ? [{ config }] : fixture[i] });
        if (process.env.BRUTT_CATALOGO_FIXTURE && route.request().resourceType() === 'image') return route.continue();
        return route.abort();
      });
      await page.goto(base);
      await page.waitForFunction(() => typeof MENU !== 'undefined' && MENU.length > 3);
      return page;
    }
    const waitIdle = page => page.waitForFunction(() => {
      const m = document.getElementById('dockMenu');
      return m.getAnimations({ subtree: true }).every(a => a.playState !== 'running');
    });
    const widths = process.env.MENU_TEST_WIDTHS === 'none' ? [] :
      process.env.MENU_TEST_WIDTHS ? process.env.MENU_TEST_WIDTHS.split(',').map(Number) : [360, 390, 430];
    for (const width of widths) {
      const page = await openPage(width), menu = page.locator('#dockMenu'), trigger = page.locator('[data-dock=menu]');
      await page.screenshot({ path: 'work/menu-' + width + '-fechado.png', animations: 'disabled' });
      await page.evaluate(() => { window.scrollTo({ top: 500, behavior: 'instant' }); });
      const y = await page.evaluate(() => scrollY);
      await trigger.click();
      const opening = await menu.evaluate(el => el.getAnimations().find(a => a.effect.target === el)?.effect.getKeyframes());
      assert(opening?.[0].transform.includes('scale(') && opening.at(-1).transform.includes('scale(1)'), 'abertura expande a partir do botão');
      await waitIdle(page);
      await page.screenshot({ path: 'work/menu-' + width + '-recolhido.png', animations: 'disabled' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert(await menu.getByRole('button', { name: 'Fechar menu' }).evaluate(el => el === document.activeElement));
      const geometry = await menu.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight };
      });
      assert(geometry.left >= 0 && geometry.right <= geometry.width && geometry.top >= 0 && geometry.bottom <= geometry.height);
      const groups = menu.locator('.dock-category-toggle');
      const first = groups.first(), second = groups.nth(1);
      await first.click(); await waitIdle(page);
      assert.equal(await first.getAttribute('aria-expanded'), 'true');
      assert.equal(await menu.locator('.dock-category-panel:not([hidden])').count(), 1);
      assert.equal(await menu.locator('.dock-category-panel:not([hidden]) a').first().innerText(), 'Ver todos');
      assert(await menu.locator('.dock-category-panel[hidden]').evaluateAll(els => els.every(el => el.inert)));
      if (width === 390) await page.screenshot({ path: 'work/menu-390-expandido.png', animations: 'disabled' });
      await second.click(); await waitIdle(page);
      assert.equal(await first.getAttribute('aria-expanded'), 'false');
      assert.equal(await menu.locator('.dock-category-panel:not([hidden])').count(), 1);
      await second.click(); await waitIdle(page);
      assert.equal(await menu.locator('.dock-category-panel:not([hidden])').count(), 0);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.dock-category-toggle')];
        for (let i = 0; i < 20; i++) b[i % 2].click();
      });
      await waitIdle(page);
      assert((await menu.locator('.dock-category-toggle[aria-expanded=true]').count()) <= 1);
      const more = menu.getByRole('button', { name: 'Mais', exact: true });
      if (await more.count()) {
        await more.click(); await waitIdle(page);
        assert(await menu.locator('.dock-category-panel:not([hidden])').getByRole('link', { name: 'Doces', exact: true }).count());
      }
      const list = menu.locator('.dock-menu-links');
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.equal(await page.evaluate(() => scrollY), 0, 'a página permanece travada enquanto a lista rola');
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.getElementById('dockMenu').contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      assert(Math.abs(await page.evaluate(() => scrollY) - y) <= 1, 'fechar restaura a posição');
      assert(await trigger.evaluate(el => el === document.activeElement));
      await trigger.click(); await waitIdle(page);
      await page.mouse.click(3, 3);
      await menu.waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        document.querySelector('[data-dock=menu]').click();
        document.querySelector('[data-menu-close]').click();
      });
      await menu.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-locked')), false);
      await trigger.click(); await waitIdle(page);
      await menu.getByRole('button', { name: 'Fechar menu' }).click();
      // The closing animation actually converges on the dock action.
      const target = await trigger.boundingBox();
      const end = await menu.evaluate(el => {
        const frames = el.getAnimations().find(a => a.effect.target === el).effect.getKeyframes();
        return frames.at(-1).transform;
      });
      assert(end.includes('scale(') && target.width > 0);
      await menu.waitFor({ state: 'hidden' });
      await trigger.click(); await waitIdle(page);
      const head = menu.getByRole('button', { name: 'Headshop', exact: true });
      await head.click(); await waitIdle(page);
      await page.evaluate(() => {
        window.navCalls = 0;
        const original = window.irParaSecao;
        window.irParaSecao = function(...args) { window.navCalls++; return original(...args); };
      });
      await menu.getByRole('link', { name: 'Sedas', exact: true }).click();
      await menu.waitFor({ state: 'hidden' });
      await page.waitForURL('**/headshop/sedas');
      assert.equal(await page.evaluate(() => window.navCalls), 1);
      assert.equal(await page.evaluate(() => chip.headshop), 'Sedas');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await trigger.click(); await waitIdle(page);
      await menu.getByRole('button', { name: 'Headshop', exact: true }).click(); await waitIdle(page);
      await menu.locator('.dock-category-panel:not([hidden])').getByRole('link', { name: 'Ver todos' }).click();
      await page.waitForURL('**/headshop');
      assert.equal(await page.evaluate(() => chip.headshop), '');
      assert.deepEqual(page.errors, []);
      console.log(width + 'px: acordeão, cliques rápidos, foco, rolagem, posição, três fechamentos e navegação OK');
      await page.close();
    }
    const reduced = await openPage(390, 'reduce');
    await reduced.locator('[data-dock=menu]').click();
    await reduced.locator('.dock-category-toggle').first().click();
    assert.equal(await reduced.locator('#dockMenu').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length), 0);
    await reduced.keyboard.press('Escape');
    assert.equal(await reduced.locator('#dockMenu').evaluate(el => el.open), false);
    const config = { sections: [{ id: 'headshop', visible: false }], menuItems: [{ id: 'essencias', label: 'Nossas essências' }], effects: { mode: 'leve', scrollSnap: false } };
    const cms = await openPage(390, 'reduce', config);
    await cms.locator('[data-dock=menu]').click();
    assert.equal(await cms.locator('#dockMenu').getByRole('button', { name: 'Headshop', exact: true }).count(), 0);
    assert.equal(await cms.locator('#dockMenu').getByRole('button', { name: 'Nossas essências', exact: true }).count(), 1);
    await cms.setViewportSize({ width: 1366, height: 900 });
    await cms.locator('#dockMenu').waitFor({ state: 'hidden' });
    assert.equal(await cms.evaluate(() => document.documentElement.classList.contains('is-locked')), false);
    assert.equal(await cms.locator('#bruttDock').isVisible(), false);
    console.log('Movimento reduzido, CMS e mudança para desktop OK');
    for (const width of [360, 390, 430, 1366]) {
      const page = await openPage(width, 'reduce'), q = page.locator('#q'), field = page.locator('header .search');
      const before = await q.boundingBox();
      await page.screenshot({path: 'work/busca-glass-' + width + '.png', animations: 'disabled'});
      await q.fill('Ziggy');
      await page.locator('#results.on [data-add]').first().waitFor();
      const after = await q.boundingBox();
      assert.equal(after.width, before.width);
      assert.equal(after.height, before.height);
      assert.equal(await field.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      assert.equal(await field.evaluate(el => getComputedStyle(el, '::after').pointerEvents), 'none');
      assert.equal(await q.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      await q.fill('');
      await page.waitForFunction(() => !document.getElementById('results').classList.contains('on'));
      await page.emulateMedia({forcedColors:'active'});
      assert.equal(await field.evaluate(el => getComputedStyle(el, '::after').display), 'none');
      assert.deepEqual(page.errors, []);
      await page.close();
    }
    console.log('Busca glass: mobile/desktop, resultados, foco, dimensões estáveis e alto contraste OK');
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
