/* ───────── Menu do topo como carrossel (celular e PC) ─────────
   Os itens do #menu se repetem (cópias aria-hidden) numa fita sem fim: a posição é mantida dentro da cópia do
   meio, então dá pra rolar pros dois lados sem chegar no fim. A fita anda devagar sozinha; para quando a
   pessoa passa o mouse, toca, arrasta, usa as setas ou o teclado, e volta a andar alguns segundos depois.
   Setas = um passo animado; no PC dá pra arrastar com o mouse. Com prefers-reduced-motion não anda sozinha. */
(function(){
  var nav=document.querySelector(".navwrap nav"),ul=document.getElementById("menu"),
    L=document.getElementById("navL"),R=document.getElementById("navR");
  if(!nav||!ul)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var VEL=28;                         /* px por segundo */
  var setW=0,pos=0,ultimoSet=0,pausa=0,mouseEm=false,toque=false,anima=null,tFim=0,montando=false;
  document.documentElement.classList.add("menu-carrossel");

  function originais(){return[].filter.call(ul.children,function(li){return!li.classList.contains("nv-clone")})}
  function montar(){
    var o=originais();if(!o.length)return;
    montando=true;
    [].slice.call(ul.querySelectorAll(".nv-clone")).forEach(function(li){li.remove()});
    var rel=setW?(nav.scrollLeft%setW):0,larg=ul.scrollWidth;if(!larg){montando=false;return}
    var cw=nav.clientWidth,copias=Math.max(3,Math.ceil(cw/larg)+2),prim=null;
    for(var c=1;c<copias;c++)o.forEach(function(li){
      var k=li.cloneNode(true);k.classList.add("nv-clone");k.setAttribute("aria-hidden","true");
      k.querySelectorAll("a,button").forEach(function(a){a.tabIndex=-1});ul.appendChild(k);if(!prim)prim=k});
    setW=prim.offsetLeft-o[0].offsetLeft;            /* largura de uma volta (sem o recuo da lista) */
    vai(setW+rel);
    setTimeout(function(){montando=false},0);
  }
  function vai(x){pos=x;nav.scrollLeft=x;ultimoSet=nav.scrollLeft}
  /* mantém a posição na cópia do meio (mesma imagem na tela, só troca de cópia) */
  function volta(){if(!setW)return;var x=nav.scrollLeft;
    if(x<setW*.5)vai(x+setW);else if(x>=setW*1.5)vai(x-setW)}

  function pausar(ms){pausa=Math.max(pausa,performance.now()+(ms||0))}
  function parado(now){var f=document.activeElement;
    return calma||mouseEm||toque||anima||document.hidden||now<pausa||(nav.contains(f)&&f.matches(":focus-visible"))}

  var ult=0;
  function quadro(now){
    requestAnimationFrame(quadro);
    var dt=Math.min(.05,(now-(ult||now))/1000);ult=now;
    if(!setW||parado(now)){pos=nav.scrollLeft;return}
    pos+=VEL*dt;nav.scrollLeft=pos;ultimoSet=nav.scrollLeft;volta();
  }

  /* rolagem feita pela pessoa (dedo, trackpad): pausa e, quando para, volta pra cópia do meio */
  nav.addEventListener("scroll",function(){
    if(Math.abs(nav.scrollLeft-ultimoSet)>1&&!anima){pausar(3500)}
    clearTimeout(tFim);tFim=setTimeout(function(){if(!anima)volta()},160);
    if(nav.scrollLeft<=2||nav.scrollLeft>=nav.scrollWidth-nav.clientWidth-2)volta();
  },{passive:true});
  nav.addEventListener("pointerenter",function(e){if(e.pointerType==="mouse")mouseEm=true});
  nav.addEventListener("pointerleave",function(e){if(e.pointerType==="mouse"){mouseEm=false;pausar(1200)}});
  nav.addEventListener("touchstart",function(){toque=true},{passive:true});
  nav.addEventListener("touchend",function(){toque=false;pausar(4000)},{passive:true});
  nav.addEventListener("touchcancel",function(){toque=false;pausar(4000)},{passive:true});

  /* setas: um passo animado (por cima do onclick antigo, que rolava até o fim) */
  function passo(dir){
    if(!setW)return;volta();pausar(4000);
    var de=nav.scrollLeft,ate=de+dir*Math.max(160,nav.clientWidth*.6),t0=performance.now(),dur=calma?1:480;
    anima=true;
    (function f(now){var k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);vai(de+(ate-de)*e);
      if(k<1)requestAnimationFrame(f);else{anima=null;volta();pausar(4000)}})(t0);
  }
  if(L)L.onclick=function(){passo(-1)};
  if(R)R.onclick=function(){passo(1)};

  /* PC: arrastar com o mouse (clique depois de arrastar não abre o link) */
  var arr=null;
  nav.addEventListener("pointerdown",function(e){if(e.pointerType!=="mouse"||e.button!==0)return;arr={x:e.clientX,s:nav.scrollLeft,mov:false}});
  addEventListener("pointermove",function(e){if(!arr)return;var dx=e.clientX-arr.x;
    if(!arr.mov&&Math.abs(dx)>5){arr.mov=true;nav.classList.add("arrastando")}
    if(arr.mov){vai(arr.s-dx);pausar(3000)}});
  addEventListener("pointerup",function(){if(!arr)return;var m=arr.mov;arr=null;nav.classList.remove("arrastando");volta();
    if(m){var bloq=function(ev){ev.preventDefault();ev.stopPropagation()};nav.addEventListener("click",bloq,{capture:true,once:true});setTimeout(function(){nav.removeEventListener("click",bloq,true)},0)}});

  /* o menu é redesenhado quando o catálogo carrega: monta de novo (as cópias nossas não disparam isso) */
  new MutationObserver(function(){if(!montando&&!ul.querySelector(".nv-clone"))requestAnimationFrame(montar)}).observe(ul,{childList:true});
  var tR=0;addEventListener("resize",function(){clearTimeout(tR);tR=setTimeout(montar,150)});
  addEventListener("load",montar);
  montar();requestAnimationFrame(quadro);
})();
