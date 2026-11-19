const months = new WeakMap();
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function shiftMonth(period, offset) {
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)) - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}
export function buildMonthSeries(period, data) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Mês inválido.');
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5)) - 1;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(), projected = period > data.currentPeriod;
  const rows = data.dailySales.filter(row => String(row.dia).startsWith(period + '-') && Number.isFinite(Number(row.faturamento))).sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
  const actualGross = !projected && rows.length > 0 && rows.every(row => row.lucro_bruto != null && String(row.lucro_bruto).trim() !== '' && Number.isFinite(Number(row.lucro_bruto)));
  let revenue = 0, gross = 0; const points = [{ day: 0, revenue: 0, result: -data.cost }];
  if (projected) {
    for (let day = 1; day <= days; day++) { const weekday = new Date(Date.UTC(year, month, day)).getUTCDay(); revenue += data.rhythm * (data.weights[weekday] ?? 1); gross = revenue * data.margin; points.push({ day, revenue, result: gross - data.cost }); }
  } else {
    for (const row of rows) { revenue += Number(row.faturamento); gross += actualGross ? Number(row.lucro_bruto) : Number(row.faturamento) * data.margin; points.push({ day: Number(String(row.dia).slice(8, 10)), revenue, result: gross - data.cost }); }
  }
  return { period, days, projected, actualGross, rows, points, revenue, result: gross - data.cost, hasData: projected || rows.length > 0 };
}
function svgNode(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node;
}
function drawMonth(panel, period, data) {
  panel.replaceChildren();
  const series = buildMonthSeries(period, data), name = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(period + '-01T12:00:00Z'));
  panel.append(el('h4', name + (series.projected ? ' · projeção' : ' · dados importados')));
  if (!series.hasData) { panel.append(el('p', 'Não há vendas importadas para este mês. Ausência de dados não significa faturamento zero.')); return; }
  const stats = el('div'); stats.className = 'cfo-month-stats';
  stats.append(el('p', `${series.projected ? 'Vendas projetadas' : 'Faturamento importado'}: ${money(series.revenue)}`), el('p', `${series.projected ? 'Resultado projetado' : 'Resultado estimado com custos atuais'}: ${money(series.result)}`)); panel.append(stats);
  const width = Math.max(280, Math.min(1000, panel.clientWidth || 760)), height = 270, pad = { left: 66, right: 16, top: 18, bottom: 34 };
  const low = Math.min(0, ...series.points.map(p => p.result)), high = Math.max(1, data.cost / data.margin, ...series.points.map(p => p.revenue));
  const x = day => pad.left + day / series.days * (width - pad.left - pad.right), y = value => height - pad.bottom - (value - low) / (high - low) * (height - pad.top - pad.bottom);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${name}: ${series.projected ? 'projeção de vendas' : 'vendas importadas'} ${money(series.revenue)}. Resultado ${series.projected ? 'projetado' : 'estimado'} ${money(series.result)}.` });
  for (let i = 0; i <= 4; i++) { const value = low + (high - low) * i / 4; svg.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), stroke: '#554656', 'stroke-width': .7 })); const text = svgNode('text', { x: pad.left - 9, y: y(value) + 4, 'text-anchor': 'end', fill: '#cabfd0', 'font-size': 11 }); text.textContent = Math.round(value).toLocaleString('pt-BR'); svg.append(text); }
  for (const day of [1, Math.round(series.days / 2), series.days]) { const text = svgNode('text', { x: x(day), y: height - 10, 'text-anchor': 'middle', fill: '#cabfd0', 'font-size': 12 }); text.textContent = `${day}/${period.slice(5)}`; svg.append(text); }
  const equilibrium = data.cost / data.margin;
  svg.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y(equilibrium), y2: y(equilibrium), stroke: '#32c7d1', 'stroke-dasharray': '5 5' }));
  for (const [key, color] of [['revenue', '#efbf5b'], ['result', '#ef8198']]) {
    svg.append(svgNode('polyline', { points: series.points.map(p => `${x(p.day)},${y(p[key])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, ...(series.projected ? { 'stroke-dasharray': '6 5' } : {}) }));
  }
  panel.append(svg);
  panel.append(el('p', 'Dourado: faturamento • Rosa: resultado estimado • Azul: equilíbrio usando custos e margem atuais.'));
  panel.append(el('p', series.projected ? `Cenário no ritmo atual do simulador (${money(data.rhythm)}/dia), com os pesos dos dias da semana, margem e custos atuais. Não representa recebimentos garantidos nem caixa disponível.` : `${series.rows.length} dia(s) com registro, de ${String(series.rows[0].dia).slice(0, 10).split('-').reverse().join('/')} a ${String(series.rows.at(-1).dia).slice(0, 10).split('-').reverse().join('/')}. Lacunas não confirmam ausência de vendas. ${series.actualGross ? 'Lucro bruto importado' : 'Margem atual aplicada como hipótese'} menos custos atuais: não há confirmação dos custos históricos.`));
}
export function mountMonthNavigation(term, data) {
  if (!data || !(data.margin > 0)) return;
  let state = months.get(term);
  if (!state) {
    const nav = el('div'); nav.className = 'cfo-month-navigation';
    const previous = el('button', '‹'), next = el('button', '›'), current = el('button', 'Mês atual'); previous.type = next.type = current.type = 'button'; previous.setAttribute('aria-label', 'Mês anterior'); next.setAttribute('aria-label', 'Próximo mês');
    const label = el('label', 'Período financeiro '), input = el('input'); input.type = 'month'; input.min = '2000-01'; input.max = '2100-12'; label.append(input);
    const panel = el('section'); panel.className = 'cfo-month-chart'; panel.hidden = true;
    nav.append(previous, label, next, current); term.querySelector('.eq-relogio').after(nav); term.querySelector('.eq-graf').before(panel);
    state = { period: data.currentPeriod, panel, input, previous, next, current, saved: null, signature: '' }; months.set(term, state);
    if (window.ResizeObserver) { const observer = new ResizeObserver(() => { if (!term.isConnected) { observer.disconnect(); return; } if (state.data && state.period !== state.data.currentPeriod && Math.abs(panel.clientWidth - (state.width || 0)) > 8) { state.width = panel.clientWidth; drawMonth(panel, state.period, state.data); } }); observer.observe(term); }
    const change = period => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period < input.min || period > input.max) return; state.period = period; mountMonthNavigation(term, state.data); term.dispatchEvent(new CustomEvent('cfo-month-change')); };
    input.onchange = () => change(input.value); previous.onclick = () => change(shiftMonth(state.period, -1)); next.onclick = () => change(shiftMonth(state.period, 1)); current.onclick = () => change(state.data.currentPeriod);
  }
  state.data = data;
  const signature = JSON.stringify([state.period, data.currentPeriod, data.rhythm, data.margin, data.cost, data.weights]);
  if (signature === state.signature && state.source === data.dailySales) return; state.signature = signature; state.source = data.dailySales;
  state.input.value = state.period; state.previous.disabled = state.period <= state.input.min; state.next.disabled = state.period >= state.input.max; state.current.disabled = state.period === data.currentPeriod;
  term.dataset.cfoPeriod = state.period;
  const native = state.period === data.currentPeriod;
  if (!native && !state.saved) state.saved = [...term.querySelectorAll('.eq-graf,.eq-chips,.eq-leg2,.eq-placar,.eq-3m,.eq-sim,.eq-zoom')].map(node => [node, node.hidden]);
  if (!native) { state.saved.forEach(([node]) => node.hidden = true); state.panel.hidden = false; state.width = state.panel.clientWidth; drawMonth(state.panel, state.period, data); }
  else { state.panel.hidden = true; if (state.saved) state.saved.forEach(([node, hidden]) => node.hidden = hidden); state.saved = null; }
}
