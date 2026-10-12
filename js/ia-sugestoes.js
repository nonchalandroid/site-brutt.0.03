/* ───────── Brutt IA: sugestões de conversa ─────────
   Monta os botões de entrada do painel (#iaIntro .ia-chips) cada vez que o painel abre: "Ajuda pra montar o
   pedido" sempre primeiro, uma sugestão do momento (carrinho, noite, fim de semana) e o resto sorteado do banco
   abaixo — essências, narguile e headshop. Só sugere seção/marca que existe no catálogo carregado.
   O clique cai na delegação do painel ([data-q] → enviar), igual aos botões que vinham fixos no HTML.
   "Outras ideias" sorteia de novo sem repetir as que estavam na tela. */
(function(){
  var ia=document.getElementById("ia"),intro=document.getElementById("iaIntro"),box=intro&&intro.querySelector(".ia-chips");
  if(!ia||!box)return;

  /* [texto do botão, pergunta enviada, seção que precisa existir no catálogo (opcional)] */
  var BANCO={
    essencia:[
      ["🧊 Qual essência gela mais?","Qual é a essência mais gelada que vocês têm?","essencias"],
      ["🍓 Algo doce e frutado","Me indica uma essência doce e frutada","essencias"],
      ["🌿 Menta bem refrescante","Qual a melhor essência de menta pra refrescar?","essencias"],
      ["⭐ As essências mais pedidas","Quais são as essências mais vendidas da loja?","essencias"],
      ["🔥 Sabor forte, que marca","Quero uma essência forte, com sabor marcante. O que você indica?","essencias"],
      ["🍹 Mix de 2 sabores que combina","Me sugere um mix de duas essências que combinam","essencias"],
      ["🆕 O que chegou de novo?","Quais essências chegaram de novo na loja?","essencias"],
      ["🥭 Sabor tropical pro calor","Quero um sabor tropical pra um dia quente","essencias"],
      ["🐣 Pra quem tá começando","Qual essência você indica pra quem está começando no narguile?","essencias"],
      ["💨 Qual faz mais fumaça?","Qual essência faz mais fumaça e rende mais?","essencias"],
      ["🍫 Sabor de sobremesa","Tem essência com sabor de sobremesa, tipo chocolate ou doce de leite?","essencias"],
      ["🍋 Cítrica e azedinha","Quero uma essência cítrica, azedinha","essencias"],
      ["🎲 Me surpreende!","Me surpreende: qual a essência mais diferente que vocês têm?","essencias"]
    ],
    narguile:[
      ["🪨 Carvão que acende rápido","Qual carvão vocês têm e qual acende mais rápido?","narguile"],
      ["🏺 Qual rosh rende mais?","Qual rosh você indica pra render mais a sessão?","narguile"],
      ["🔧 Narguile completo do zero","Quero montar um narguile completo do zero, me ajuda?","narguile"],
      ["🧵 Mangueira lavável","Vocês têm mangueira lavável? Qual você indica?","narguile"],
      ["⚖️ Quanto de essência no rosh?","Quantos gramas de essência eu coloco no rosh?"],
      ["♨️ Sessão sem gosto de queimado","Como montar a sessão pra não ficar com gosto de queimado?"],
      ["🧩 Peça de reposição","Preciso de peça de reposição pro narguile, o que vocês têm?","narguile"]
    ],
    headshop:[
      ["🌿 Seda e acessório pra sessão","O que vocês têm de seda e acessórios de headshop pra sessão?","headshop"],
      ["📜 Seda que queima devagar","Qual seda queima mais devagar?","headshop"],
      ["✂️ Dichavador bom e barato","Me indica um dichavador bom e com preço bom","headshop"],
      ["🎯 Piteira: vidro ou papel?","Piteira de vidro ou de papel, qual vale mais a pena?","headshop"],
      ["🎁 Kit headshop pra presente","Quero montar um kit de headshop pra dar de presente","headshop"],
      ["🍂 Tabaco pra bolado","Qual tabaco vocês indicam pra bolado?","tabacos"],
      ["🔥 Isqueiro que não falha","Qual isqueiro vocês têm que não falha?","isqueiros"],
      ["🧺 Bandeja e organização","Vocês têm bandeja e acessórios pra organizar a sessão?","headshop"],
      ["🚬 Charuto pra ocasião especial","Me indica um charuto pra uma ocasião especial","charutos"]
    ],
    pedido:[
      ["🎉 Kit pra resenha com amigos","Vou fazer uma resenha com os amigos, monta um kit pra mim?"],
      ["💰 Kit sessão até R$ 50","Monta um kit pra sessão de narguile até R$ 50"],
      ["🚚 Entrega pro meu bairro","Quanto custa a entrega pro meu bairro?"],
      ["🥤 Bebida pra acompanhar","Que bebida combina pra acompanhar a sessão?","bebidas"]
    ]
  };
  var FIXA=["🛒 Ajuda pra montar o pedido","Quero ajuda pra montar o meu pedido"];

  function catalogo(){try{return Array.isArray(CATALOGO)?CATALOGO:[]}catch(e){return[]}}
  function temSecao(sec){var c=catalogo();if(!sec||!c.length)return true;for(var i=0;i<c.length;i++)if(c[i].sec===sec)return true;return false}
  function embaralha(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=a[i];a[i]=a[j];a[j]=t}return a}

  /* sugestão do momento: carrinho > noite > fim de semana */
  function doMomento(){
    try{var ids=Object.keys(cart||{}).filter(function(id){return cart[id]>0&&byId[id]});
      if(ids.length){var nomes=ids.slice(0,3).map(function(id){return byId[id].n}).join(", ");
        return["🧩 O que combina com meu carrinho?","Tenho no carrinho: "+nomes+". O que combina com isso?"]}}catch(e){}
    var d=new Date(),h=d.getHours(),dia=d.getDay();
    if(h>=18||h<4)return["🌙 Kit pra sessão de hoje à noite","Monta um kit pra minha sessão de hoje à noite"];
    if(dia===5||dia===6||dia===0)return["🍻 Kit pro fim de semana","Monta um kit pro meu fim de semana"];
    return null;
  }
  /* uma pergunta sobre uma marca de essência que existe no catálogo (a mais vendida entre 2 sorteadas) */
  function daMarca(){
    var m={};catalogo().forEach(function(p){if(p.sec==="essencias"&&p.sub)m[p.sub]=(m[p.sub]||0)+1+(p.v||0)});
    var marcas=Object.keys(m).filter(function(k){return m[k]>=3});if(!marcas.length)return null;
    var x=embaralha(marcas)[0];
    return["⭐ Os mais pedidos da "+x,"Quais os sabores mais pedidos da "+x+"?"];
  }

  var naTela=[];
  function sorteia(){
    var usados={},fora={};naTela.forEach(function(q){fora[q]=1});
    function pega(lista,n){var out=[];embaralha(lista).some(function(s){
      if(out.length>=n)return true;if(!s||usados[s[1]]||fora[s[1]]||!temSecao(s[2]))return false;usados[s[1]]=1;out.push(s);return false});return out}
    var momento=doMomento(),marca=Math.random()<.5?daMarca():null;
    var lista=[FIXA];usados[FIXA[1]]=1;
    if(momento&&!fora[momento[1]]){lista.push(momento);usados[momento[1]]=1}
    if(marca&&!fora[marca[1]]){lista.push(marca);usados[marca[1]]=1}
    lista=lista.concat(pega(BANCO.essencia,lista.length>2?1:2),pega(BANCO.narguile.concat(BANCO.pedido),1),pega(BANCO.headshop,1));
    /* se o "não repetir" esvaziou demais, completa sem a restrição */
    if(lista.length<5){fora={};lista=lista.concat(pega(BANCO.essencia.concat(BANCO.headshop,BANCO.narguile),5-lista.length))}
    return lista.slice(0,5);
  }

  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function desenha(){
    var lista=sorteia();naTela=lista.map(function(s){return s[1]});
    box.innerHTML=lista.map(function(s,i){return'<button type="button" class="ia-chip" style="--i:'+i+'" data-q="'+esc(s[1])+'">'+esc(s[0])+"</button>"}).join("")
      +'<button type="button" class="ia-chip ia-mais" style="--i:'+lista.length+'" aria-label="Ver outras sugestões">🔀 Outras ideias</button>';
  }
  box.addEventListener("click",function(e){if(e.target.closest(".ia-mais"))desenha()});

  /* sorteia quando a tela inicial passa a ficar visível: ao abrir o painel e na "Nova conversa" */
  function visivel(){return ia.dataset.state==="open"&&!intro.hidden}
  var via=visivel(),mo=new MutationObserver(function(){var v=visivel();if(v&&!via)desenha();via=v});
  mo.observe(ia,{attributes:true,attributeFilter:["data-state"]});mo.observe(intro,{attributes:true,attributeFilter:["hidden"]});
  desenha();
})();
