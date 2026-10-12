/* Lê planilhas (xlsx/xls/csv) FORA do painel, num Web Worker descartável.
   A SheetJS 0.18.5 (a última no npm) tem duas falhas conhecidas ao ler arquivo malicioso:
   poluição de protótipo (CVE-2023-30533) e travamento por expressão regular (CVE-2024-22363).
   Aqui elas não alcançam o painel: o worker não vê a página nem o login, só devolve as linhas
   (cópia estruturada, sem protótipos), e é encerrado depois de cada leitura ou se passar do tempo. */
importScripts("/vendor/xlsx-0.18.5.full.min.js");
onmessage = e => {
  try {
    const wb = XLSX.read(e.data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) : [];
    postMessage({ ok: true, rows: JSON.parse(JSON.stringify(rows)) });
  } catch (err) { postMessage({ ok: false, erro: String((err && err.message) || err).slice(0, 200) }); }
};
