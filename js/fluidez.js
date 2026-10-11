/* Fluidez tipo app: scroll suave (Lenis) e navegação entre produtos no modal.
   Carregado depois do script principal: usa CATALOGO, byId, SECOES, sortBy, sortItems, ordenar e openProduct. */
(function(){
"use strict";
var reduz=window.matchMedia("(prefers-reduced-motion: reduce)");
var mouse=window.matchMedia("(hover:hover) and (pointer:fine)");
var EASE=function(t){return Math.min(1,1.001-Math.pow(2,-10*t))};

/* ───────── 1. Scroll fluido com Lenis ─────────
   Só em aparelhos com mouse/trackpad: no celular o scroll nativo (com o snap entre seções) é o mais
   estável, principalmente no iPhone. Contêineres com rolagem própria ficam de fora (prevent). */
var ROLA_PROPRIO="#drawer,#pm,.modal,#dlv,#ia,.ia-panel,#lbox,#rsv,.hdd,.ent-sug,[data-lenis-prevent]";
function iniciaLenis(){
  if(window.__lenis||!window.Lenis||!mouse.matches||reduz.matches)return;
  var lenis=new Lenis({duration:1.2,easing:EASE,smoothWheel:true,syncTouch:false,
    prevent:function(n){return n.matches&&n.matches(ROLA_PROPRIO)},
    /* o handler de "uma seção por giro" do site já tratou (preventDefault) → Lenis não duplica */
    virtualScroll:function(d){return !(d.event&&d.event.defaultPrevented)}});
  window.__lenis=lenis;
  function raf(t){lenis.raf(t);requestAnimationFrame(raf)}
  requestAnimationFrame(raf);
  /* Modal/carrinho aberto trava a página (html.is-locked): Lenis pausa junto. */
  var html=document.documentElement;
  new MutationObserver(function(){
    if(html.classList.contains("is-locked")){if(!lenis.isStopped)lenis.stop()}
    else if(lenis.isStopped){lenis.start();lenis.resize()}
  }).observe(html,{attributes:true,attributeFilter:["class"]});
}
iniciaLenis();

/* ───────── 2. Navegação entre produtos no modal ─────────
   Desktop: ← anterior / → próximo. Celular: deslizar p/ esquerda = próximo, p/ direita = anterior.
   Sempre dentro da mesma categoria (seção + subcategoria), na ordem em que aparece no catálogo. */
var pm=document.getElementById("pm");
function atualId(){var b=pm&&pm.querySelector(".pm-buy [data-add]");return b?b.dataset.add:null}
function listaDe(p){
  try{
    var itens=CATALOGO.filter(function(x){return x.sec===p.sec&&x.sub===p.sub});
    var sec=SECOES.find(function(s){return(s.sec||s.id)===p.sec&&s.sub===p.sub})||SECOES.find(function(s){return(s.sec||s.id)===p.sec&&!s.sub});
    if(!sec)return itens;
    var modo=sortBy[sec.id];
    return modo?sortItems(itens,modo):ordenar(sec,itens,false);
  }catch(e){return CATALOGO.filter(function(x){return x.sec===p.sec&&x.sub===p.sub})}
}
var animando=false;
function vai(dir,jaArrastou){
  var id=atualId();if(!id||!byId[id]||animando)return;
  var l=listaDe(byId[id]),i=l.findIndex(function(x){return x.id===id});
  if(i<0||l.length<2)return;
  var prox=l[i+dir];if(!prox){volta();return}     /* sem voltar ao início: não confunde o fim da categoria */
  var g=pm.querySelector(".pm-grid");
  var troca=function(){
    pm.classList.remove("nav-l","nav-r","sai-l","sai-r");void pm.offsetWidth;
    openProduct(prox.id);
    pm.scrollTop=0;
    pm.classList.add(dir>0?"nav-r":"nav-l");
    animando=false;
    try{var n=+(localStorage.getItem("brutt_carrossel")||0)+1;localStorage.setItem("brutt_carrossel",String(n))}catch(_){}
  };
  if(!g||reduz.matches){troca();return}
  animando=true;
  /* o produto atual sai para o lado (continuando de onde o dedo largou) e o próximo entra pelo outro */
  g.style.transition="";g.style.transform="";g.style.opacity="";
  if(jaArrastou)g.style.setProperty("--de",jaArrastou+"px");
  pm.classList.add(dir>0?"sai-l":"sai-r");
  setTimeout(troca,170);
}
function volta(){var g=pm&&pm.querySelector(".pm-grid");if(!g)return;g.style.transition="transform .35s var(--ease-app),opacity .35s var(--ease-app)";g.style.transform="";g.style.opacity="";setTimeout(function(){g.style.transition=""},360)}

/* setas + dica "deslize" + posição na categoria, desenhadas a cada produto aberto */
var SETA='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
var MAO='<svg class="pm-mao" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.5V5.8a1.6 1.6 0 0 1 3.2 0v5.2"/><path d="M12.2 10.6v-.9a1.6 1.6 0 0 1 3.2 0v1.6"/><path d="M15.4 11.1a1.6 1.6 0 0 1 3.1.4v2.8c0 3.3-2.3 6.2-5.6 6.2h-.7c-1.9 0-3.4-.9-4.4-2.5l-2.3-3.7a1.5 1.5 0 0 1 2.4-1.8l1.1 1.3"/><path d="M3 5.5h3.5M3 5.5l1.4-1.4M3 5.5l1.4 1.4M21 5.5h-3.5M21 5.5l-1.4-1.4M21 5.5l-1.4 1.4"/></svg>';
var toque=window.matchMedia("(hover:none) and (pointer:coarse)");
function decorar(){
  if(!pm)return;
  var id=atualId(),esq=pm.querySelector(".pm-left");if(!id||!esq||!byId[id])return;
  var l=listaDe(byId[id]),i=l.findIndex(function(x){return x.id===id});
  if(i<0||l.length<2)return;
  var visto=0;try{visto=+(localStorage.getItem("brutt_carrossel")||0)}catch(_){}
  var dica=visto<4?(toque.matches?"Deslize para ver outros":"Use ← → para navegar"):"";
  esq.classList.add("pm-car");
  esq.insertAdjacentHTML("beforeend",
    '<button type="button" class="pm-seta ant" data-pm-nav="-1" aria-label="Produto anterior"'+(i===0?" disabled":"")+'>'+SETA+'</button>'
   +'<button type="button" class="pm-seta prox" data-pm-nav="1" aria-label="Próximo produto"'+(i===l.length-1?" disabled":"")+'>'+SETA+'</button>'
   +'<div class="pm-dica">'+(dica?MAO+'<span>'+dica+'</span><i aria-hidden="true">·</i>':"")+'<b>'+(i+1)+'/'+l.length+'</b></div>');
  centra();
}
/* setas no meio vertical da foto (a altura da foto muda conforme a largura da tela) */
function centra(){var esq=pm&&pm.querySelector(".pm-left.pm-car"),im=esq&&esq.querySelector(".m-img");if(im)esq.style.setProperty("--seta-y",(im.offsetTop+im.offsetHeight/2)+"px")}
window.addEventListener("resize",centra,{passive:true});
if(typeof openProduct==="function"){var _abre=openProduct;openProduct=function(id){_abre(id);decorar()}}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-pm-nav]");if(!b||b.disabled)return;e.stopPropagation();vai(+b.dataset.pmNav)},true);
function digitando(el){return el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))}
function outroPorCima(){var d=document.getElementById("dlv");return!!(document.getElementById("lbox")||document.getElementById("rsv")||(d&&!d.hidden)||document.querySelector("#drawer.on")||document.querySelector(".ia[data-state=open]"))}
document.addEventListener("keydown",function(e){
  if(!pm||!pm.classList.contains("on")||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
  if(digitando(e.target)||digitando(document.activeElement)||outroPorCima())return;
  e.preventDefault();vai(e.key==="ArrowRight"?1:-1);
});
if(pm){
  var sx=0,sy=0,st=0,ok=false,horiz=null,dx=0;
  pm.addEventListener("touchstart",function(e){
    var t=e.touches[0];ok=e.touches.length===1&&!animando&&!digitando(e.target)&&!(e.target.closest&&e.target.closest(".rail,.up-r,.chips2,.flavor,input,textarea,.pm-seta"));
    horiz=null;dx=0;
    if(t){sx=t.clientX;sy=t.clientY;st=performance.now()}
  },{passive:true});
  /* o produto acompanha o dedo enquanto o gesto for horizontal (carrossel) */
  pm.addEventListener("touchmove",function(e){
    if(!ok||reduz.matches)return;var t=e.touches[0];if(!t)return;
    var mx=t.clientX-sx,my=t.clientY-sy;
    if(horiz===null&&(Math.abs(mx)>10||Math.abs(my)>10))horiz=Math.abs(mx)>Math.abs(my)*1.2;
    if(!horiz)return;
    dx=mx;var g=pm.querySelector(".pm-grid");if(!g)return;
    g.style.transition="none";g.style.transform="translateX("+(dx*.55)+"px)";g.style.opacity=String(Math.max(.35,1-Math.abs(dx)/600));
  },{passive:true});
  pm.addEventListener("touchend",function(e){
    if(!ok)return;ok=false;
    var t=e.changedTouches[0];if(!t){volta();return}
    var fx=t.clientX-sx,fy=t.clientY-sy;
    /* gesto claramente horizontal: evita confundir com a rolagem vertical do modal */
    if(Math.abs(fx)<60||Math.abs(fx)<Math.abs(fy)*1.6||performance.now()-st>900||outroPorCima()){if(horiz)volta();return}
    vai(fx<0?1:-1,Math.round(fx*.55));
  },{passive:true});
  pm.addEventListener("touchcancel",function(){ok=false;if(horiz)volta()},{passive:true});
}

/* ───────── Intro (brasa) ─────────
   Some quando o catálogo aparece. Na 1ª visita da sessão fica no mínimo ~1,4 s pra animação não piscar;
   nas seguintes só enquanto carrega. O <script> junto do #intro remove tudo em 9 s se algo falhar. */
(function(){
  var intro=document.getElementById("intro");if(!intro)return;
  var primeira=true;try{primeira=!sessionStorage.getItem("brutt_intro");sessionStorage.setItem("brutt_intro","1")}catch(_){}
  var MIN=reduz.matches||!primeira?0:1400,foi=false;
  function some(){
    if(foi)return;foi=true;
    setTimeout(function(){intro.classList.add("sai");setTimeout(function(){intro.remove()},650)},Math.max(0,MIN-performance.now()));
  }
  var sec=document.getElementById("sections");
  function pronto(){return !sec||(sec.firstElementChild&&sec.textContent.indexOf("Carregando catálogo")<0)}
  if(pronto()){some();return}
  var mo=new MutationObserver(function(){if(pronto()){mo.disconnect();some()}});
  mo.observe(sec,{childList:true,subtree:true});
  setTimeout(function(){mo.disconnect();some()},6000);
})();

/* ───────── Rolando? ─────────
   Marca html.rolando durante qualquer rolagem (página ou trilho horizontal) para o CSS pausar as animações
   decorativas que repintam a tela; tira 160 ms depois que a rolagem para. */
(function(){
  var raiz=document.documentElement,t=null;
  document.addEventListener("scroll",function(){
    if(!t)raiz.classList.add("rolando");
    clearTimeout(t);t=setTimeout(function(){t=null;raiz.classList.remove("rolando")},160);
  },{capture:true,passive:true});
})();
})();
