/* ───────── Desempenho do aparelho (complementa o <script> do <head> que põe html.fx-alto / fx-leve) ─────────
   1. Medição: 4 s depois da carga, com a página parada, conta 2 s de quadros. Mediana acima de 40 ms ou mais de
      20% de quadros travados (>50 ms) = aparelho fraco: vira fx-leve na hora e fica guardado 7 dias
      (localStorage.brutt_fx); senão guarda "alto". Aba em segundo plano não conta.
   2. Aparelho forte: as fotos das próximas seções começam a baixar ~2 telas antes de chegar nelas (o lazy do
      Safari só baixa quando já está quase na tela, e as seções apareciam vazias ao rolar rápido). */
(function(){
  var h=document.documentElement;
  function guarda(v){try{localStorage.setItem("brutt_fx",JSON.stringify({v:v,t:Date.now()}))}catch(e){}}
  function mede(){
    if(document.hidden)return;
    var t=[],ult=0,ini=performance.now();
    (function f(now){if(document.hidden)return;if(ult)t.push(now-ult);ult=now;if(now-ini<2000)requestAnimationFrame(f);else avalia(t)})(ini);
  }
  function avalia(t){
    if(t.length<20)return;
    var o=t.slice().sort(function(a,b){return a-b}),med=o[o.length>>1],ruins=t.filter(function(x){return x>50}).length/t.length;
    var leve=med>40||ruins>.2;guarda(leve?"leve":"alto");
    if(leve&&h.classList.contains("fx-alto")){h.classList.remove("fx-alto");h.classList.add("fx-leve");window.__FX="leve"}
  }
  function depois(){setTimeout(mede,4000)}
  if(document.readyState==="complete")depois();else addEventListener("load",depois,{once:true});

  /* fotos das próximas seções antes de chegar nelas (só aparelho forte, sem economia de dados) */
  var area=document.getElementById("sections");
  if(!area||!window.IntersectionObserver||window.__FX!=="alto")return;
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting)return;io.unobserve(e.target);
    [].slice.call(e.target.querySelectorAll('img[loading="lazy"]'),0,10).forEach(function(i){i.loading="eager"});
  })},{rootMargin:"0px 0px 1800px 0px"});
  function observa(){if(window.__FX!=="alto")return;area.querySelectorAll("section.sec").forEach(function(s){io.observe(s)})}
  new MutationObserver(function(){requestAnimationFrame(observa)}).observe(area,{childList:true});
  observa();
})();
