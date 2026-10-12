// gerar-ficha-sommelier  (v13: + sugestão de categoria; v12: pesquisa em 2 etapas — dossiê com Google Search + ficha)
// Analisa QUALQUER produto da Tabacaria Brutt e devolve uma sugestão de descrição + ficha (+ perfil de sabor nas
// essências, + detalhes nos whiskies, + categoria sugerida quando o /admin manda a lista de categorias).
// NUNCA grava nada: quem grava é o /admin (editor de um produto ou "Sommelier em massa").
// - só dono/administrador (is_gestor()) pode usar (gasta a cota do Gemini; atendente não);
// - etapa 1: pesquisa na internet (Google Search via Gemini) e monta um dossiê denso; etapa 2: transforma o dossiê na ficha.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELOS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const EIXOS = ["citrico", "tropical", "doce", "mentolado"];
const DESC_MAX = 170;   // o site corta qualquer descrição maior que isso com "…"
const CHAVES_WHISKY = ["intro","origem","tipo","destilaria","composicao","barril","idade","abv","cor","nariz","paladar","finalizacao","perfil","sugestao","obs"];
const VAZIO = /^(n[aã]o (confirmado|informado|encontrado|dispon[ií]vel)|desconhecido|indispon[ií]vel|n\/a|na|null|undefined|-+|\?+)$/i;
// frases de aviso de idade que o site já mostra em outro lugar: não entram em descrição nenhuma
const AVISO_IDADE = /(venda|vendas|comercializa[cç][aã]o|consumo|produto|uso)[^.!?\n]{0,60}(maiores?\s+de\s+18|\+\s*18|18\s*anos|proibid[ao]\s+para\s+menores)[^.!?\n]*[.!?]?|(proibid[ao]|destinad[ao]|exclusiv[oa])[^.!?\n]{0,40}(maiores?\s+de\s+18|18\s*anos)[^.!?\n]*[.!?]?|\b(apenas|somente|s[oó])\s+para\s+maiores\s+de\s+18[^.!?\n]*[.!?]?/gi;

function semAcento(s: string) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

/** Tira avisos de "maiores de 18 anos" de um texto e arruma a pontuação */
export function semAvisoIdade(txt: string): string {
  return String(txt || "").replace(AVISO_IDADE, " ").replace(/\s+/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
}

/** Descobre o "tipo" do produto pra escolher o modelo de ficha certo */
export function tipoDe(categoria: string, subcategoria: string, nome: string): string {
  const t = semAcento(`${categoria} ${subcategoria}`), n = semAcento(nome);
  if (/essencia/.test(t)) return "essencia";
  if (/\bwhisk(y|ey)\b|bourbon/.test(t + " " + n)) return "whisky";
  if (/\b(gin|vodka|licor|vinho|cerveja|cervejas|energetico|energeticos|refri|agua|suco|combos?|copao|longnecks?|gelo|descartaveis)\b|bebida/.test(t)) return "bebida";
  if (/charuto|cigarrilha|cigarro|palha|tabaco/.test(t)) return "tabaco";
  if (/narguile|carvao|rosh|mangueira|pegador|aluminio|borracha|furador|pecas/.test(t)) return "narguile";
  if (/headshop|seda|piteira|cuia|\bcases?\b|slick|chaveiro|pipe|bong|dichavador|bolador|tesoura|bandeja|cigarreira|cinzeiro/.test(t)) return "headshop";
  if (/isqueiro|macarico|recarga|\bgas\b/.test(t)) return "isqueiro";
  return "geral";
}

const GUIA: Record<string, string> = {
  essencia: `ESSÊNCIA DE NARGUILÉ.
- Ficha ("specs"), nesta ordem e com EXATAMENTE estes rótulos (omita o que não souber): "Marca", "Sabor", "Frutas / notas", "Perfil", "Combina com". Em "Perfil", diga em palavras os eixos mais fortes (ex.: "frutado e adocicado, com frescor mentolado").
- "flavor_profile": 4 eixos inteiros de 0 a 10 — citrico, tropical, doce, mentolado — seguindo a LÓGICA DOS EIXOS abaixo.
- Descrição: no máximo ${DESC_MAX} caracteres (conte!), 1 ou 2 frases curtas e COMPLETAS: o sabor + a sensação (e o mix, se couber). Exemplo: "Uva bem frutada e adocicada, com final gelado de menta. Combina com melancia e hortelã." Sem prometer efeito nenhum.`,
  whisky: `WHISKY / WHISKEY.
- Ficha ("specs"): "Marca", "Peso / volume" (se souber) e no máximo 2 itens a mais.
- "whisky_details" (só chaves confirmadas, textos curtos em português): intro, origem, tipo, destilaria, composicao, barril, idade, abv, cor, nariz, paladar, finalizacao, perfil, sugestao, obs. Se for versão aromatizada (mel, maçã, fogo…), deixe isso claro em "tipo" e "obs".
- Descrição: no máximo ${DESC_MAX} caracteres: 1 ou 2 frases sobre o estilo, o sabor e como servir.`,
  bebida: `BEBIDA.
- Ficha ("specs"): "Marca", "Peso / volume", "Teor alcoólico" (se aplicável e confirmado), "Sabor" ou "Tipo".
- Descrição: no máximo ${DESC_MAX} caracteres: sabor, estilo e como servir.`,
  tabaco: `TABACO / CHARUTO / CIGARRO / PALHA / CIGARRILHA.
- Ficha ("specs"), só o que for relevante e confirmado: "Marca", "Origem", "Vitola / tamanho", "Capa", "Força" (suave, média, forte), "Sabor / aroma", "Embalagem", "Quantidade".
- Teor de nicotina/alcatrão: só se a pesquisa trouxer o número; senão NÃO escreva.
- Descrição: no máximo ${DESC_MAX} caracteres, neutra e informativa: origem, formato, sabor/aroma e força. NUNCA faça alegação de saúde, nem incentive consumo.`,
  narguile: `ARTIGO DE NARGUILÉ (carvão, rosh, mangueira, pegador, alumínio, peça…).
- Ficha ("specs"): "Marca", "Material", "Peso / volume" ou "Tamanho", "Formato", "Cor" — e "Tempo de queima" (carvão) só se confirmado.
- Descrição: no máximo ${DESC_MAX} caracteres, prática: pra que serve e como usar bem.`,
  headshop: `HEADSHOP (seda, piteira, cuia, dichavador, bong, case, slick, tesoura, cinzeiro…).
- Ficha ("specs"): "Marca", "Material", "Tamanho / medida", "Quantidade na embalagem", "Cor".
- Descrição: no máximo ${DESC_MAX} caracteres, prática (pra que serve, diferencial do material/tamanho). Sem incentivar consumo de nada.`,
  isqueiro: `ISQUEIRO / MAÇARICO / GÁS.
- Ficha ("specs"): "Marca", "Tipo", "Recarregável", "Chama", "Material", "Cor".
- Descrição: no máximo ${DESC_MAX} caracteres, prática.`,
  geral: `PRODUTO GERAL (doce, incenso, conveniência, outros).
- Ficha ("specs"): "Marca", "Sabor / fragrância", "Peso / volume", "Material" — só o que fizer sentido e for confirmado.
- Descrição: no máximo ${DESC_MAX} caracteres.`,
};

const SISTEMA = `Você escreve fichas de produto para a Tabacaria Brutt, uma tabacaria e smoke shop do Rio de Janeiro. Responda SEMPRE em português do Brasil.
Sua função é SUGERIR uma ficha; um humano vai revisar antes de publicar. Por isso, honestidade vale mais que completude.

REGRAS INEGOCIÁVEIS
1. NUNCA invente: ingredientes, composição, terpenos, teor, origem, idade, notas de sabor, avaliações. Só escreva o que veio do cadastro, do dossiê de pesquisa ou de fonte que você achou.
2. Se não achou ou não tem certeza, OMITA o item e registre em "avisos" (ex.: "Composição não confirmada: o fabricante não divulga"). Nunca preencha com "não informado".
3. Se as fontes se contradisserem, diga em "avisos". Não transforme suposição em fato.
4. Se o nome comercial for pouco óbvio (blend, linha, sigla), use o dossiê (ou pesquise, se não houver dossiê) com marca + nome + EAN quando houver. Prefira o site do fabricante e varejistas sérios.
5. Se o cadastro já tem informação, preserve o que estiver certo e corrija só o que a pesquisa contradisser.
6. Texto de vitrine: curto, claro, sem exagero. Sem alegações de saúde, sem incentivo a consumo, sem preço.
7. NUNCA escreva aviso de idade ou legal na descrição ("venda só para maiores de 18 anos", "proibido para menores", "+18" etc.): o site já mostra isso em outro lugar. Use o espaço para falar do PRODUTO: sabor, aroma, origem, formato, como usar. Se a descrição atual tiver esse aviso, REMOVA.
8. Seja específico: cite o que realmente diferencia ESTE produto (notas, origem, formato, material, uso). Evite frases genéricas que serviriam para qualquer produto da categoria.

LÓGICA DOS EIXOS DE SABOR (só para essências). Cada eixo vai de 0 a 10: 0 = ausente, 3 = traço, 5 = presente, 7 = marcante, 9–10 = dominante. NÃO precisam somar 10; vários podem ser altos ao mesmo tempo (blends).
- citrico: acidez/azedinho de cítricos (limão, laranja, tangerina, lima, toranja, maracujá azedinho, uva verde). Quanto o sabor "pica" e refresca pela acidez.
- doce: quão adocicado é o sabor: açúcar e sobremesa (bala, chiclete, caramelo, baunilha, creme, mel, algodão-doce) e também fruta doce e madura (morango, uva, framboesa, pêssego, fruta em calda).
- tropical: frutas e clima tropical (manga, abacaxi, coco, maracujá, goiaba, banana, mamão, lichia, kiwi; melancia/melão só em parte).
- mentolado: frescor gelado de menta/hortelã/eucalipto. "Ice", "fresh", "gelado", "frozen" costumam indicar isso; só dê nota alta se houver frescor mentolado de verdade.
Exemplos de calibragem da loja (não são regras fixas): Menta = mentolado 10, resto 0–1. Morango = doce 8. Limão = citrico 9, doce 2. Tutti-frutti = doce 8, tropical 4, citrico 1. Frutas vermelhas + menta = doce 7, mentolado 7. Melancia = doce 6, tropical 3. Abacaxi com hortelã = tropical 8, mentolado 6, doce 5.
Não deduza só pelo nome: use o que o fabricante/pesquisa disser sobre as frutas e sobre o frescor. Se estimou pelo nome (ex.: "gelada" sem confirmação), registre isso em "avisos".

TAMANHO DA DESCRIÇÃO: o site corta o que passar de ${DESC_MAX} caracteres. Escreva SEMPRE até ${DESC_MAX} caracteres, frases completas, sem reticências. Se a descrição atual passa disso, reescreva menor mantendo o que importa. As informações mais densas vão na FICHA ("specs") e nos detalhes, não na descrição.

Responda SOMENTE com um JSON válido (sem markdown, sem texto antes/depois) neste formato:
{"description":"...","specs":[["Rótulo","valor"]],"flavor_profile":null,"whisky_details":null,"categoria_slug":null,"avisos":["..."],"confianca":"alta|media|baixa"}
- "flavor_profile": objeto {"citrico":0,"tropical":0,"doce":0,"mentolado":0} SOMENTE para essências; senão null.
- "whisky_details": objeto SOMENTE para whisky; senão null.
- "categoria_slug": SOMENTE se a mensagem trouxer a lista "CATEGORIAS DA LOJA": o slug (exatamente como na lista) da subcategoria onde ESTE produto deve ficar. Se a categoria atual já serve, repita o slug atual. Se não houver lista, null.
- "confianca": alta = achei fonte clara; media = achei pouco/estimei algo; baixa = quase nada confirmado.`;

const SISTEMA_PESQUISA = `Você é um pesquisador de produtos de tabacaria/smoke shop/bebidas. Responda em português do Brasil, em texto corrido organizado por tópicos curtos (sem JSON). Use a pesquisa do Google para achar o produto EXATO (marca + nome + EAN quando houver) em sites de fabricantes, importadores e varejistas sérios. Reúna o máximo de fatos CONFIRMADOS: o que é, marca/fabricante, origem, composição/ingredientes, sabor e aroma (notas), força/intensidade, tamanho/medidas/volume, material, embalagem/quantidade, teor alcoólico quando houver, modo de uso e com o que combina. NUNCA invente: se um dado não aparecer nas fontes, escreva "não encontrado". Se achar versões diferentes do produto, diga qual casa melhor com o nome/EAN e cite a dúvida. Não escreva avisos de idade nem opinião de venda.`;

/** Lista de categorias que o /admin manda: [{slug, nome}] com nome "Pai > Sub". Só aceita o formato esperado. */
export function categoriasDe(inp: any): { slug: string; nome: string }[] {
  const l = Array.isArray(inp?.categorias) ? inp.categorias : [];
  return l.filter((c: any) => c && /^[a-z0-9-]{2,80}$/.test(String(c.slug)) && String(c.nome || "").trim())
    .slice(0, 200).map((c: any) => ({ slug: String(c.slug), nome: String(c.nome).trim().slice(0, 80) }));
}

export function montaPrompt(inp: any, tipo: string, dossie = ""): string {
  const ex = inp.existente || {};
  const cats = categoriasDe(inp);
  const partes = [
    `PRODUTO: ${inp.name}`,
    `Marca: ${inp.brand || "não informada"}`,
    `Categoria: ${inp.categoria || "não informada"}${inp.subcategoria ? " / " + inp.subcategoria : ""}`,
    inp.ean ? `EAN/GTIN: ${inp.ean}` : "",
    inp.notas ? `Notas de quem cadastrou: ${inp.notas}` : "",
    "", "MODELO DE FICHA PARA ESTE TIPO DE PRODUTO:", GUIA[tipo] || GUIA.geral, "",
  ];
  if (cats.length) {
    partes.push("CATEGORIAS DA LOJA (escolha em \"categoria_slug\" a subcategoria certa para este produto; prefira a mais específica e evite \"Outros\" quando outra servir):",
      ...cats.map((c) => `${c.slug} = ${c.nome}`), inp.categoria_slug_atual ? `Categoria atual: ${inp.categoria_slug_atual}` : "", "");
  }
  if (dossie) partes.push("DOSSIÊ DA PESQUISA NA INTERNET (fonte principal; confie nele antes do cadastro, e registre em \"avisos\" o que ele não confirmou):", dossie.slice(0, 7000), "");
  const jaTem: string[] = [];
  if (ex.description) jaTem.push(`Descrição atual: ${semAvisoIdade(String(ex.description)).slice(0, 600)}`);
  if (Array.isArray(ex.specs) && ex.specs.length) jaTem.push(`Ficha atual: ${JSON.stringify(ex.specs).slice(0, 600)}`);
  if (ex.flavor_profile) jaTem.push(`Perfil de sabor atual: ${JSON.stringify(ex.flavor_profile)}`);
  if (ex.whisky_details) jaTem.push(`Detalhes de whisky atuais: ${JSON.stringify(ex.whisky_details).slice(0, 800)}`);
  if (jaTem.length) partes.push("JÁ CADASTRADO (pode estar certo; preserve o que estiver correto):", ...jaTem, "");
  partes.push("Gere o JSON agora.");
  return partes.filter((x) => x !== undefined).join("\n");
}

export function extraiJson(texto: string): any {
  const t = String(texto || "").replace(/```json|```/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** Descrição que cabe no site (até DESC_MAX): corta na última frase completa, ou na última palavra */
export function compacta(txt: string, max: number = DESC_MAX): string {
  const s = semAvisoIdade(txt);
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const fim = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("! "), corte.lastIndexOf("? "));
  if (fim >= 60) return corte.slice(0, fim + 1);
  const sp = corte.lastIndexOf(" ");
  return corte.slice(0, sp > 60 ? sp : max).replace(/[,;:–-]\s*$/, "").replace(/\.+$/, "") + ".";
}

/** Garante o formato que o site sabe mostrar; descarta o que for lixo */
export function limpa(obj: any, tipo: string, cats: { slug: string }[] = []) {
  const out: any = { description: "", specs: [], flavor_profile: null, whisky_details: null, categoria_sugerida: null, avisos: [], confianca: "media" };
  if (!obj || typeof obj !== "object") return out;
  out.description = compacta(obj.description);
  const vistos = new Set<string>();
  for (const it of Array.isArray(obj.specs) ? obj.specs : []) {
    let k, v;
    if (Array.isArray(it)) [k, v] = it; else if (it && typeof it === "object") { k = (it as any).rotulo ?? (it as any).label; v = (it as any).valor ?? (it as any).value; }
    k = String(k ?? "").trim().slice(0, 40); v = semAvisoIdade(String(v ?? "")).slice(0, 160);
    if (!k || !v || VAZIO.test(v) || vistos.has(semAcento(k))) continue;
    vistos.add(semAcento(k)); out.specs.push([k, v]);
    if (out.specs.length >= 10) break;
  }
  if (tipo === "essencia" && obj.flavor_profile && typeof obj.flavor_profile === "object") {
    const fp: any = {}; let soma = 0;
    for (const e of EIXOS) { const n = Math.round(Number(obj.flavor_profile[e])); fp[e] = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0; soma += fp[e]; }
    out.flavor_profile = soma > 0 ? fp : null;
  }
  if (tipo === "whisky" && obj.whisky_details && typeof obj.whisky_details === "object") {
    const wd: any = {};
    for (const k of CHAVES_WHISKY) { const v = semAvisoIdade(String(obj.whisky_details[k] ?? "")).slice(0, 500); if (v && !VAZIO.test(v)) wd[k] = v; }
    out.whisky_details = Object.keys(wd).length ? wd : null;
  }
  const cs = String(obj.categoria_slug ?? "").trim();
  if (cs && cats.some((c) => c.slug === cs)) out.categoria_sugerida = cs;   // só slug que existe na lista enviada
  out.avisos = (Array.isArray(obj.avisos) ? obj.avisos : []).map((a: any) => String(a).trim().slice(0, 240)).filter(Boolean).slice(0, 8);
  out.confianca = ["alta", "media", "baixa"].includes(obj.confianca) ? obj.confianca : "media";
  return out;
}

export function fontesDe(data: any): { titulo: string; url: string }[] {
  const ch = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const vistos = new Set<string>(), out: { titulo: string; url: string }[] = [];
  for (const c of ch) {
    const url = c?.web?.uri; if (!url || vistos.has(url)) continue; vistos.add(url);
    out.push({ titulo: String(c.web.title || url).slice(0, 80), url });
    if (out.length >= 6) break;
  }
  return out;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function chamaGemini(apiKey: string, modelo: string, prompt: string, pesquisar: boolean, sistema = SISTEMA, jsonSaida = true) {
  const corpo: any = {
    system_instruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: jsonSaida ? 0.3 : 0.2, maxOutputTokens: 8192 },
  };
  if (pesquisar) corpo.tools = [{ google_search: {} }];
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(corpo),
  });
}

/** Etapa 1: pesquisa na internet e devolve um dossiê em texto + as fontes. Vazio se a pesquisa não estiver disponível. */
async function pesquisaDossie(apiKey: string, inp: any): Promise<{ texto: string; fontes: { titulo: string; url: string }[]; modelo: string }> {
  const q = [`Pesquise este produto e monte o dossiê:`, `Nome: ${inp.name}`, inp.brand ? `Marca: ${inp.brand}` : "", inp.ean ? `EAN/GTIN: ${inp.ean}` : "",
    `Categoria: ${inp.categoria || "?"}${inp.subcategoria ? " / " + inp.subcategoria : ""}`, inp.notas ? `Notas: ${inp.notas}` : ""].filter(Boolean).join("\n");
  for (const modelo of MODELOS) {
    try {
      const r = await chamaGemini(apiKey, modelo, q, true, SISTEMA_PESQUISA, false);
      if (!r.ok) { if (r.status === 404) continue; return { texto: "", fontes: [], modelo: "" }; }   // 400/403/429: pesquisa indisponível
      const d = await r.json();
      const texto = (d?.candidates?.[0]?.content?.parts || []).filter((p: any) => p.text).map((p: any) => p.text).join("\n").trim();
      if (texto.length > 80) return { texto, fontes: fontesDe(d), modelo };
    } catch (e) { console.error("dossiê", modelo, e); }
  }
  return { texto: "", fontes: [], modelo: "" };
}

/** Tenta os modelos em ordem. Se a pesquisa na internet for recusada, refaz sem pesquisar. */
export async function geraComReserva(apiKey: string, prompt: string, pesquisar: boolean) {
  let ultimo: Response | null = null, semPesquisa = false;
  for (const modelo of MODELOS) {
    if (pesquisar) {
      const r = await chamaGemini(apiKey, modelo, prompt, true);
      if (r.ok) return { resp: r, modelo, pesquisou: true, semPesquisa: false };
      ultimo = r;
      if (![400, 403, 404, 429].includes(r.status)) continue;
      if (r.status === 404) continue;
      semPesquisa = true;
    }
    const r2 = await chamaGemini(apiKey, modelo, prompt, false);
    if (r2.ok) return { resp: r2, modelo, pesquisou: false, semPesquisa: pesquisar || semPesquisa };
    ultimo = r2;
  }
  return { resp: ultimo as Response, modelo: "", pesquisou: false, semPesquisa };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ erro: "A chave do Gemini não está configurada no Supabase (GEMINI_API_KEY)." }, 500);

    const auth = req.headers.get("Authorization") || "";
    const rs = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/is_gestor`, { method: "POST",
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
    const ehEquipe = rs.ok ? await rs.json().catch(() => null) : null;
    if (ehEquipe !== true) return json({ erro: "Só o dono e os administradores podem usar o Sommelier." }, 403);

    const inp = await req.json();
    if (!inp?.name || !String(inp.name).trim()) return json({ erro: "Falta o nome do produto." }, 400);
    const tipo = tipoDe(inp.categoria || "", inp.subcategoria || "", inp.name);
    const pesquisar = inp.pesquisar !== false;
    const cats = categoriasDe(inp);

    // etapa 1: dossiê com pesquisa do Google
    let dossie = { texto: "", fontes: [] as { titulo: string; url: string }[], modelo: "" };
    if (pesquisar) dossie = await pesquisaDossie(apiKey, inp);

    // etapa 2: ficha (com o dossiê; se a etapa 1 falhou, cai no caminho antigo com pesquisa embutida)
    let g, pesquisou: boolean;
    if (dossie.texto) { g = await geraComReserva(apiKey, montaPrompt(inp, tipo, dossie.texto), false); pesquisou = true; }
    else { g = await geraComReserva(apiKey, montaPrompt(inp, tipo), pesquisar); pesquisou = g.pesquisou; }
    const resp = g.resp;
    const avisoExtra = pesquisar && !pesquisou ? "Sem pesquisa na internet (sua chave do Gemini não tem esse recurso liberado): a ficha vem do que o Gemini sabe e do cadastro. Confira antes de salvar." : "";
    if (!resp || !resp.ok) {
      const txt = resp ? (await resp.text()).slice(0, 300) : ""; console.error("Gemini", resp?.status, txt);
      if (resp?.status === 429) return json({ erro: "O limite do Gemini foi atingido por agora. Espere 1 minuto e tente de novo." }, 429);
      return json({ erro: "O Gemini não respondeu direito (código " + (resp?.status ?? "?") + "). Tente de novo em instantes." }, 502);
    }
    const data = await resp.json();
    const cand = data?.candidates?.[0];
    const texto = (cand?.content?.parts || []).filter((p: any) => p.text).map((p: any) => p.text).join("\n");
    if (!texto) return json({ erro: "A IA não quis analisar esse produto (conteúdo bloqueado). Preencha a ficha manualmente." }, 422);
    const bruto = extraiJson(texto);
    if (!bruto) { console.error("JSON ilegível:", texto.slice(0, 300)); return json({ erro: "A IA devolveu uma resposta que não consegui ler. Tente de novo." }, 502); }

    const fontes = dossie.texto ? dossie.fontes : (pesquisou ? fontesDe(data) : []);
    const limpo = limpa(bruto, tipo, cats);
    if (avisoExtra) limpo.avisos.unshift(avisoExtra);
    if (pesquisou && fontes.length === 0) limpo.avisos.push("A pesquisa não trouxe fontes confiáveis para este produto: revise com atenção.");
    limpo.modelo = g.modelo;
    return json({ ...limpo, tipo, pesquisou, fontes, modelo: g.modelo });
  } catch (e) {
    console.error(e);
    console.error("sommelier", e);
    return json({ erro: "Algo deu errado no Sommelier. Tente de novo em instantes." }, 500);   // detalhe só no log (não vaza para quem chamou)
  }
}

// @ts-ignore  (Deno)
if (typeof Deno !== "undefined" && (Deno as any).serve) (Deno as any).serve(handler);
