/* ───────── Brutt IA: "Esconder" voa até a bolinha ─────────
   Mesma lógica do "Adicionar" voando pro carrinho (flyToCart): a janela encolhe de leve (antecipação), estica no
   caminho, chega pequenininha e some dentro da bolinha, que dá um pulinho ao receber. Igual no celular e no PC.
   Só transform/opacity (Web Animations); com prefers-reduced-motion só some. */
(function(){
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  function parar(root){var v=root&&root._voa;if(!v)return;root._voa=null;v.an.onfinish=null;v.an.cancel();root.classList.remove("ia-voa")}
  function voa(root,panel,orb){
    parar(root);
    if(calma||!panel||!orb||!Element.prototype.animate)return false;
    var a=panel.getBoundingClientRect(),b=orb.getBoundingClientRect();
    if(!a.width||!a.height||!b.width)return false;
    var dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2),
      sx=b.width/a.width,sy=b.height/a.height,f=function(n){return n.toFixed(3)};
    root.classList.add("ia-voa");
    var an=panel.animate([
      {transform:"translate(0,0) scale(1)",opacity:1},
      {transform:"translate(0,6px) scale(.95,1.02)",opacity:1,offset:.16},
      {transform:"translate("+f(dx*.55)+"px,"+f(dy*.55)+"px) scale("+f(Math.max(sx*2.4,.3))+","+f(Math.max(sy*3.2,.45))+")",opacity:.95,offset:.55},
      {transform:"translate("+f(dx)+"px,"+f(dy)+"px) scale("+f(sx*.5)+","+f(sy*.4)+")",opacity:.12}
    ],{duration:620,easing:"cubic-bezier(.5,0,.75,.5)",fill:"forwards"});
    root._voa={an:an};
    an.onfinish=function(){
      root._voa=null;
      /* tira a classe sem deixar as transições do estado "escondido" rodarem (a janela já está invisível) */
      panel.style.transition="none";root.classList.remove("ia-voa");an.cancel();void panel.offsetWidth;panel.style.transition="";
      orb.animate([{transform:"scale(1)"},{transform:"scale(1.28)",offset:.35},{transform:"scale(.9)",offset:.7},{transform:"scale(1)"}],
        {duration:440,easing:"cubic-bezier(.2,.8,.2,1)"});
    };
    return true;
  }
  window.iaVoa=voa;window.iaVoaParar=parar;
})();
