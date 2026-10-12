/* ───────── Avaliações do Google (carrossel no rodapé, depois do Como chegar) ─────────
   As avaliações são copiadas do perfil da loja no Google e ficam em AVALIACOES abaixo (a Places API do Google
   exige cobrança ativada). Lista vazia = seção #avaliacoes escondida. Cartões em trilho horizontal com encaixe;
   passa sozinho a cada 6 s e para com mouse, toque ou foco; setas e "Ler mais". Tudo passa por esc().
   Para atualizar: troque nota/total e a lista (nota de 1 a 5; quando = texto livre, ex. "há 2 semanas"). */
var AVALIACOES={
  nota:5.0,          /* nota média do perfil (12/10/2026) */
  total:61,          /* quantas avaliações o perfil tem */
  link:"https://www.google.com/maps?cid=11357660395463088733",   /* "Ver todas no Google": perfil da loja (cid do mapa incorporado) */
  avaliacoes:[
    /* copiadas do perfil no Google em 12/10/2026, na ordem do Google (mais recentes primeiro) */
    {"nome": "Hayla Kesi", "nota": 5, "quando": "2 meses atrás", "texto": "Excelente experiência de compra. O que mais destaco é a atenção que recebi: além da agilidade na entrega, recebi sugestões muito precisas sobre minha compra, saibam que vocês podem contar com um lugar profissional e atencioso quando necessitarem principalmente de um serviço de delivery. O atendimento diferenciado faz toda a diferença!"},
    {"nome": "Help Mathica", "nota": 5, "quando": "2 meses atrás", "texto": "Atendimento de qualidade, entrega rápida e a tabacaria ainda se preocupa com o pós venda. Bem atenciosos. Recomendo ."},
    {"nome": "Emiliano Oliveira", "nota": 5, "quando": "3 meses atrás", "texto": "Ótimo atendimento"},
    {"nome": "Thiago da Silveira", "nota": 5, "quando": "6 meses atrás", "texto": "Atendimento 100%! Entrega rápida e produtos todos certinhos. Cerveja gelada!"},
    {"nome": "Marcelo Eduardo", "nota": 5, "quando": "7 meses atrás", "texto": "Sabe aquele lugar que quando você conhece tu acaba abandonando os outros? A Tabacaria Brutt é assim ! Atendimento nota 10, ótimos preços, agilidade nas entregas e uma ótima variedade de produtos, podem confiar !"},
    {"nome": "Jhoon Tattoo", "nota": 5, "quando": "7 meses atrás", "texto": "Serviço excelente, várias opções para todos os gostos! Entrega e atendimento rápidos! Parabéns aos envolvidos!!"},
    {"nome": "Vitor Rocha", "nota": 5, "quando": "7 meses atrás", "texto": "Atendimento rápido, educado, produto ótimo e de qualidade."},
    {"nome": "Da Doze", "nota": 5, "quando": "8 meses atrás", "texto": "Experiência maravilhosa. Muito bom!! Adorei tudo. Parabéns"},
    {"nome": "other friends", "nota": 5, "quando": "8 meses atrás", "texto": "entrega rapida dms e vendedor mt maneiro recomendo pra geral"},
    {"nome": "Casa da prainha", "nota": 5, "quando": "8 meses atrás", "texto": "Lugar maravilhoso,! Atendimento top!"},
    {"nome": "Douglas Barbosa", "nota": 5, "quando": "8 meses atrás", "texto": "Bela loja , ótimas variedades,  ótimos preços.... recomendo..."},
    {"nome": "Ellen Victória", "nota": 5, "quando": "9 meses atrás", "texto": "Ótimo atendimento, entrega super rápido e produtos de qualidade, variedades de cigarros. 🔥"},
    {"nome": "Júpiter Mc", "nota": 5, "quando": "9 meses atrás", "texto": "Ótimos produtos , preços acessíveis ,ótimo atendimento ao cliente , e ótimo horário de funcionamento principalmente para quem precisa fazer uma compra de última hora"},
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
    requestAnimationFrame(function(){rail.querySelectorAll(".av-card").forEach(function(c){var p=c.querySelector(".av-txt");if(p&&p.scrollHeight>p.clientHeight+2)c.querySelector(".av-mais").hidden=false})});
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

  /* depois da carga: não disputa com o catálogo */
  function depois(){(window.requestIdleCallback||function(f){setTimeout(f,800)})(function(){desenha(AVALIACOES)},{timeout:3000})}
  if(document.readyState==="complete")depois();else addEventListener("load",depois,{once:true});
})();
