/* ───────── Avaliações do Google (carrossel no rodapé, depois do Como chegar) ─────────
   As avaliações são copiadas do perfil da loja no Google e ficam em AVALIACOES abaixo (a Places API do Google
   exige cobrança ativada). Lista vazia = seção #avaliacoes escondida. Fita contínua sem fim (ver fita());
   setas e "Ler mais". Tudo passa por esc().
   Para atualizar: troque nota/total e a lista (nota de 1 a 5; quando = texto livre, ex. "há 2 semanas"). */
var AVALIACOES={
  nota:5.0,          /* nota média do perfil (12/10/2026) */
  total:61,          /* quantas avaliações o perfil tem */
  link:"https://www.google.com/maps?cid=11357660395463088733",   /* "Ver todas no Google": perfil da loja (cid do mapa incorporado) */
  avaliacoes:[
    /* copiadas do perfil no Google em 12/10/2026 (vídeo do perfil), mais recentes primeiro; só as que têm comentário */
    {"nome": "Hayla Kesi", "nota": 5, "quando": "2 meses atrás", "texto": "Excelente experiência de compra. O que mais destaco é a atenção que recebi: além da agilidade na entrega, recebi sugestões muito precisas sobre minha compra, saibam que vocês podem contar com um lugar profissional e atencioso quando necessitarem principalmente de um serviço de delivery. O atendimento diferenciado faz toda a diferença!"},
    {"nome": "Help Mathica", "nota": 5, "quando": "2 meses atrás", "texto": "Atendimento de qualidade, entrega rápida e a tabacaria ainda se preocupa com o pós venda. Bem atenciosos. Recomendo ."},
    {"nome": "Emiliano Oliveira", "nota": 5, "quando": "3 meses atrás", "texto": "Ótimo atendimento"},
    {"nome": "Gabriel Seixas", "nota": 5, "quando": "3 meses atrás", "texto": "Lugar tranquilo, som ambiente, confortável e ótimo atendimento!! Aconchegante demais"},
    {"nome": "Thiago da Silveira", "nota": 5, "quando": "6 meses atrás", "texto": "Atendimento 100%! Entrega rápida e produtos todos certinhos. Cerveja gelada!"},
    {"nome": "Marcelo Eduardo", "nota": 5, "quando": "7 meses atrás", "texto": "Sabe aquele lugar que quando você conhece tu acaba abandonando os outros? A Tabacaria Brutt é assim ! Atendimento nota 10, ótimos preços, agilidade nas entregas e uma ótima variedade de produtos, podem confiar !"},
    {"nome": "Jhoon Tattoo", "nota": 5, "quando": "7 meses atrás", "texto": "Serviço excelente, várias opções para todos os gostos! Entrega e atendimento rápidos! Parabéns aos envolvidos!!"},
    {"nome": "Vitor Rocha", "nota": 5, "quando": "7 meses atrás", "texto": "Atendimento rápido, educado, produto ótimo e de qualidade."},
    {"nome": "Da Doze", "nota": 5, "quando": "8 meses atrás", "texto": "Experiência maravilhosa. Muito bom!! Adorei tudo. Parabéns"},
    {"nome": "other friends", "nota": 5, "quando": "8 meses atrás", "texto": "entrega rapida dms e vendedor mt maneiro recomendo pra geral"},
    {"nome": "Casa da prainha", "nota": 5, "quando": "8 meses atrás", "texto": "Lugar maravilhoso,! Atendimento top!"},
    {"nome": "Douglas Barbosa", "nota": 5, "quando": "8 meses atrás", "texto": "Bela loja , ótimas variedades,  ótimos preços.... recomendo..."},
    {"nome": "Ritá Portugal", "nota": 5, "quando": "8 meses atrás", "texto": "Atendimento excelente"},
    {"nome": "Maralice Magliano", "nota": 5, "quando": "8 meses atrás", "texto": "lugar aconchegante, atendimento personalizado, ótimo ambiente!"},
    {"nome": "Ellen Victória", "nota": 5, "quando": "9 meses atrás", "texto": "Ótimo atendimento, entrega super rápido e produtos de qualidade, variedades de cigarros. 🔥"},
    {"nome": "Júpiter Mc", "nota": 5, "quando": "9 meses atrás", "texto": "Ótimos produtos , preços acessíveis ,ótimo atendimento ao cliente , e ótimo horário de funcionamento principalmente para quem precisa fazer uma compra de última hora"},
    {"nome": "Miguel Araújo", "nota": 5, "quando": "9 meses atrás", "texto": "Atendimento muito top, preço bom e boa variedade. Recomendo muito!!!"},
    {"nome": "Julia Meireles", "nota": 5, "quando": "9 meses atrás", "texto": "Atendimento excelente, super simpático e atencioso!"},
    {"nome": "Thayná Cardial", "nota": 5, "quando": "9 meses atrás", "texto": "Eles possuem o melhor atendimento da região. Estao sempre dispostos a serem solicitos aos variados gostos e pedidos dos clientes. Sao 6 estrelas!!!"},
    {"nome": "karen vieira", "nota": 5, "quando": "9 meses atrás", "texto": "Amei o atendimento, preços acessíveis e ambiente aconchegante"},
    {"nome": "Giovanna Alcântara", "nota": 5, "quando": "9 meses atrás", "texto": "otimo atendimento e experiencia"},
    {"nome": "Tarcisio Leite de Souza", "nota": 5, "quando": "9 meses atrás", "texto": "Muito bom!!!!!"},
    {"nome": "Caua Felipe", "nota": 5, "quando": "9 meses atrás", "texto": "Melhor que tem"},
    {"nome": "Jamile Silva", "nota": 5, "quando": "10 meses atrás", "texto": "atendimento topo!!! Ambiente super confortável, música do seu estilo, ambiente com ar mt ótimo!!"},
    {"nome": "Pogbametefogo762", "nota": 5, "quando": "10 meses atrás", "texto": "Gostei muito da loja,  espaço tranquilo da pra reservar beber e curti, recomendo muito"},
    {"nome": "Cris Borges Estética", "nota": 5, "quando": "10 meses atrás", "texto": "Melhor opção no quesito! Melhor drink! Ambiente top!"},
    {"nome": "Marlon Monsores", "nota": 5, "quando": "11 meses atrás", "texto": "ótimo atendimento com produtos de qualidade"},
    {"nome": "Weider Dias", "nota": 5, "quando": "11 meses atrás", "texto": "Ótimo ambiente, amei demais estar aí com os meus amigos, sempre recomendo 😎❤️"},
    {"nome": "Cristiane Fernandes", "nota": 5, "quando": "11 meses atrás", "texto": "Excelente! A melhor do bairro, conjunto campinho merecia uma tabacaria e com muitas variedades."},
    {"nome": "Mt Chef", "nota": 5, "quando": "11 meses atrás", "texto": "Lugar maravilhoso, aconchegante e elegante, muito bom recomendo muito"},
    {"nome": "Wanderson Luiz", "nota": 5, "quando": "11 meses atrás", "texto": "Lugar incrível, limpo e organizado. Nota 10"},
    {"nome": "Kel Designer", "nota": 5, "quando": "11 meses atrás", "texto": "A melhor e mais completa de região"}
  ]
};
(function(){
  var sec=document.getElementById("avaliacoes"),rail=document.getElementById("avRail");
  if(!sec||!rail)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function icone(n){try{return ic(n)}catch(e){return""}}
  function estrelas(nota){var h="";for(var i=1;i<=5;i++)h+=icone(nota>=i-.25?"star":nota>=i-.75?"starHalf":"starVazia");
    return'<span class="av-est" role="img" aria-label="'+String(nota).replace(".",",")+' de 5 estrelas">'+h+"</span>"}
  function cartao(v){
    var nome=v.perfil?'<a href="'+esc(v.perfil)+'" target="_blank" rel="noopener nofollow">'+esc(v.nome)+"</a>":esc(v.nome);
    return'<article class="av-card"><div class="av-cab">'
      +'<div><b>'+nome+"</b>"+estrelas(v.nota)+(v.quando?"<small>"+esc(v.quando)+"</small>":"")+"</div></div>"
      +(v.texto?'<p class="av-txt">'+esc(v.texto)+"</p>":'<p class="av-txt av-sem">Avaliou com '+v.nota+" estrela"+(v.nota>1?"s":"")+".</p>")
      +'<button type="button" class="av-mais" hidden>Ler mais</button></article>';
  }
  function desenha(d){
    var lista=(d.avaliacoes||[]).slice().sort(function(a,b){return(b.nota-a.nota)||((b.texto?1:0)-(a.texto?1:0))||String(b.data).localeCompare(String(a.data))});
    if(!lista.length)return;
    var res=document.getElementById("avResumo");
    if(res&&d.nota)res.innerHTML='<b>'+Number(d.nota).toFixed(1).replace(".",",")+"</b>"+estrelas(d.nota)+(d.total?"<span>"+d.total.toLocaleString("pt-BR")+" avaliações</span>":"");
    var todas=document.getElementById("avTodas");if(todas){if(d.link)todas.href=d.link;else todas.hidden=true}
    rail.innerHTML=lista.map(cartao).join("");
    sec.hidden=false;
    /* "Ler mais" só onde o texto foi cortado */
    rail.querySelectorAll(".av-card").forEach(function(c){var p=c.querySelector(".av-txt");if(p&&p.scrollHeight>p.clientHeight+2)c.querySelector(".av-mais").hidden=false});
    fita();
  }

  /* carrossel contínuo sem fim (como o menu do topo): os cartões se repetem em cópias aria-hidden e a
     posição fica sempre na cópia do meio; anda devagar e para só com mouse em cima, dedo encostado,
     teclado (foco visível) ou "Ler mais" aberto; volta a andar sozinho */
  var VEL=26,setW=0,pos=0,ultimo=0,pausa=0,mouse=false,toque=false,anima=false,ult=0;
  function fita(){
    var orig=[].slice.call(rail.children);if(!orig.length)return;
    rail.querySelectorAll(".av-clone").forEach(function(c){c.remove()});
    var larg=rail.scrollWidth,copias=Math.max(3,Math.ceil(rail.clientWidth/Math.max(1,larg))+2),prim=null;
    for(var c=1;c<copias;c++)orig.forEach(function(el){var k=el.cloneNode(true);k.classList.add("av-clone");k.setAttribute("aria-hidden","true");
      k.querySelectorAll("a,button").forEach(function(b){b.tabIndex=-1});rail.appendChild(k);if(!prim)prim=k});
    setW=prim.offsetLeft-orig[0].offsetLeft;vai(setW);
    if(!ult)requestAnimationFrame(quadro);
  }
  function vai(x){pos=x;rail.scrollLeft=x;ultimo=rail.scrollLeft}
  function meio(){if(!setW)return;var x=rail.scrollLeft;if(x<setW*.5)vai(x+setW);else if(x>=setW*1.5)vai(x-setW)}
  function parado(now){var f=document.activeElement;
    return calma||mouse||toque||anima||document.hidden||now<pausa||!!rail.querySelector(".av-card.aberto")||(sec.contains(f)&&f.matches(":focus-visible"))}
  function quadro(now){requestAnimationFrame(quadro);var dt=Math.min(.05,(now-(ult||now))/1000);ult=now;
    if(!setW||parado(now)){pos=rail.scrollLeft;return}
    var r=sec.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight){pos=rail.scrollLeft;return}   /* fora da tela: não gasta */
    pos+=VEL*dt;rail.scrollLeft=pos;ultimo=rail.scrollLeft;meio()}
  rail.addEventListener("scroll",function(){if(!anima&&Math.abs(rail.scrollLeft-ultimo)>1)pausa=performance.now()+3000;
    clearTimeout(rail._t);rail._t=setTimeout(function(){if(!anima)meio()},160)},{passive:true});
  /* setas: um cartão por clique, animado, mantendo a fita sem fim */
  function passo(dir){var c=rail.querySelector(".av-card");if(!c||!setW)return;meio();
    var de=rail.scrollLeft,ate=de+dir*(c.getBoundingClientRect().width+12),t0=performance.now(),dur=calma?1:450;anima=true;
    (function f(now){var k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);vai(de+(ate-de)*e);if(k<1)requestAnimationFrame(f);else{anima=false;meio();pausa=performance.now()+2500}})(t0)}
  sec.addEventListener("pointerenter",function(e){if(e.pointerType==="mouse")mouse=true});
  sec.addEventListener("pointerleave",function(e){if(e.pointerType==="mouse"){mouse=false;pausa=performance.now()+800}});
  rail.addEventListener("touchstart",function(){toque=true},{passive:true});
  rail.addEventListener("touchend",function(){toque=false;pausa=performance.now()+3000},{passive:true});
  rail.addEventListener("touchcancel",function(){toque=false},{passive:true});
  sec.addEventListener("click",function(e){
    var b=e.target.closest("[data-av]");if(b){passo(+b.dataset.av);return}
    var m=e.target.closest(".av-mais");if(m){var c=m.closest(".av-card");var aberto=c.classList.toggle("aberto");m.textContent=aberto?"Ler menos":"Ler mais"}
  });
  var tR=0;addEventListener("resize",function(){clearTimeout(tR);tR=setTimeout(fita,200)});

  /* depois da carga: não disputa com o catálogo */
  function depois(){(window.requestIdleCallback||function(f){setTimeout(f,800)})(function(){desenha(AVALIACOES)},{timeout:3000})}
  if(document.readyState==="complete")depois();else addEventListener("load",depois,{once:true});
})();
