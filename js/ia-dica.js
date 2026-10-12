/* ───────── Brutt IA: balão "Assistente" ao lado da bolinha ─────────
   A IA começa minimizada na bolinha (canto inferior direito). 1 s depois que o site carrega por inteiro
   (evento load + intro da brasa fora + aviso de 18+ respondido + nada aberto), um balão surge da fumaça ao
   lado da bolinha, fica uns segundos e se desfaz como fumaça subindo. Tocar no balão abre a IA (igual à
   bolinha). Uma vez por sessão. Só transform/opacity; com reduced-motion, só aparece e some. */
(function(){
  var orb=document.getElementById("iaOrb"),ia=document.getElementById("ia");
  if(!orb||!ia)return;
  try{if(sessionStorage.getItem("brutt_ia_dica"))return}catch(e){}
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TITULO="Assistente",SUB="Tire dúvidas e monte seu pedido comigo";

  function livre(){
    var age=document.getElementById("age"),h=document.documentElement;
    return !document.getElementById("intro")&&!(age&&age.classList.contains("on"))&&!h.classList.contains("is-locked")
      &&ia.dataset.state==="hidden"&&getComputedStyle(orb).visibility==="visible";
  }
  function quandoLivre(fn){var n=0,t=setInterval(function(){if(livre()){clearInterval(t);fn()}else if(++n>240)clearInterval(t)},250)}

  var el,fora=0;
  /* cada letra num span (pra virar fumaça), agrupadas por palavra pra quebra de linha não cortar no meio */
  function letras(s,cls){var k=0;return s.split(" ").map(function(w){return'<span class="w">'+w.split("").map(function(c){
    return'<span class="'+cls+'" style="--k:'+(k++)+';--dx:'+((Math.random()-.5)*26).toFixed(1)+'px;--rot:'+((Math.random()-.5)*30).toFixed(0)+'deg">'+c+"</span>"}).join("")+"</span>"}).join(" ")}
  function fumacas(n){var h="";for(var i=0;i<n;i++)h+='<i style="--x:'+(8+Math.random()*84).toFixed(0)+'%;--s:'+(.6+Math.random()*.9).toFixed(2)+';--d:'+(Math.random()*.35).toFixed(2)+'s;--dx:'+((Math.random()-.5)*40).toFixed(0)+'px"></i>';return h}

  function mostra(){
    try{sessionStorage.setItem("brutt_ia_dica","1")}catch(e){}
    el=document.createElement("button");el.type="button";el.className="ia-dica";el.setAttribute("aria-label","Abrir o assistente Brutt IA");
    el.innerHTML='<span class="ia-dica-fum" aria-hidden="true">'+fumacas(7)+'</span><b>'+letras(TITULO,"l")+'</b><small>'+letras(SUB,"l s")+'</small>';
    document.body.appendChild(el);posiciona();
    el.addEventListener("click",function(){some(true);orb.click()});
    requestAnimationFrame(function(){el.classList.add("on")});
    fora=setTimeout(function(){some(false)},calma?5000:5600);
    /* abriu a IA por outro caminho ou rolou a página: o balão vai embora */
    new MutationObserver(function(){if(ia.dataset.state!=="hidden")some(true)}).observe(ia,{attributes:true,attributeFilter:["data-state"]});
    addEventListener("resize",posiciona);
  }
  function posiciona(){if(!el)return;var r=orb.getBoundingClientRect();
    el.style.right=Math.max(8,innerWidth-r.left+10)+"px";el.style.bottom=Math.max(8,innerHeight-r.bottom+(r.height-el.offsetHeight)/2)+"px"}
  function some(rapido){
    if(!el||el.classList.contains("sai"))return;clearTimeout(fora);
    el.classList.remove("on");el.classList.add("sai");if(rapido)el.classList.add("ja");
    var x=el;setTimeout(function(){x.remove();removeEventListener("resize",posiciona)},rapido?300:1500);
  }

  function comeca(){quandoLivre(function(){setTimeout(function(){if(livre())mostra()},1000)})}
  if(document.readyState==="complete")comeca();else addEventListener("load",comeca,{once:true});
})();
