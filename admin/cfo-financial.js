export const brazilDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export function addCalendarDays(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Data inválida.');
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}
export function parseAmount(value) {
  const text = String(value).trim();
  if (!/^-?\d{1,10}(?:[,.]\d{1,2})?$/.test(text)) throw new Error('Informe um valor com até duas casas decimais, sem separador de milhar (ex.: 1234,56).');
  const amount = Number(text.replace(',', '.'));
  if (Math.abs(amount) > 1e9) throw new Error('Valor fora do limite permitido.');
  return amount;
}
export function validateCashContext(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Contexto de caixa inválido.');
  const result = {}, validMoney = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9 && Math.abs(v * 100 - Math.round(v * 100)) < .0001;
  if (value.saldoRealCaixaHoje != null) {
    if (!validMoney(value.saldoRealCaixaHoje)) throw new Error('Saldo real inválido.');
    result.saldoRealCaixaHoje = value.saldoRealCaixaHoje;
    if (value.saldoInformadoEm !== undefined) {
      addCalendarDays(value.saldoInformadoEm, 0); result.saldoInformadoEm = value.saldoInformadoEm;
    }
  }
  if (value.simulacaoDespesa != null) {
    const s = value.simulacaoDespesa;
    if (!validMoney(s.valor) || s.valor <= 0 || ![0, 15, 30].includes(s.prazoDias)) throw new Error('Simulação inválida. Informe valor positivo e prazo de 0, 15 ou 30 dias.');
    result.simulacaoDespesa = { valor: s.valor, prazoDias: s.prazoDias };
  }
  return result;
}
export function financialEstimate(input, bills, date = brazilDate()) {
  const c = validateCashContext(input), day10 = addCalendarDays(date, 10);
  if (c.saldoRealCaixaHoje != null && c.saldoInformadoEm && c.saldoInformadoEm !== date) throw new Error('O saldo informado é de outro dia. Atualize o saldo real de hoje.');
  const cents = value => Math.round(value * 100);
  const sumUntil = end => bills.filter(b => b.status === 'aberto' && b.dataVencimento <= end).reduce((sum, b) => sum + cents(b.valor), 0);
  const reserved = sumUntil(day10), cash = c.saldoRealCaixaHoje == null ? null : cents(c.saldoRealCaixaHoje);
  const result = { dataReferencia: date, reservaAte: day10, boletosProximos10Dias: reserved / 100, saldoRealCaixaHoje: c.saldoRealCaixaHoje ?? null, folgaFinanceiraCondicionada: cash == null ? null : (cash - reserved) / 100 };
  if (c.simulacaoDespesa) {
    const s = c.simulacaoDespesa, due = addCalendarDays(date, s.prazoDias), horizon = due > day10 ? due : day10, commitments = sumUntil(horizon);
    result.simulacaoDespesa = { ...s, dataVencimento: due, janelaCritica: Number(due.slice(-2)) <= 10, reservaAte: horizon, boletosAteHorizonte: commitments / 100, folgaAposDespesa: cash == null ? null : (cash - commitments - cents(s.valor)) / 100 };
  }
  return result;
}
