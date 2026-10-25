/* Páginas por categoria (/categoria/<slug>/, 25/10/2026): carrega os produtos ATIVOS da(s) categoria(s) no Supabase (chave anon,
   mesmas colunas que a loja pode ler) e desenha por subcategoria. Preço e estoque sempre do banco (o Nex atualiza a cada 15 min).
   Configuração em window.__CAT = {slugs:[…], ord:[…]} (escrita por scripts/gerar-categorias.py). */
(function(){
  var U="https://vedlxtljilsanykmddtj.supabase.co/rest/v1/",K="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZGx4dGxqaWxzYW55a21kZHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NjYzNzUsImV4cCI6MjEwNjE0MjM3NX0.JlUPvGdomBHLlu5ei5dEb1qFR4FZ2nC45JTZUJ-IN6g",H={apikey:K,Authorization:"Bearer "+K};
  var cfg=window.__CAT||{slugs:[]},area=document.getElementById("produtos"),subs=document.getElementById("subs");
  /* +18: mesma chave da loja (localStorage.brutt_18) */
  try{if(JSON.parse(localStorage.getItem("brutt_18")||"false")!==true)document.getElementById("idade").hidden=false}catch(e){document.getElementById("idade").hidden=false}
  document.getElementById("idadeSim").onclick=function(){try{localStorage.setItem("brutt_18","true")}catch(e){}document.getElementById("idade").hidden=true};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function brl(v){return Number(v).toFixed(2).replace(".",",")}
  function get(q){return fetch(U+q,{headers:H}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})}
  function idSlug(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
  get("categories?select=id,slug,name,parent_id").then(function(cats){
    var tops=cats.filter(function(c){return cfg.slugs.indexOf(c.slug)>=0&&!c.parent_id}).map(function(c){return c.id});
    var nome={},ids=[];cats.forEach(function(c){if(tops.indexOf(c.id)>=0||tops.indexOf(c.parent_id)>=0){ids.push(c.id);nome[c.id]=c.parent_id?c.name:"Outros"}});
    if(!ids.length)throw new Error("categoria");
    return get("products?select=id,site_product_id,name,brand,price,promo_price,stock,icon,sales_count,sort_priority,category_id&is_active=eq.true&category_id=in.("+ids.join(",")+")").then(function(ps){
      var pids=ps.map(function(p){return p.id});
      return (pids.length?get("product_images?select=product_id,url,is_primary,mini_url&product_id=in.("+pids.join(",")+")"):Promise.resolve([])).then(function(imgs){return{ps:ps,imgs:imgs,nome:nome}});
    });
  }).then(function(d){
    var foto={};d.imgs.forEach(function(i){if(!foto[i.product_id]||i.is_primary)foto[i.product_id]=/^https:\/\//.test(i.mini_url||"")?i.mini_url:i.url});
    var grupos={};d.ps.forEach(function(p){var g=d.nome[p.category_id]||"Outros";(grupos[g]=grupos[g]||[]).push(p)});
    var ord=cfg.ord||[],nomes=Object.keys(grupos).sort(function(a,b){var ia=ord.indexOf(a),ib=ord.indexOf(b);ia=ia<0?99:ia;ib=ib<0?99:ib;return ia-ib||a.localeCompare(b,"pt")});
    if(!nomes.length){area.innerHTML='<p class="vazio">Nenhum produto disponível agora. <a href="/">Veja o catálogo completo</a>.</p>';return}
    subs.innerHTML=nomes.length>1?nomes.map(function(n){return'<a href="#'+idSlug(n)+'">'+esc(n)+"</a>"}).join(""):"";
    area.innerHTML=nomes.map(function(n){
      var l=grupos[n].sort(function(a,b){return((b.stock>0)-(a.stock>0))||((b.sales_count||0)-(a.sales_count||0))||((a.sort_priority==null?99:a.sort_priority)-(b.sort_priority==null?99:b.sort_priority))});
      return'<section class="grupo" id="'+idSlug(n)+'"><h2>'+esc(n)+"<small>"+l.length+(l.length===1?" produto":" produtos")+'</small></h2><div class="grade">'+l.map(function(p){
        var promo=Number(p.promo_price)>0&&Number(p.promo_price)<Number(p.price),v=promo?p.promo_price:p.price,f=foto[p.id],esg=!(p.stock>0);
        var img=/^https:\/\//.test(f||"")?'<img src="'+esc(f)+'" alt="'+esc(p.name)+'" loading="lazy" decoding="async" width="200" height="200">':esc(p.icon||"📦");
        return'<a class="pc'+(esg?" esg":"")+'" href="/#produto-'+encodeURIComponent(p.site_product_id)+'">'+(esg?'<span class="tag">Esgotado</span>':"")+'<span class="ft">'+img+"</span><h3>"+esc(p.name)+'</h3><span class="pr"><small>R$</small>'+brl(v)+"</span>"+(promo?'<span class="old">R$ '+brl(p.price)+"</span>":"")+"</a>"}).join("")+"</div></section>"}).join("");
  }).catch(function(){area.innerHTML='<p class="vazio">Não deu para carregar os produtos agora. <a href="/">Abra o catálogo completo</a>.</p>'});
})();
