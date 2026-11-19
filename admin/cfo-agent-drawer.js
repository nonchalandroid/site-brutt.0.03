const QUESTIONS = ['Quanto falta para atingir o ponto de equilíbrio?', 'Como está o ritmo para fechar o mês?', 'Simular uma despesa com vencimento em 30 dias', 'Analisar impacto dos boletos próximos'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validBoleto = b => b && typeof b.id === 'string' && b.id.length <= 80 && typeof b.fornecedor === 'string' && b.fornecedor.trim().length > 0 && b.fornecedor.length <= 100 && validDate(b.dataCompra) && validDate(b.dataVencimento) && b.dataVencimento >= b.dataCompra && typeof b.valor === 'number' && Number.isFinite(b.valor) && b.valor > 0 && b.valor <= 1e9 && Math.abs(b.valor * 100 - Math.round(b.valor * 100)) < .0001 && ['aberto', 'pago'].includes(b.status);
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = { faturamentoAtual: 'Faturamento importado', faturamentoProjetado: 'Fechamento projetado', margemBrutaPct: 'Margem bruta', custosFixos: 'Custos fixos', diaAtual: 'Dia atual', pontoEquilibrio: 'Ponto de equilíbrio', faltaParaEmpatar: 'Faturamento que falta', ritmoDiarioSimulado: 'Ritmo diário simulado' };
function element(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function ensureStyles() {
  if (document.querySelector('link[data-cfo-styles]')) return;
  const css = element('link', ''); css.rel = 'stylesheet'; css.dataset.cfoStyles = ''; css.href = new URL('./cfo-agent-drawer.css?v=20261119b', import.meta.url).href; document.head.append(css);
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
      if (!Array.isArray(rows) || rows.length > 100 || rows.some(b => !validBoleto(b))) return;
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
      const view = element('button', '', 'Ver boletos'); view.type = 'button'; view.onclick = () => { this.open(options); this.instance.boletosBlock.open = true; this.instance.boletosBlock.scrollIntoView({ block: 'start' }); };
      const dismiss = element('button', '', 'Dispensar por hoje'); dismiss.type = 'button'; dismiss.onclick = () => { try { localStorage.setItem(dismissKey, signature); alert.remove(); } catch { dismiss.textContent = 'Não foi possível salvar a dispensa'; } };
      alert.append(view, dismiss); container.querySelector('#ovLucro')?.before(alert);
    } catch { /* O cadastro exibe o erro de armazenamento ao abrir a gaveta. */ }
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
    const title = element('h2', '', 'CFO IA'); title.id = 'cfo-agent-title';
    const close = element('button', 'cfo-agent-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar CFO IA'); close.onclick = () => this.close();
    header.append(title, close);
    const intro = element('p', 'cfo-agent-note', 'Consulta financeira • somente leitura. Não confirma saldo bancário nem contas quitadas.');
    this.context = element('details', 'cfo-agent-context');
    this.context.append(element('summary', '', 'Dados usados na consulta'));
    this.metrics = element('div', 'cfo-agent-metrics'); this.context.append(this.metrics);
    this.createBoletos();
    this.log = element('div', 'cfo-agent-log'); this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-label', 'Conversa financeira'); this.log.setAttribute('aria-live', 'polite');
    const quick = element('div', 'cfo-agent-quick'); quick.setAttribute('aria-label', 'Perguntas rápidas');
    this.quickButtons = QUESTIONS.map(question => { const button = element('button', '', question); button.type = 'button'; button.onclick = () => { this.input.value = question; this.send(); }; quick.append(button); return button; });
    this.status = element('p', 'cfo-agent-status'); this.status.setAttribute('role', 'status');
    this.form = element('form', 'cfo-agent-form');
    const label = element('label', '', 'Sua pergunta'); label.htmlFor = 'cfo-agent-question';
    this.input = element('textarea', ''); this.input.id = 'cfo-agent-question'; this.input.maxLength = 2000; this.input.rows = 3; this.input.required = true;
    this.submit = element('button', 'cfo-agent-send', 'Consultar'); this.submit.type = 'submit';
    this.form.append(label, this.input, this.submit); this.form.onsubmit = event => { event.preventDefault(); this.send(); };
    this.dialog.append(header, intro, this.context, this.boletosBlock, quick, this.log, this.status, this.form); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) { const r = this.dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close(); } });
    window.addEventListener('hashchange', () => { this.close(); this.messages = []; this.log.replaceChildren(); });
    window.addEventListener('storage', event => { if (event.key === this.storageKey) this.loadBoletos(); });
  }
  open(options) {
    this.options = options;
    this.refreshContext();
    if (this.dialog.open) return;
    this.previousFocus = document.activeElement;
    this.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    this.dialog.showModal(); this.input.focus();
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
    if (this.accountKey && this.accountKey !== key) { this.messages = []; this.log.replaceChildren(); this.input.value = ''; }
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
    this.boletoList.replaceChildren();
    const open = this.boletos.filter(b => b.status === 'aberto').sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
    this.boletoList.append(element('p', 'cfo-agent-note', `${open.length} em aberto • Total ${money(open.reduce((sum, b) => sum + b.valor, 0))} • ${this.boletos.length - open.length} pagos`));
    const now = Date.parse(today());
    for (const b of open) {
      const days = Math.round((Date.parse(b.dataVencimento) - now) / 86400000);
      const row = element('article', 'cfo-agent-boleto' + (days < 0 ? ' cfo-agent-overdue' : days <= 7 ? ' cfo-agent-due-soon' : ''));
      row.append(element('strong', '', b.fornecedor), element('span', '', money(b.valor)), element('p', '', `Compra ${b.dataCompra.split('-').reverse().join('/')} • Vence ${b.dataVencimento.split('-').reverse().join('/')} • ${days < 0 ? 'Vencido' : days === 0 ? 'Vence hoje' : days <= 7 ? 'Vence nos próximos 7 dias' : 'Em aberto'}`));
      const paid = element('button', '', 'Marcar Pago'); paid.type = 'button'; paid.setAttribute('aria-label', 'Marcar Pago: ' + b.fornecedor);
      paid.onclick = () => { if (this.loadBoletos()) this.saveBoletos(this.boletos.map(item => item.id === b.id ? { ...item, status: 'pago' } : item)); };
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
  bubble(role, text) { const item = element('p', `cfo-agent-message cfo-agent-${role}`, text); this.log.append(item); item.scrollIntoView({ block: 'nearest' }); return item; }
  async send() {
    if (this.controller || !this.input.value.trim()) return;
    const question = this.input.value.trim();
    const snapshot = this.refreshContext();
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 35000);
    this.submit.disabled = true; this.quickButtons.forEach(b => b.disabled = true);
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
      const response = await fetch(this.options.url + '/functions/v1/cfo-agent', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.options.key, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ messages, financialContext: snapshot ? { ...snapshot.financialContext, boletosAbertos } : undefined, boletosAbertos: snapshot ? undefined : boletosAbertos, meta: snapshot?.meta }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.answer !== 'string' || !data.answer.trim()) throw new Error(data.error || 'O assistente está indisponível. Tente novamente.');
      if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      this.bubble('assistant', data.answer);
      this.messages = [...messages, { role: 'assistant', content: data.answer.slice(0, 2000) }].slice(-10);
      if (this.input.value.trim() === question) this.input.value = '';
      this.status.textContent = 'Análise consultiva. Confira os dados antes de decidir.';
    } catch (error) {
      pending.remove();
      this.status.textContent = controller.signal.aborted ? (controller.signal.reason === 'timeout' ? 'A consulta demorou demais. Tente novamente.' : 'Consulta cancelada.') : error.message;
    } finally {
      clearTimeout(timer); this.controller = null; this.submit.disabled = false; this.quickButtons.forEach(b => b.disabled = false);
    }
  }
}
window.addEventListener('focus', () => CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions));
document.addEventListener('visibilitychange', () => { if (!document.hidden) CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions); });
window.addEventListener('storage', event => { if (event.key?.startsWith('brutt:cfo-boletos:')) CfoAgentDrawer.notify(CfoAgentDrawer.alertOptions); });
