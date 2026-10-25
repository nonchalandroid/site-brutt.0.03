/* Carrossel de marcas (25/10/2026), logo abaixo de "Por que a Brutt".
   Só marcas que estão no catálogo da loja e só a logo OFICIAL (do site do fabricante ou do grupo dono da marca),
   deixada branca sem mudar o desenho. Arquivos em /imagens/marcas/<slug>.webp (120 px de altura).
   Marca sem logo oficial não entra (nada de texto no lugar). Fontes: imagens/marcas/FONTES.md.
   [slug, nome, largura do arquivo] — a altura é sempre 120. */
(() => {
  const MARCAS = [
    ["zomo", "Zomo", 272], ["lion-rolling-circus", "Lion Rolling Circus", 126], ["bem-bolado", "Bem Bolado", 355],
    ["johnnie-walker", "Johnnie Walker", 858], ["ocb", "OCB", 370], ["ballantines", "Ballantine's", 442],
    ["smoking", "Smoking", 315], ["jack-daniels", "Jack Daniel's", 177], ["baly", "Baly", 640],
    ["chivas", "Chivas Regal", 155], ["kaloud", "Kaloud", 531], ["smirnoff", "Smirnoff", 377],
    ["zengaz", "Zengaz", 904], ["jameson", "Jameson", 503], ["a-piteira", "A Piteira", 355],
    ["tanqueray", "Tanqueray", 320], ["beefeater", "Beefeater", 371],
    ["bombaco", "Bombaco", 440], ["bombay-sapphire", "Bombay Sapphire", 581], ["clipper", "Clipper", 232],
    ["buchanans", "Buchanan's", 600], ["sampoerna", "Sampoerna", 169], ["heineken", "Heineken", 233],
    ["corona", "Corona", 221], ["coca-cola", "Coca-Cola", 307],
  ];
  const box = document.getElementById("marcas");
  if (!box) return;
  // mesma "área" para todas: logo comprida fica mais baixa, logo quadrada mais alta (equilíbrio visual)
  const alt = w => Math.round(Math.min(46, Math.max(22, Math.sqrt(3600 / (w / 120)))));
  const item = ([s, n, w]) => { const h = alt(w);
    return `<li><img src="/imagens/marcas/${s}.webp" alt="${n}" width="${Math.round(w * h / 120)}" height="${h}" style="--h:${h}px" loading="lazy" decoding="async" draggable="false"></li>`; };
  const lista = MARCAS.map(item).join("");
  box.innerHTML = `<p class="marcas-t">Marcas que você encontra na Brutt</p>
    <div class="marcas-janela"><div class="marcas-pista"><ul class="marcas-lista">${lista}</ul><ul class="marcas-lista" aria-hidden="true">${lista}</ul></div></div>`;
  box.hidden = false;
  const pista = box.querySelector(".marcas-pista");
  // velocidade constante (~38 px/s), seja qual for a largura da tela
  const ajusta = () => { const meio = pista.scrollWidth / 2; if (meio > 0) pista.style.setProperty("--marcas-dur", (meio / 38).toFixed(1) + "s"); };
  ajusta(); addEventListener("resize", ajusta, { passive: true });
  // fora da tela, o letreiro para (não gasta bateria à toa)
  // as fotos só baixam perto da faixa; ao chegar, baixa todas de uma vez (senão as que entram andando aparecem vazias)
  const todas = () => box.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = "eager"; });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) todas(); }), { rootMargin: "600px 0px" }).observe(box);
    new IntersectionObserver(es => es.forEach(e => box.classList.toggle("parado", !e.isIntersecting))).observe(box);
  } else todas();
})();
