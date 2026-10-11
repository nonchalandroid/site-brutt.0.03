/* Fluidez tipo app: scroll suave (Lenis), rastro do dedo/mouse e navegação entre produtos no modal.
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

/* ───────── 2. Rastro do dedo/mouse (estilo Robinhood) ─────────
   Canvas fixo, pointer-events:none, só anima enquanto há movimento (para o loop quando some). */
(function(){
  if(reduz.matches)return;
  var cv=document.createElement("canvas");
  cv.className="trail";cv.setAttribute("aria-hidden","true");
  document.body.appendChild(cv);
  var ctx=cv.getContext("2d");if(!ctx){cv.remove();return}
  var W=0,H=0,dpr=1;
  function tamanho(){dpr=Math.min(window.devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  tamanho();addEventListener("resize",tamanho,{passive:true});
  var N=22,pts=[],alvo={x:0,y:0},cab={x:0,y:0},vivo=false,rodando=false,ultimo=0,toque=false;
  var acento=0,acentoAlvo=0,alpha=0;
  /* Violeta na tela principal; verde → azul sobre preços e botões de adicionar. */
  var VIO=[[109,40,217],[178,140,255]],ACC=[[34,229,122],[47,139,255]];
  function mix(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
  function cor(i){var t=i/(N-1);var c=mix(mix(VIO[0],VIO[1],t),mix(ACC[0],ACC[1],t),acento);return"rgb("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+")"}
  function mexeu(x,y,el,ehToque){
    alvo.x=x;alvo.y=y;toque=ehToque;
    if(!vivo){cab.x=x;cab.y=y;pts=[];for(var i=0;i<N;i++)pts.push({x:x,y:y});vivo=true}
    acentoAlvo=el&&el.closest&&el.closest('[data-trail="accent"]')?1:0;
    ultimo=performance.now();
    if(!rodando){rodando=true;requestAnimationFrame(quadro)}
  }
  addEventListener("pointermove",function(e){if(e.pointerType!=="touch")mexeu(e.clientX,e.clientY,e.target,false)},{passive:true});
  addEventListener("touchstart",function(e){var t=e.touches[0];if(t){vivo=false;mexeu(t.clientX,t.clientY,e.target,true)}},{passive:true});
  addEventListener("touchmove",function(e){var t=e.touches[0];if(t)mexeu(t.clientX,t.clientY,e.target,true)},{passive:true});
  document.addEventListener("mouseleave",function(){ultimo=0},{passive:true});
  var antes=0;
  function quadro(t){
    var dt=Math.min(48,t-(antes||t))/16.667;antes=t;
    /* lerp normalizado pelo tempo do quadro: mesmo atraso suave a 60 ou 120 Hz */
    var k=1-Math.pow(1-(toque?.42:.28),dt);
    cab.x+=(alvo.x-cab.x)*k;cab.y+=(alvo.y-cab.y)*k;
    acento+=(acentoAlvo-acento)*(1-Math.pow(1-.18,dt));
    pts.pop();pts.unshift({x:cab.x,y:cab.y});
    var parado=t-ultimo>(toque?220:380);
    alpha+=((parado?0:1)-alpha)*(1-Math.pow(1-(parado?.12:.25),dt));
    ctx.clearRect(0,0,W,H);
    if(alpha>.01){
      ctx.lineCap="round";ctx.lineJoin="round";ctx.globalCompositeOperation="lighter";
      for(var i=N-1;i>0;i--){
        var a=pts[i],b=pts[i-1];if(a.x===b.x&&a.y===b.y)continue;
        var f=1-i/N;
        ctx.strokeStyle=cor(N-1-i);
        ctx.globalAlpha=alpha*f*.22;ctx.lineWidth=(toque?18:14)*f+2;   /* brilho largo e fraco (sem blur) */
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        ctx.globalAlpha=alpha*f*.9;ctx.lineWidth=(toque?6:4.5)*f+.6;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
    }
    if(parado&&alpha<.01){rodando=false;vivo=false;antes=0;ctx.clearRect(0,0,W,H);return}
    requestAnimationFrame(quadro);
  }
})();

/* ───────── 3. Navegação entre produtos no modal ─────────
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
function vai(dir){
  var id=atualId();if(!id||!byId[id])return;
  var l=listaDe(byId[id]),i=l.findIndex(function(x){return x.id===id});
  if(i<0||l.length<2)return;
  var prox=l[i+dir];if(!prox)return;     /* sem voltar ao início: não confunde o fim da categoria */
  pm.classList.remove("nav-l","nav-r");void pm.offsetWidth;
  openProduct(prox.id);
  pm.scrollTop=0;
  pm.classList.add(dir>0?"nav-r":"nav-l");
}
function digitando(el){return el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))}
function outroPorCima(){var d=document.getElementById("dlv");return!!(document.getElementById("lbox")||document.getElementById("rsv")||(d&&!d.hidden)||document.querySelector("#drawer.on")||document.querySelector(".ia[data-state=open]"))}
document.addEventListener("keydown",function(e){
  if(!pm||!pm.classList.contains("on")||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
  if(digitando(e.target)||digitando(document.activeElement)||outroPorCima())return;
  e.preventDefault();vai(e.key==="ArrowRight"?1:-1);
});
if(pm){
  var sx=0,sy=0,st=0,ok=false;
  pm.addEventListener("touchstart",function(e){
    var t=e.touches[0];ok=e.touches.length===1&&!digitando(e.target)&&!(e.target.closest&&e.target.closest(".rail,.up-r,.chips2,.flavor,input,textarea"));
    if(t){sx=t.clientX;sy=t.clientY;st=performance.now()}
  },{passive:true});
  pm.addEventListener("touchend",function(e){
    if(!ok)return;ok=false;
    var t=e.changedTouches[0];if(!t)return;
    var dx=t.clientX-sx,dy=t.clientY-sy;
    /* gesto claramente horizontal: evita confundir com a rolagem vertical do modal */
    if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.6||performance.now()-st>800)return;
    if(outroPorCima())return;
    vai(dx<0?1:-1);
  },{passive:true});
}
})();
