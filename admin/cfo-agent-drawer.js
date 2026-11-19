import { financialEstimate, parseAmount } from './cfo-financial.js';
import { mountMonthNavigation } from './cfo-month-chart.js';
const QUESTIONS = ['Quanto falta para atingir o ponto de equilíbrio?', 'Como está o ritmo para fechar o mês?', 'Simular uma despesa com vencimento em 30 dias', 'Analisar impacto dos boletos próximos', 'Qual nossa folga financeira condicionada hoje?', 'Simular compromisso de despesa em 15/30 dias'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validBoleto = b => b && typeof b.id === 'string' && b.id.length <= 80 && typeof b.fornecedor === 'string' && b.fornecedor.trim().length > 0 && b.fornecedor.length <= 100 && validDate(b.dataCompra) && validDate(b.dataVencimento) && b.dataVencimento >= b.dataCompra && typeof b.valor === 'number' && Number.isFinite(b.valor) && b.valor > 0 && b.valor <= 1e9 && Math.abs(b.valor * 100 - Math.round(b.valor * 100)) < .0001 && ['aberto', 'pago'].includes(b.status);
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = { faturamentoAtual: 'Faturamento importado', faturamentoProjetado: 'Fechamento projetado', margemBrutaPct: 'Margem bruta', custosFixos: 'Custos fixos', diaAtual: 'Dia atual', pontoEquilibrio: 'Ponto de equilíbrio', faltaParaEmpatar: 'Faturamento que falta', ritmoDiarioSimulado: 'Ritmo diário simulado' };
function element(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function inlineText(target, text) {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|R\$\s*[\d.]+(?:,\d{1,2})?/g; let start = 0;
  for (const match of text.matchAll(pattern)) {
    target.append(document.createTextNode(text.slice(start, match.index)));
    const node = element(match[1] ? 'strong' : match[2] ? 'code' : 'span', match[1] || match[2] ? '' : 'cfo-agent-amount', match[1] || match[2] || match[0]); target.append(node); start = match.index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(start)));
}
export function renderFinancialAnswer(target, text) {
  const lines = text.replace(/\r/g, '').split('\n'); let list = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) { list = null; continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const wrap = element('div', 'cfo-agent-table'), table = element('table', ''); table.setAttribute('aria-label', 'Comparação financeira');
      const cells = value => value.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
      const head = element('thead', ''), tr = element('tr', '');
      cells(line).forEach(value => { const cell = element('th', ''); cell.scope = 'col'; inlineText(cell, value); tr.append(cell); }); head.append(tr); table.append(head);
      const body = element('tbody', ''); i += 2;
      for (; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) { const row = element('tr', ''); cells(lines[i].trim()).forEach(value => { const cell = element('td', ''); inlineText(cell, value); row.append(cell); }); body.append(row); }
      i--; table.append(body); wrap.append(table); target.append(wrap); list = null; continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/), bullet = line.match(/^([-*•]|\d+[.)])\s+(.+)$/);
    if (heading) { const title = element('h3', ''); inlineText(title, heading[1]); target.append(title); list = null; }
    else if (bullet) { const tag = /^\d/.test(bullet[1]) ? 'ol' : 'ul'; if (!list || list.localName !== tag) { list = element(tag, ''); target.append(list); } const item = element('li', ''); inlineText(item, bullet[2]); list.append(item); }
    else if (/^[-*_]{3,}$/.test(line)) { target.append(element('hr', '')); list = null; }
    else { const paragraph = element('p', line.startsWith('> ') ? 'cfo-agent-callout' : ''); inlineText(paragraph, line.replace(/^>\s?/, '')); target.append(paragraph); list = null; }
  }
}
function ensureStyles() {
  if (document.querySelector('link[data-cfo-styles]')) return;
  const css = element('link', ''); css.rel = 'stylesheet'; css.dataset.cfoStyles = ''; css.href = new URL('./cfo-agent-drawer.css?v=20261119e', import.meta.url).href; document.head.append(css);
}

export class CfoAgentDrawer {
  static instance;
  static async notify(options) {
    if (!options?.anchor?.isConnected) return;
    this.alertOptions = options;
    try {
      const { data: { session } } = await options.client.auth.getSession();
      if (!options.anchor.isConnected || !session?.user?.id) return;
      const key = 'brutt:cfo-boletos:v1:' + options.url + ':' + session.user.id;
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      const container = options.anchor.closest('.pg'), previous = container.querySelector('.cfo-agent-bill-alert');
      previous?.remove();
      if (!Array.isArray(rows) || rows.length > 100 || rows.some(b => !validBoleto(b) || (b.pagoEm !== undefined && !validDate(b.pagoEm)))) { container.querySelector('.cfo-chart-bills')?.remove(); this.billData = null; return; }
      this.billData = { options, rows }; this.renderChartBills();
      const root = container.querySelector('#ovLucro');
      if (root && this.billWatchRoot !== root) {
        this.billWatch?.disconnect(); this.billWatchRoot = root;
        this.billWatch = new MutationObserver(records => { if (!options.anchor.isConnected) { this.billWatch.disconnect(); return; } if (records.some(r => !r.target.closest?.('.cfo-chart-bills'))) this.renderChartBills(); });
        this.billWatch.observe(root, { childList: true, subtree: true });
      }
      const now = Date.parse(today());
      const due = rows.filter(b => b.status === 'aberto' && Date.parse(b.dataVencimento) <= now + 2 * 86400000).sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
      if (!due.length) return;
      const signature = JSON.stringify([today(), due.map(b => [b.id, b.dataVencimento, b.valor, b.fornecedor])]);
      const dismissKey = key + ':aviso-2dias';
      if (localStorage.getItem(dismissKey) === signature) return;
      ensureStyles();
      const alert = element('section', 'cfo-agent-bill-alert'); alert.setAttribute('role', 'status'); alert.setAttribute('aria-label', 'Aviso de vencimento de boletos');
      alert.append(element('strong', '', `${due.length} boleto${due.length === 1 ? '' : 's'}: vencidos ou vencendo em até 2 dias • ${money(due.reduce((sum, b) => sum + b.valor, 0))}`));
      const list = element('ul', '');
      for (const b of due) list.append(element('li', '', `${b.fornecedor} • ${money(b.valor)} • ${b.dataVencimento.split('-').reverse().join('/')} (${b.dataVencimento < today() ? 'vencido' : b.dataVencimento === today() ? 'vence hoje' : 'próximo do vencimento'})`));
      alert.append(list);
      const view = element('button', '', 'Ver boletos'); view.type = 'button'; view.onclick = () => { this.open(options); this.instance.selectView('contas'); this.instance.boletosBlock.open = true; };
      const dismiss = element('button', '', 'Dispensar por hoje'); dismiss.type = 'button'; dismiss.onclick = () => { try { localStorage.setItem(dismissKey, signature); alert.remove(); } catch { dismiss.textContent = 'Não foi possível salvar a dispensa'; } };
      alert.append(view, dismiss); container.querySelector('#ovLucro')?.before(alert);
    } catch { this.billData = null; options.anchor.closest('.pg')?.querySelector('.cfo-chart-bills')?.remove(); }
  }
  static renderChartBills() {
    const data = this.billData; if (!data?.options.anchor.isConnected) return;
    const { options, rows } = data, term = options.anchor.closest('.pg').querySelector('#lcGraf .eq-term'); if (!term) return;
    if (!term._cfoMonthBound) { term._cfoMonthBound = true; term.addEventListener('cfo-month-change', () => this.renderChartBills()); }
    mountMonthNavigation(term, term.cfoMonthData);
    const period = term.dataset.cfoPeriod || term.cfoContext?.meta.periodo || today().slice(0, 7);
    let panel = term.querySelector('.cfo-chart-bills');
    const mode = panel?.dataset.mode || 'mes', signature = JSON.stringify([period, today(), rows, mode]);
    if (panel?.dataset.signature === signature) return;
    ensureStyles();
    if (!panel) { panel = element('section', 'cfo-chart-bills'); panel.setAttribute('aria-label', 'Agenda de boletos no contexto financeiro'); term.append(panel); }
    panel.dataset.signature = signature; panel.dataset.mode = mode; panel.replaceChildren();
    const heading = element('div', 'cfo-chart-bills-heading'); heading.append(element('h4', '', 'Agenda de boletos'));
    const filter = element('select', ''); filter.setAttribute('aria-label', 'Período da agenda de boletos');
    for (const [value, name] of [['mes', `Mês do painel (${period.split('-').reverse().join('/')})`], ['todos', 'Todos os boletos']]) { const option = element('option', '', name); option.value = value; filter.append(option); } filter.value = mode;
    filter.onchange = () => { panel.dataset.mode = filter.value; this.renderChartBills(); }; heading.append(filter); panel.append(heading);
    const visible = rows.filter(b => mode === 'todos' || b.dataVencimento.startsWith(period) || b.pagoEm?.startsWith(period));
    const sum = status => visible.filter(b => b.status === status).reduce((s, b) => s + Math.round(b.valor * 100), 0) / 100;
    panel.append(element('p', 'cfo-chart-totals', `Em aberto: ${money(sum('aberto'))} • Pagos: ${money(sum('pago'))}`));
    const list = element('div', 'cfo-chart-bill-list');
    const dateFor = b => b.status === 'pago' && b.pagoEm?.startsWith(period) ? b.pagoEm : b.dataVencimento;
    const format = date => date.split('-').reverse().join('/');
    const groups = new Map();
    for (const bill of [...visible].sort((a, b) => dateFor(a).localeCompare(dateFor(b)))) { const date = dateFor(bill); if (!groups.has(date)) groups.set(date, []); groups.get(date).push(bill); }
    for (const [date, bills] of groups) {
      const group = element('section', 'cfo-chart-day'); group.append(element('h5', '', format(date)));
      for (const b of bills) {
        const row = element('article', 'cfo-chart-bill ' + (b.status === 'pago' ? 'is-paid' : b.dataVencimento < today() ? 'is-overdue' : 'is-open'));
        row.append(element('strong', '', b.fornecedor), element('span', 'cfo-chart-bill-value', money(b.valor)), element('span', 'cfo-chart-bill-status', b.status === 'pago' ? 'Pago' : b.dataVencimento < today() ? 'Vencido · em aberto' : 'A pagar'));
        row.append(element('p', '', `Compra: ${format(b.dataCompra)} • Vencimento: ${format(b.dataVencimento)}${b.status === 'pago' ? b.pagoEm ? ` • Marcado pago em ${format(b.pagoEm)}` : ' • Data de pagamento não registrada' : ''}`));
        group.append(row);
      } list.append(group);
    }
    if (!visible.length) list.append(element('p', '', 'Nenhum boleto cadastrado neste período.'));
    panel.append(list);
    if (mode === 'mes' && rows.length > visible.length) panel.append(element('p', 'cfo-chart-note', `${rows.length - visible.length} registro(s) fora deste mês. Selecione Todos os boletos para consultar.`));
    panel.append(element('p', 'cfo-chart-note', 'Registros manuais deste navegador. Datas e situação dos boletos não alteram as linhas de faturamento, P&L ou equilíbrio; atingir o equilíbrio não confirma quitação.'));
    const manage = element('button', '', 'Gerenciar boletos'); manage.type = 'button'; manage.onclick = () => { this.open(options); this.instance.selectView('contas'); }; panel.append(manage);
  }
  static open(options) {
    if (!this.instance) this.instance = new CfoAgentDrawer();
    this.instance.open(options);
  }
  constructor() {
    ensureStyles();
    this.messages = [];
    this.dialog = element('dialog', 'cfo-agent-drawer');
    this.dialog.setAttribute('aria-labelledby', 'cfo-agent-title');
    const header = element('header', 'cfo-agent-header');
    const title = element('h2', '', 'CFO financeiro'); title.id = 'cfo-agent-title';
    const identity = element('div', 'cfo-agent-identity'); identity.append(title, element('span', '', 'Análise financeira da Brutt'));
    this.reset = element('button', 'cfo-agent-reset', 'Nova conversa'); this.reset.type = 'button'; this.reset.onclick = () => this.newConversation();
    const close = element('button', 'cfo-agent-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar CFO IA'); close.onclick = () => this.close();
    header.append(identity, this.reset, close);
    const intro = element('p', 'cfo-agent-note cfo-agent-disclaimer', 'Somente leitura. Faturamento não é saldo disponível em caixa.');
    this.context = element('details', 'cfo-agent-context');
    this.context.append(element('summary', '', 'Dados usados na consulta'));
    this.metrics = element('div', 'cfo-agent-metrics'); this.context.append(this.metrics);
    this.createBoletos();
    this.createSimulator();
    this.log = element('div', 'cfo-agent-log'); this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-label', 'Conversa financeira'); this.log.setAttribute('aria-live', 'polite');
    this.showEmpty();
    const quick = element('div', 'cfo-agent-quick'); quick.setAttribute('aria-label', 'Perguntas rápidas');
    this.suggestions = element('details', 'cfo-agent-suggestions'); this.suggestions.open = true; this.suggestions.append(element('summary', '', 'Perguntas rápidas'), quick);
    this.quickButtons = QUESTIONS.map(question => { const button = element('button', '', question); button.type = 'button'; button.onclick = () => { if (question === QUESTIONS[5]) { this.selectView('simular'); this.expenseInput.focus(); return; } this.input.value = question; this.send(); }; quick.append(button); return button; });
    this.status = element('p', 'cfo-agent-status'); this.status.setAttribute('role', 'status');
    this.form = element('form', 'cfo-agent-form');
    const label = element('label', '', 'Sua pergunta'); label.htmlFor = 'cfo-agent-question';
    this.input = element('textarea', ''); this.input.id = 'cfo-agent-question'; this.input.maxLength = 2000; this.input.rows = 3; this.input.required = true;
    this.submit = element('button', 'cfo-agent-send', 'Enviar pergunta'); this.submit.type = 'submit';
    this.form.append(label, this.input, this.submit); this.form.onsubmit = event => { event.preventDefault(); this.send(); };
    const tabs = element('div', 'cfo-agent-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Área do CFO');
    this.views = {}; this.tabs = {};
    const viewNames = ['analise', 'contas', 'simular'];
    for (const [key, name] of [['analise', 'Análise'], ['contas', 'Contas a pagar'], ['simular', 'Simular despesa']]) {
      const button = element('button', '', name), panel = element('section', 'cfo-agent-panel cfo-agent-panel-' + key);
      button.type = 'button'; button.id = 'cfo-tab-' + key; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'cfo-panel-' + key); button.onclick = () => this.selectView(key);
      button.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? viewNames[0] : event.key === 'End' ? viewNames.at(-1) : viewNames[(viewNames.indexOf(key) + (event.key === 'ArrowRight' ? 1 : 2)) % viewNames.length]; this.selectView(next); this.tabs[next].focus(); } };
      panel.id = 'cfo-panel-' + key; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); this.views[key] = panel; this.tabs[key] = button; tabs.append(button);
    }
    this.views.analise.append(this.context, this.suggestions, this.log, this.status, this.form); this.views.contas.append(this.boletosBlock); this.views.simular.append(this.simulator);
    this.dialog.append(header, tabs, this.views.analise, this.views.contas, this.views.simular, intro); this.selectView('analise'); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) { const r = this.dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close(); } });
    window.addEventListener('hashchange', () => { this.close(); this.newConversation(false); });
    window.addEventListener('storage', event => { if (event.key === this.storageKey) this.loadBoletos(); });
  }
  selectView(key) {
    for (const name of Object.keys(this.tabs)) { const active = name === key; this.views[name].hidden = !active; this.tabs[name].setAttribute('aria-selected', String(active)); this.tabs[name].tabIndex = active ? 0 : -1; }
    if (key === 'contas') this.boletosBlock.open = true;
    if (key === 'simular') this.updateFinancialPreview();
  }
  showEmpty() {
    this.empty = element('div', 'cfo-agent-empty');
    this.empty.append(element('span', 'cfo-agent-empty-symbol', '↗'), element('h3', '', 'Vamos olhar os números.'), element('p', '', 'Escolha uma pergunta acima ou descreva o cenário que deseja analisar.'));
    this.log.append(this.empty);
  }
  newConversation(focus = true) {
    this.epoch = (this.epoch || 0) + 1; this.controller?.abort(); this.messages = []; this.log.replaceChildren(); this.showEmpty(); this.input.value = ''; this.expenseInput.value = ''; this.termInput.value = '0'; this.suggestions.open = true; this.status.textContent = 'Nova conversa. Seus boletos foram mantidos.';
    if (focus) { this.selectView('analise'); this.input.focus(); }
  }
  createSimulator() {
    this.simulator = element('section', 'cfo-agent-simulator');
    this.simulator.append(element('h3', '', 'Simular despesa ou compromisso'), element('p', 'cfo-agent-note', 'Teste um cenário sem cadastrar contas, movimentar dinheiro ou alterar o Financeiro.'));
    const form = element('form', 'cfo-agent-simulation-form');
    const cashLabel = element('label', '', 'Saldo Real em Caixa Hoje (R$) — opcional'); this.cashInput = element('input', ''); this.cashInput.name = 'saldoRealCaixaHoje'; this.cashInput.type = 'text'; this.cashInput.inputMode = 'decimal'; this.cashInput.maxLength = 16; cashLabel.append(this.cashInput);
    this.cashDay = today(); this.cashInput.addEventListener('input', () => { this.cashDay = today(); this.updateFinancialPreview(); });
    const amountLabel = element('label', '', 'Valor da despesa (R$)'); this.expenseInput = element('input', ''); this.expenseInput.name = 'valorDespesa'; this.expenseInput.type = 'text'; this.expenseInput.inputMode = 'decimal'; this.expenseInput.required = true; this.expenseInput.maxLength = 16; amountLabel.append(this.expenseInput);
    const termLabel = element('label', '', 'Prazo de pagamento'); this.termInput = element('select', ''); this.termInput.name = 'prazoDespesa';
    for (const [value, label] of [[0, 'À vista'], [15, '15 dias'], [30, '30 dias']]) { const option = element('option', '', label); option.value = String(value); this.termInput.append(option); }
    termLabel.append(this.termInput);
    this.expenseInput.addEventListener('input', () => this.updateFinancialPreview()); this.termInput.addEventListener('change', () => this.updateFinancialPreview());
    this.financialPreview = element('div', 'cfo-agent-financial-preview'); this.financialPreview.setAttribute('role', 'status');
    this.simulationSubmit = element('button', '', 'Analisar cenário com CFO'); this.simulationSubmit.type = 'submit';
    form.append(cashLabel, amountLabel, termLabel, this.financialPreview, this.simulationSubmit);
    form.onsubmit = event => { event.preventDefault(); if (this.controller) return; try { const inputs = this.cashContext(); if (!inputs.simulacaoDespesa) return; const estimate = financialEstimate(inputs, this.boletos, today()); this.selectView('analise'); this.input.value = `Analise o compromisso adicional de ${money(inputs.simulacaoDespesa.valor)}, prazo ${inputs.simulacaoDespesa.prazoDias} dias corridos, com vencimento em ${estimate.simulacaoDespesa.dataVencimento}. Considere a estimativa condicionada, os boletos cadastrados e as informações ausentes, sem autorizar despesas.`; this.send(); } catch (error) { this.financialPreview.textContent = error.message; } };
    this.simulator.append(form, element('p', 'cfo-agent-note', 'Saldo manual, usado apenas nesta sessão. A folga considera boletos vencidos e dos próximos 10 dias. A simulação reserva os boletos até o maior prazo entre 10 dias e o vencimento, e desconta a despesa adicional. Não inclui recebimentos futuros, folha, impostos ou outras contas que não estejam na lista; não garante capacidade de pagamento. Dias corridos, sem ajuste bancário de feriados ou fins de semana.'));
  }
  cashContext() {
    const context = {};
    if (this.cashInput.value.trim()) { context.saldoRealCaixaHoje = parseAmount(this.cashInput.value); context.saldoInformadoEm = this.cashDay; }
    if (this.expenseInput.value.trim()) context.simulacaoDespesa = { valor: parseAmount(this.expenseInput.value), prazoDias: Number(this.termInput.value) };
    return context;
  }
  updateFinancialPreview() {
    if (!this.financialPreview) return;
    try {
      const result = financialEstimate(this.cashContext(), this.boletos, today());
      this.financialPreview.replaceChildren(element('p', '', `Boletos vencidos e até ${result.reservaAte.split('-').reverse().join('/')}: ${money(result.boletosProximos10Dias)}`));
      this.financialPreview.append(element('p', '', result.folgaFinanceiraCondicionada == null ? 'Folga não calculada: informe o saldo real de hoje. Faturamento não será usado como saldo.' : `Folga condicionada hoje: ${money(result.folgaFinanceiraCondicionada)}`));
      if (result.simulacaoDespesa) {
        const s = result.simulacaoDespesa;
        this.financialPreview.append(element('p', '', `Vencimento: ${s.dataVencimento.split('-').reverse().join('/')} • ${s.prazoDias} dias corridos`));
        if (s.janelaCritica) this.financialPreview.append(element('p', 'cfo-agent-cash-warning', 'Atenção: vencimento na janela crítica de caixa, entre os dias 1 e 10.'));
        this.financialPreview.append(element('p', '', `Reserva de boletos até ${s.reservaAte.split('-').reverse().join('/')}: ${money(s.boletosAteHorizonte)}`));
        this.financialPreview.append(element('strong', s.folgaAposDespesa < 0 ? 'cfo-agent-cash-warning' : '', s.folgaAposDespesa == null ? 'Impacto em caixa indisponível sem saldo real.' : `Folga condicionada após a despesa: ${money(s.folgaAposDespesa)}`));
      }
    } catch (error) { this.financialPreview.textContent = error.message; }
  }
  open(options) {
    this.options = options;
    this.refreshContext();
    if (this.dialog.open) return;
    this.previousFocus = document.activeElement;
    this.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    this.dialog.showModal(); this.selectView('analise'); this.input.focus();
    this.storageKey = null; this.boletos = []; this.boletoFields.disabled = true; this.boletoList.replaceChildren();
    options.client.auth.getSession().then(({ data: { session } }) => {
      if (this.dialog.open && this.options === options) this.useAccount(session?.user?.id);
    }).catch(() => { this.boletoStatus.textContent = 'Não foi possível identificar sua sessão para acessar os boletos.'; });
  }
  createBoletos() {
    this.boletos = [];
    this.boletosBlock = element('details', 'cfo-agent-boletos');
    this.boletosBlock.append(element('summary', '', 'Contas / Boletos a Pagar'));
    this.boletosBlock.append(element('p', 'cfo-agent-note', 'Salvos apenas neste navegador e nesta conta. Não sincroniza com outros dispositivos; limpar os dados do navegador apaga os registros. Marcar Pago é apenas um registro manual, não realiza o pagamento.'));
    this.boletoStatus = element('p', 'cfo-agent-boleto-status'); this.boletoStatus.setAttribute('role', 'status');
    const form = element('form', 'cfo-agent-boleto-form');
    this.boletoFields = element('fieldset', ''); this.boletoFields.disabled = true;
    const legend = element('legend', '', 'Cadastrar boleto'); this.boletoFields.append(legend);
    this.boletoInputs = {};
    for (const [key, label, type] of [['fornecedor', 'Fornecedor', 'text'], ['dataCompra', 'Data da compra', 'date'], ['dataVencimento', 'Vencimento', 'date'], ['valor', 'Valor (R$)', 'text']]) {
      const wrap = element('label', '', label), input = element('input', '');
      input.name = key; input.type = type; input.required = true;
      if (key === 'fornecedor') input.maxLength = 100;
      if (key === 'valor') { input.inputMode = 'decimal'; input.maxLength = 16; }
      if (key === 'dataCompra') input.value = today();
      wrap.append(input); this.boletoFields.append(wrap); this.boletoInputs[key] = input;
    }
    const add = element('button', '', 'Cadastrar boleto'); add.type = 'submit'; this.boletoFields.append(add);
    form.append(this.boletoFields); form.onsubmit = event => { event.preventDefault(); this.addBoleto(); };
    this.boletoList = element('div', 'cfo-agent-boleto-list');
    const clear = element('button', 'cfo-agent-clear-paid', 'Limpar registros pagos'); clear.type = 'button';
    clear.onclick = () => { if (this.loadBoletos()) this.saveBoletos(this.boletos.filter(b => b.status === 'aberto')); };
    this.boletosBlock.append(form, this.boletoStatus, this.boletoList, clear);
  }
  useAccount(userId) {
    if (!userId) { this.storageKey = null; this.boletoFields.disabled = true; this.boletoList.replaceChildren(); this.boletoStatus.textContent = 'Entre novamente para acessar os boletos.'; return; }
    const key = 'brutt:cfo-boletos:v1:' + this.options.url + ':' + userId;
    if (this.accountKey && this.accountKey !== key) { this.cashInput.value = ''; this.newConversation(false); }
    this.accountKey = this.storageKey = key;
    this.loadBoletos();
  }
  loadBoletos() {
    try {
      if (!this.storageKey) throw new Error('Sessão indisponível.');
      const raw = localStorage.getItem(this.storageKey), rows = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows) || rows.length > 100 || rows.some(b => !validBoleto(b)) || new Set(rows.map(b => b.id)).size !== rows.length) throw new Error('Registros inválidos.');
      this.boletos = rows; this.boletoFields.disabled = false; this.boletoStatus.textContent = ''; this.renderBoletos(); return true;
    } catch {
      this.boletos = []; this.boletoFields.disabled = true; this.boletoList.replaceChildren();
      this.boletoStatus.textContent = 'Não foi possível ler o armazenamento local. Nenhum registro foi sobrescrito. Verifique as permissões do navegador.'; return false;
    }
  }
  saveBoletos(rows) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(rows)); this.boletos = rows; this.renderBoletos(); this.boletoStatus.textContent = 'Registros salvos neste navegador.'; CfoAgentDrawer.notify(this.options); return true; }
    catch { this.boletoStatus.textContent = 'Não foi possível salvar. A alteração não foi aplicada; verifique o espaço e as permissões do navegador.'; return false; }
  }
  addBoleto() {
    if (!this.loadBoletos()) return;
    const values = Object.fromEntries(Object.entries(this.boletoInputs).map(([key, input]) => [key, input.value.trim()]));
    const amount = values.valor;
    const boleto = { ...values, id: crypto.randomUUID(), valor: /^(?:\d{1,9})(?:[,.]\d{1,2})?$/.test(amount) ? Number(amount.replace(',', '.')) : NaN, status: 'aberto' };
    if (!validBoleto(boleto)) { this.boletoStatus.textContent = 'Confira as datas e informe valor positivo com até duas casas decimais, sem separador de milhar (ex.: 1234,56). O vencimento não pode ser anterior à compra.'; return; }
    if (this.boletos.length >= 100) { this.boletoStatus.textContent = 'Limite de 100 registros. Limpe os registros pagos para cadastrar novos boletos.'; return; }
    if (this.saveBoletos([...this.boletos, boleto])) { this.boletoInputs.fornecedor.value = ''; this.boletoInputs.valor.value = ''; this.boletoInputs.dataVencimento.value = ''; }
  }
  renderBoletos() {
    this.updateFinancialPreview();
    this.boletoList.replaceChildren();
    const open = this.boletos.filter(b => b.status === 'aberto').sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
    this.boletoList.append(element('p', 'cfo-agent-note', `${open.length} em aberto • Total ${money(open.reduce((sum, b) => sum + b.valor, 0))} • ${this.boletos.length - open.length} pagos`));
    const now = Date.parse(today());
    for (const b of open) {
      const days = Math.round((Date.parse(b.dataVencimento) - now) / 86400000);
      const row = element('article', 'cfo-agent-boleto' + (days < 0 ? ' cfo-agent-overdue' : days <= 7 ? ' cfo-agent-due-soon' : ''));
      row.append(element('strong', '', b.fornecedor), element('span', '', money(b.valor)), element('p', '', `Compra ${b.dataCompra.split('-').reverse().join('/')} • Vence ${b.dataVencimento.split('-').reverse().join('/')} • ${days < 0 ? 'Vencido' : days === 0 ? 'Vence hoje' : days <= 7 ? 'Vence nos próximos 7 dias' : 'Em aberto'}`));
      const paid = element('button', '', 'Marcar Pago'); paid.type = 'button'; paid.setAttribute('aria-label', 'Marcar Pago: ' + b.fornecedor);
      paid.onclick = () => { if (this.loadBoletos()) this.saveBoletos(this.boletos.map(item => item.id === b.id ? { ...item, status: 'pago', pagoEm: today() } : item)); };
      row.append(paid); this.boletoList.append(row);
    }
  }
  close() {
    if (!this.dialog.open) return;
    this.controller?.abort(); this.dialog.close();
    document.documentElement.style.overflow = this.overflow;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
  refreshContext() {
    const snapshot = this.options.getContext(); this.metrics.replaceChildren();
    if (!snapshot) { this.metrics.append(element('p', '', 'Indicadores reais indisponíveis. Atualize o Financeiro ou importe os dados de vendas. O chat não presumirá valores zerados.')); return null; }
    const { financialContext: c, meta } = snapshot;
    this.metrics.append(element('p', '', `Período ${meta.periodo} • vendas importadas até ${meta.dadosAte.split('-').reverse().join('/')} • ${meta.simulado ? 'ritmo alterado no simulador' : 'ritmo base do painel'}`));
    const list = element('dl', '');
    for (const [key, label] of Object.entries(labels)) { list.append(element('dt', '', label), element('dd', '', key === 'diaAtual' ? String(c[key]) : key === 'margemBrutaPct' ? c[key].toLocaleString('pt-BR') + '%' : money(c[key]))); }
    list.append(element('dt', '', 'Outros custos do mês'), element('dd', '', money(meta.outrosCustos)));
    this.metrics.append(list); return snapshot;
  }
  bubble(role, text) {
    this.empty?.remove(); const item = element('article', `cfo-agent-message cfo-agent-${role}`);
    const meta = element('div', 'cfo-agent-message-meta', role === 'assistant' ? 'Parecer financeiro' : 'Você');
    const time = element('time', '', new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date())); time.dateTime = new Date().toISOString(); meta.append(time);
    const content = element('div', 'cfo-agent-message-body'); if (role === 'assistant') renderFinancialAnswer(content, text); else content.textContent = text;
    item.append(meta, content); this.log.append(item); this.log.scrollTop = this.log.scrollHeight; return item;
  }
  async send() {
    if (this.controller || !this.input.value.trim()) return;
    const question = this.input.value.trim();
    this.suggestions.open = false;
    const epoch = this.epoch;
    const snapshot = this.refreshContext();
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 35000);
    this.submit.disabled = true; this.simulationSubmit.disabled = true; this.quickButtons.forEach(b => b.disabled = true);
    this.status.textContent = 'Consultando os indicadores…';
    const pending = this.bubble('user', question);
    const messages = [...this.messages.slice(-10), { role: 'user', content: question }];
    try {
      const { data: { session } } = await this.options.client.auth.getSession();
      if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no painel.');
      if (this.accountKey !== 'brutt:cfo-boletos:v1:' + this.options.url + ':' + session.user.id) { this.useAccount(session.user.id); throw new Error('A sessão mudou. Confira os boletos e envie a pergunta novamente.'); }
      if (!this.loadBoletos()) throw new Error('Não foi possível conferir os boletos salvos. A consulta foi interrompida para não ignorar compromissos.');
      const boletosAbertos = this.boletos.filter(b => b.status === 'aberto').sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
      const contextoCaixa = this.cashContext(); financialEstimate(contextoCaixa, boletosAbertos, today());
      const response = await fetch(this.options.url + '/functions/v1/cfo-agent', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.options.key, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ messages, financialContext: snapshot ? { ...snapshot.financialContext, boletosAbertos, ...contextoCaixa } : undefined, contextoCaixa: snapshot ? undefined : contextoCaixa, boletosAbertos: snapshot ? undefined : boletosAbertos, meta: snapshot?.meta }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.answer !== 'string' || !data.answer.trim()) throw new Error(data.error || 'O assistente está indisponível. Tente novamente.');
      if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      this.bubble('assistant', data.answer);
      this.messages = [...messages, { role: 'assistant', content: data.answer.slice(0, 2000) }].slice(-10);
      if (this.input.value.trim() === question) this.input.value = '';
      this.status.textContent = 'Análise consultiva. Confira os dados antes de decidir.';
    } catch (error) {
      pending.remove();
      if (epoch === this.epoch) this.status.textContent = controller.signal.aborted ? (controller.signal.reason === 'timeout' ? 'A consulta demorou demais. Tente novamente.' : 'Consulta cancelada.') : error.message;
    } finally {
      clearTimeout(timer); this.controller = null; this.submit.disabled = false; this.simulationSubmit.disabled = false; this.quickButtons.forEach(b => b.disabled = false);
    }
  }
}
window.addEventListener('focus', () => CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions));
document.addEventListener('visibilitychange', () => { if (!document.hidden) CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions); });
window.addEventListener('storage', event => { if (event.key?.startsWith('brutt:cfo-boletos:')) CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions); });
