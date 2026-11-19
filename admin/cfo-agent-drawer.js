const QUESTIONS = ['Quanto falta para atingir o ponto de equilíbrio?', 'Como está o ritmo para fechar o mês?', 'Simular uma despesa com vencimento em 30 dias'];
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = { faturamentoAtual: 'Faturamento importado', faturamentoProjetado: 'Fechamento projetado', margemBrutaPct: 'Margem bruta', custosFixos: 'Custos fixos', diaAtual: 'Dia atual', pontoEquilibrio: 'Ponto de equilíbrio', faltaParaEmpatar: 'Faturamento que falta', ritmoDiarioSimulado: 'Ritmo diário simulado' };
function element(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }

export class CfoAgentDrawer {
  static instance;
  static open(options) {
    if (!this.instance) this.instance = new CfoAgentDrawer();
    this.instance.open(options);
  }
  constructor() {
    const css = element('link', ''); css.rel = 'stylesheet'; css.href = new URL('./cfo-agent-drawer.css?v=20261119', import.meta.url).href; document.head.append(css);
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
    this.log = element('div', 'cfo-agent-log'); this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-label', 'Conversa financeira'); this.log.setAttribute('aria-live', 'polite');
    const quick = element('div', 'cfo-agent-quick'); quick.setAttribute('aria-label', 'Perguntas rápidas');
    this.quickButtons = QUESTIONS.map(question => { const button = element('button', '', question); button.type = 'button'; button.onclick = () => { this.input.value = question; this.send(); }; quick.append(button); return button; });
    this.status = element('p', 'cfo-agent-status'); this.status.setAttribute('role', 'status');
    this.form = element('form', 'cfo-agent-form');
    const label = element('label', '', 'Sua pergunta'); label.htmlFor = 'cfo-agent-question';
    this.input = element('textarea', ''); this.input.id = 'cfo-agent-question'; this.input.maxLength = 2000; this.input.rows = 3; this.input.required = true;
    this.submit = element('button', 'cfo-agent-send', 'Consultar'); this.submit.type = 'submit';
    this.form.append(label, this.input, this.submit); this.form.onsubmit = event => { event.preventDefault(); this.send(); };
    this.dialog.append(header, intro, this.context, quick, this.log, this.status, this.form); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) { const r = this.dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close(); } });
    window.addEventListener('hashchange', () => { this.close(); this.messages = []; this.log.replaceChildren(); });
  }
  open(options) {
    this.options = options;
    this.refreshContext();
    if (this.dialog.open) return;
    this.previousFocus = document.activeElement;
    this.overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    this.dialog.showModal(); this.input.focus();
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
      const response = await fetch(this.options.url + '/functions/v1/cfo-agent', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.options.key, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ messages, financialContext: snapshot?.financialContext, meta: snapshot?.meta }), signal: controller.signal });
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
