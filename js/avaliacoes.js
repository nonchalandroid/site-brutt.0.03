/* ───────── Avaliações do Google (carrossel no rodapé, depois do Como chegar) ─────────
   Lê a função avaliacoes (Supabase), que busca no Google e guarda por 12 h. Sem dados (sem chave, erro),
   a seção #avaliacoes continua escondida. Cartões em trilho horizontal com encaixe; passa sozinho a cada
   6 s e para com mouse, toque ou foco; setas e "Ler mais". Tudo que vem do Google passa por esc(). */
(function(){
  var sec=document.getElementById("avaliacoes"),rail=document.getElementById("avRail"),S=window.__SUPA;
  if(!sec||!rail||!S)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function icone(n){try{return ic(n)}catch(e){return""}}
  function estrelas(nota){var h="";for(var i=1;i<=5;i++)h+=icone(nota>=i-.25?"star":nota>=i-.75?"starHalf":"starVazia");
    return'<span class="av-est" role="img" aria-label="'+String(nota).replace(".",",")+' de 5 estrelas">'+h+"</span>"}
  function inicial(n){return esc((String(n).trim()[0]||"?").toUpperCase())}
  function cartao(v){
    var foto=v.foto?'<img src="'+esc(v.foto)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="40" height="40">':"";
    var nome=v.perfil?'<a href="'+esc(v.perfil)+'" target="_blank" rel="noopener nofollow">'+esc(v.nome)+"</a>":esc(v.nome);
    return'<article class="av-card"><div class="av-cab"><span class="av-foto" data-i="'+inicial(v.nome)+'">'+foto+"</span>"
      +'<div><b>'+nome+"</b>"+estrelas(v.nota)+(v.quando?"<small>"+esc(v.quando)+"</small>":"")+"</div></div>"
      +(v.texto?'<p class="av-txt">'+esc(v.texto)+"</p>":'<p class="av-txt av-sem">Avaliou com '+v.nota+" estrela"+(v.nota>1?"s":"")+".</p>")
      +'<button type="button" class="av-mais" hidden>Ler mais</button></article>';
  }
  function desenha(d){
    var lista=(d.avaliacoes||[]).slice().sort(function(a,b){return(b.nota-a.nota)||((b.texto?1:0)-(a.texto?1:0))||String(b.data).localeCompare(String(a.data))});
    if(!lista.length)return;
    var res=document.getElementById("avResumo");
    if(res&&d.nota)res.innerHTML='<b>'+String(d.nota).replace(".",",")+"</b>"+estrelas(d.nota)+(d.total?"<span>"+d.total.toLocaleString("pt-BR")+" avaliações</span>":"");
    var todas=document.getElementById("avTodas");if(todas){if(d.link)todas.href=d.link;else todas.hidden=true}
    rail.innerHTML=lista.map(cartao).join("");
    sec.hidden=false;
    /* "Ler mais" só onde o texto foi cortado */
    requestAnimationFrame(function(){rail.querySelectorAll(".av-card").forEach(function(c){var p=c.querySelector(".av-txt");if(p&&p.scrollHeight>p.clientHeight+2)c.querySelector(".av-mais").hidden=false})});
    rail.querySelectorAll(".av-foto img").forEach(function(im){im.addEventListener("error",function(){im.remove()},{once:true})});
    roda();
  }

  /* carrossel: passo = um cartão; no fim volta pro começo */
  function passo(dir){var c=rail.querySelector(".av-card");if(!c)return;var w=c.getBoundingClientRect().width+12;
    var fim=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-4,ini=rail.scrollLeft<=4;
    rail.scrollTo({left:dir>0&&fim?0:dir<0&&ini?rail.scrollWidth:rail.scrollLeft+dir*w,behavior:calma?"auto":"smooth"})}
  var pausa=0,parado=false,t=0;
  function roda(){if(calma)return;clearInterval(t);t=setInterval(function(){
    if(parado||document.hidden||Date.now()<pausa)return;var r=sec.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;passo(1)},6000)}
  sec.addEventListener("pointerenter",function(e){if(e.pointerType==="mouse")parado=true});
  sec.addEventListener("pointerleave",function(e){if(e.pointerType==="mouse"){parado=false;pausa=Date.now()+2000}});
  rail.addEventListener("touchstart",function(){pausa=Date.now()+8000},{passive:true});
  sec.addEventListener("focusin",function(){parado=true});sec.addEventListener("focusout",function(){parado=false});
  sec.addEventListener("click",function(e){
    var b=e.target.closest("[data-av]");if(b){pausa=Date.now()+8000;passo(+b.dataset.av);return}
    var m=e.target.closest(".av-mais");if(m){var c=m.closest(".av-card");var aberto=c.classList.toggle("aberto");m.textContent=aberto?"Ler menos":"Ler mais";pausa=Date.now()+15000}
  });

  function busca(){
    fetch(S.url+"/functions/v1/avaliacoes",{headers:{apikey:S.key,Authorization:"Bearer "+S.key}})
      .then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&d.ok)desenha(d)}).catch(function(){});
  }
  /* depois da carga: não disputa banda com o catálogo */
  function depois(){(window.requestIdleCallback||function(f){setTimeout(f,1200)})(busca,{timeout:4000})}
  if(document.readyState==="complete")depois();else addEventListener("load",depois,{once:true});
})();
