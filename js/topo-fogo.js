/* ───────── Fundo do topo: "crypto em chamas" ─────────
   Atrás da busca: grade digital fina, aurora de fogo (laranja/vermelho/dourado) que deriva devagar, rede de nós
   ligados (estilo blockchain) e pulsos de luz correndo pela grade. O desenho está em js/topo-fogo-motor.js e roda
   num worker com OffscreenCanvas (fora da thread da página: não pesa na rolagem nem nos toques). Navegador sem
   OffscreenCanvas desenha aqui mesmo. ~60 fps em aparelho forte (html.fx-alto), ~30 nos outros; para quando a
   faixa sai da tela ou a aba fica em segundo plano; com prefers-reduced-motion desenha um quadro só. */
(function(){
  var bar=document.querySelector("header .bar"),cv=document.getElementById("topoFx");
  if(!bar||!cv||!cv.getContext)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var worker=null,motor=null,raf=0,ult=0,visivel=true;

  function medidas(){
    var r=bar.getBoundingClientRect(),hdr=cv.parentNode.getBoundingClientRect();
    var W=Math.max(1,Math.round(hdr.width)),H=Math.max(1,Math.round(r.height));
    cv.style.top=(r.top-hdr.top)+"px";cv.style.height=H+"px";
    /* zonas livres: logo e ícones redondos (fundo transparente) — nós, linhas e pulsos não passam por ali */
    var zonas=[];bar.querySelectorAll(".logo-wrap,.ico").forEach(function(el){var q=el.getBoundingClientRect();if(!q.width)return;
      zonas.push({x:q.left-hdr.left+q.width/2,y:q.top-r.top+q.height/2,r:q.width/2+(el.classList.contains("ico")?12:14),logo:!el.classList.contains("ico")})});
    return{W:W,H:H,dpr:Math.min(window.devicePixelRatio||1,2),zonas:zonas,calma:calma};
  }
  function intervalo(){return window.__FX==="alto"?15:33}
  function ligado(){return !calma&&visivel&&!document.hidden}

  /* worker com OffscreenCanvas (Chrome, Edge, Safari 16.4+, Firefox) */
  if(cv.transferControlToOffscreen&&window.Worker&&window.OffscreenCanvas){
    try{var off=cv.transferControlToOffscreen();worker=new Worker("/js/topo-fogo-worker.js?v=20261013a");worker.postMessage({canvas:off},[off])}
    catch(e){worker=null}
  }
  function avisa(){if(worker)worker.postMessage({ligado:ligado(),ms:intervalo()});else if(ligado()&&!raf)raf=requestAnimationFrame(loop)}

  /* sem worker: desenha na página */
  function loop(now){raf=0;if(!ligado()||!motor)return;raf=requestAnimationFrame(loop);if(now-ult<intervalo())return;ult=now;motor.desenhar(now)}
  function semWorker(fn){
    if(motor)return fn();
    if(window.FogoMotor){motor=FogoMotor(cv.getContext("2d"),function(w,h){var c=document.createElement("canvas");c.width=w;c.height=h;return c});return fn()}
    var s=document.createElement("script");s.src="/js/topo-fogo-motor.js?v=20261013a";s.onload=function(){semWorker(fn)};document.head.appendChild(s);
  }

  function iniciar(){
    var m=medidas();cv.classList.add("on");
    if(worker){worker.postMessage({tam:m});avisa()}
    else semWorker(function(){motor.montar(m);motor.zerar();avisa()});
  }

  if(window.IntersectionObserver)new IntersectionObserver(function(e){visivel=e[0].isIntersecting;avisa()}).observe(cv);
  document.addEventListener("visibilitychange",avisa);
  /* o aparelho pode virar "leve" depois da medição (js/desempenho.js): ajusta o ritmo */
  if(window.MutationObserver)new MutationObserver(avisa).observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  var esp=0;function depois(ms){clearTimeout(esp);esp=setTimeout(iniciar,ms)}
  if(window.ResizeObserver)new ResizeObserver(function(){depois(120)}).observe(bar);else addEventListener("resize",function(){depois(120)});
  var img=bar.querySelector("[data-logo]");if(img&&!img.complete)img.addEventListener("load",function(){depois(60)},{once:true});
  iniciar();
})();
