/* Acompanhe seu pedido (estilo iFood) — pedidos pagos online (Pix pelo site).
   Recebemos seu pedido → Pagamento confirmado → Saiu para entrega → Pedido entregue      (entrega feita pela loja)
   Recebemos seu pedido → Pagamento confirmado → Motoboy já retirou seu pedido           (cliente chama Uber Flash/99)
   Onde aparece: 1) abre sozinho depois do pagamento; 2) atalho fixo no topo da loja enquanto o pedido está em andamento;
   3) link /?pedido=<id> nas mensagens de WhatsApp. Os dados vêm de checkout?acao=status (só o necessário, sem endereço/telefone).
   Carregado depois do script principal: usa esc, R, ic, toast, WHATS quando existirem. */
window.ACOMP=(function(){
"use strict";
var S=window.__SUPA||{},FN=(S.url||"")+"/functions/v1/checkout",CHAVE="brutt_pedidos";
var END_LOJA="Rua 18, 145 - Campo Grande, Rio de Janeiro - RJ";
var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var equipe={};                               /* pedidos abertos pelo "ver como o cliente vê" do painel: não guarda no aparelho */
var abertoId=null,tPoll=null,tPill=null,ultimo={};
var _esc=typeof esc==="function"?esc:function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var _R=function(v){return typeof R==="function"?R(Number(v)||0):"R$ "+(Number(v)||0).toFixed(2).replace(".",",")};
var _toast=function(m){if(typeof toast==="function")toast(m)};
var _whats=function(){return typeof WHATS==="string"&&/^\d{10,15}$/.test(WHATS)?WHATS:"5521996600243"};
var reduz=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── pedidos guardados neste aparelho ── */
function lista(){try{var l=JSON.parse(localStorage.getItem(CHAVE)||"[]");return Array.isArray(l)?l.filter(function(x){return x&&UUID.test(x.id)}):[]}catch(_){return[]}}
function grava(l){try{localStorage.setItem(CHAVE,JSON.stringify(l.slice(0,5)))}catch(_){}}
function guarda(id,numero,msg){
  if(!UUID.test(String(id)))return;
  var l=lista(),velho=l.filter(function(x){return x.id===id})[0]||{};
  l=l.filter(function(x){return x.id!==id});
  l.unshift({id:id,numero:numero||velho.numero||"",t:velho.t||Date.now(),msg:msg||velho.msg||"",avisou:!!velho.avisou});grava(l);pill();
}
function item(id){return lista().filter(function(x){return x.id===id})[0]||null}
/* "Concluir pedido": o cliente manda o pedido pago para o WhatsApp da loja (enquanto não há envio automático) */
function marcaAvisou(id){if(!item(id))guarda(id,ultimo[id]&&ultimo[id].numero);var l=lista();l.forEach(function(x){if(x.id===id)x.avisou=true});grava(l)}
function pago(a){return!!a&&(a.status==="pago"||a.status==="concluido")}
function falta(id,a){var it=item(id);return!equipe[id]&&pago(a)&&a.status!=="concluido"&&!a.saiu&&!(it&&it.avisou)}   /* depois que saiu para entrega a loja já tem o pedido */
/* Mensagem do pedido para o WhatsApp da loja (SEMPRE o pedido completo, em qualquer etapa: a equipe sabe tudo sem abrir o
   painel). A completa é guardada neste aparelho quando o Pix é gerado (itens, valores, endereço com mapa, total), no mesmo
   formato do pedido pelo WhatsApp; a linha do pagamento entra aqui com a situação atual do Pix. Se este aparelho não tem a
   mensagem (pedido aberto pelo link em outro celular), ela é montada com o que a tela de acompanhamento sabe. */
function pagLinha(st){
  if(window.MPX&&MPX.pagamentoLinha)return MPX.pagamentoLinha(st);
  var s={pago:"✅ PAGO",concluido:"✅ PAGO",aguardando_pagamento:"⏳ Pix gerado, aguardando pagamento",expirado:"⌛ Pix vencido (não foi pago)",recusado:"❌ pagamento recusado",cancelado:"cancelado"}[st]||"⏳ aguardando pagamento";
  return "💳 *Pagamento:* Pix (Mercado Pago) — "+s;
}
function msgPedido(id,a){
  var it=item(id);
  if(it&&it.msg)return it.msg.replace("{PAGAMENTO}",pagLinha(a.status));
  var L=[(a.reserva?"📌 RESERVA DE PEDIDO #":"📦 NOVO PEDIDO #")+a.numero,"👤 CLIENTE: *"+(a.nome||"Cliente")+"*"];
  if(a.reserva)L.push("⏰ *Loja fechada quando o cliente pediu.* Ele aguarda contato da equipe assim que abrirmos.");
  L.push("----------","🛒 ITENS DO PEDIDO");
  (a.itens||[]).forEach(function(i){L.push("• "+i.qtd+"x "+i.nome+(i.subtotal!=null?" — "+_R(i.subtotal):""))});
  L.push("----------","💰 *Total:* "+_R(a.total));
  if(a.tipo==="entrega")L.push("🚚 *Recebimento:* Entrega pela loja"+(a.bairro?" — "+a.bairro:"")+". Taxa de entrega: "+_R(a.taxa_entrega)+" (já incluída no total). Endereço completo no painel.");
  else L.push("🚚 *Recebimento:* Vou solicitar a entrega por conta própria (Uber Flash ou 99) — frete da loja R$ 0,00. Eu sou o destinatário, a Tabacaria Brutt é o ponto de coleta.");
  L.push(pagLinha(a.status));
  return L.join("\n");
}
var tentouFechar={};
function esquece(id){grava(lista().filter(function(x){return x.id!==id}));pill()}

function buscar(id){
  return fetch(FN+"?acao=status&pedido="+encodeURIComponent(id),{headers:{apikey:S.key,Authorization:"Bearer "+S.key}})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(j){j._http=r.status;return j})});
}

/* ── estado → textos ── */
var hora=function(iso){if(!iso)return"";try{return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}catch(_){return""}};
function final(a){return a.status==="concluido"||a.status==="cancelado"||a.status==="expirado"||a.status==="recusado"}
function etapas(a){
  var pago=!!a.pago||a.status==="pago"||a.status==="concluido",fim=a.status==="concluido";
  var L=[{t:"Recebemos seu pedido",s:"Pedido #"+a.numero,h:a.criado,ok:true},
    {t:"Pagamento confirmado",s:pago?"Pix aprovado pelo Mercado Pago":"Aguardando o Pix",h:a.pago,ok:pago}];
  if(a.tipo==="entrega"){
    L.push({t:"Saiu para entrega",s:a.bairro?"A caminho de "+a.bairro:"A caminho do seu endereço",h:a.saiu,ok:!!a.saiu||fim});
    L.push({t:"Pedido entregue",s:"Bom proveito!",h:a.concluido,ok:fim});
  }else{                                                              /* o cliente chama o Uber Flash / 99 */
    L.push({t:"Separando · aguardando seu Uber / 99",s:a.saiu||fim?"Corrida chegou na loja":"Peça a corrida e mande o link pra gente",h:a.saiu,ok:!!a.saiu||fim});
    L.push({t:"Motoboy já retirou seu pedido",s:"A caminho com o entregador do app",h:a.saiu,ok:!!a.saiu||fim});
  }
  var atual=-1;L.forEach(function(e,i){if(e.ok)atual=i});
  L.forEach(function(e,i){e.atual=!final(a)&&i===atual+1});          /* a próxima etapa (ainda não feita) pulsa */
  return L;
}
function topo(a){
  var exp=a.status==="aguardando_pagamento"&&a.expira&&new Date(a.expira)<new Date();
  if(a.estornado)return["back","Pagamento devolvido","O Mercado Pago devolveu o valor do pedido. Qualquer dúvida, fale com a loja.","off"];
  if(a.status==="cancelado")return["x","Pedido cancelado","Nada foi cobrado. Se quiser, é só fazer o pedido de novo.","off"];
  if(a.status==="recusado")return["x","Pagamento não aprovado","Nada foi cobrado. Você pode tentar de novo pelo site.","off"];
  if(a.status==="expirado"||exp)return["clock","Pix expirado","O código venceu antes do pagamento e nada foi cobrado.","off"];
  if(a.status==="aguardando_pagamento")return["pix","Aguardando o pagamento","Assim que o Pix cair, a gente começa a separar.","vivo"];
  if(a.status==="concluido")return a.tipo==="entrega"?["check","Pedido entregue!","Obrigado pela preferência. Bom proveito! 🔥","ok"]:["check","Pedido concluído!","Obrigado pela preferência. Bom proveito! 🔥","ok"];
  if(a.saiu)return a.tipo==="entrega"?["moto","Saiu para entrega","Seu pedido está a caminho. Fique de olho no portão 😉","vivo"]:["moto","Motoboy já retirou seu pedido","O entregador do app está levando até você.","vivo"];
  if(a.reserva)return["clock","Pagamento confirmado","A loja estava fechada: separamos seu pedido assim que abrir.","vivo"];
  return a.tipo==="entrega"?["bag","Pagamento confirmado","Estamos separando seu pedido. Avisamos quando sair para entrega.","vivo"]
    :["bag","Pedido em separação","Já pode pedir o Uber Flash ou 99 para o endereço abaixo. Depois, mande o link da corrida pra gente no WhatsApp.","vivo"];
}
var IC={
  pix:'<path style="fill:#32BCAD;stroke:none" d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/>',
  bag:'<path d="M6 7h12l1 13H5Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="m9.5 13 1.8 1.8L15 11"/>',
  moto:'<circle cx="5.5" cy="17" r="2.5"/><circle cx="18.5" cy="17" r="2.5"/><path d="M8 17h7l2-5h-4l-2-3H8"/><path d="M15 7h2l1.5 5"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  back:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'
};
var svg=function(n){return'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(IC[n]||"")+"</svg>"};
var waIc=function(){return typeof ic==="function"?ic("chat"):""};

/* ── tela ── */
function el(){
  var m=document.getElementById("acomp");if(m)return m;
  m=document.createElement("div");m.id="acomp";m.className="modal acomp";m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-labelledby","acT");m.setAttribute("aria-hidden","true");
  document.body.appendChild(m);
  m.addEventListener("click",function(e){
    var t=e.target.closest&&e.target.closest("[data-acomp-fechar],[data-acomp-copiar],[data-acomp-concluir]");if(!t)return;
    if(t.hasAttribute("data-acomp-concluir")){var id=abertoId;marcaAvisou(id);setTimeout(function(){if(abertoId===id&&ultimo[id])desenha(id,ultimo[id])},800);return}   /* o link abre o WhatsApp normalmente */
    if(t.hasAttribute("data-acomp-fechar"))fechar();
    else copiar(END_LOJA).then(function(){t.classList.add("done");t.querySelector("span").textContent="Endereço copiado!";_toast("Endereço da loja copiado");setTimeout(function(){if(t.isConnected){t.classList.remove("done");t.querySelector("span").textContent="Copiar endereço"}},2500)});
  });
  return m;
}
function copiar(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t).catch(function(){return velho(t)});
  return Promise.resolve(velho(t));
  function velho(x){var a=document.createElement("textarea");a.value=x;a.setAttribute("readonly","");a.style.cssText="position:fixed;opacity:0";document.body.appendChild(a);a.select();try{document.execCommand("copy")}catch(_){}a.remove()}
}
function html(a,id){
  var tp=topo(a),L=etapas(a),fim=final(a)||(a.status==="aguardando_pagamento"&&a.expira&&new Date(a.expira)<new Date());
  var msgLoja=msgPedido(id,a);   /* "Falar com a loja" leva SEMPRE o pedido completo, em qualquer etapa (sem o robô do WhatsApp, a loja precisa ver tudo na mensagem) */
  return '<div class="ac-h"><span class="ac-num">Pedido <b>#'+_esc(String(a.numero).replace(/-/g,"‑"))+'</b></span><button type="button" class="ac-x" data-acomp-fechar aria-label="Fechar">×</button></div>'
   +'<div class="ac-hero ac-'+tp[3]+'"><span class="ac-ic">'+svg(tp[0])+'</span><div><h2 id="acT">'+_esc(tp[1])+'</h2><p>'+_esc(tp[2])+'</p></div></div>'
   +concluirHTML(id,a)
   +(fim&&a.status!=="concluido"?"":'<ol class="ac-linha">'+L.map(function(e){
      return'<li class="'+(e.ok?"ok":"")+(e.atual?" atual":"")+'"><span class="ac-dot" aria-hidden="true"></span><span class="ac-tx"><b>'+_esc(e.t)+'</b>'+(e.s?'<small>'+_esc(e.s)+'</small>':"")+'</span><time>'+_esc(e.ok?hora(e.h):"")+'</time></li>'}).join("")+'</ol>')
   +(a.tipo==="cliente"&&a.status==="pago"&&!a.saiu?'<div class="ac-coleta">'+svg("pin")+'<div><b>Peça o Uber Flash / 99 para este endereço</b><span>'+_esc(END_LOJA)+'</span></div><button type="button" class="ac-copia" data-acomp-copiar>'+svg("copy")+'<span>Copiar endereço</span></button>'
     +'<a class="ac-corrida" target="_blank" rel="noopener" href="https://wa.me/'+_whats()+'?text='+encodeURIComponent("Oi! Segue o link da corrida do pedido #"+a.numero+": ")+'">'+waIc()+'<span>Enviar link da corrida</span></a>'
     +'<small class="ac-dica">No app, toque em “Compartilhar corrida” e mande o link pra gente acompanhar o motoboy.</small></div>':"")
   +'<div class="ac-itens"><b>Seu pedido</b>'+(a.itens||[]).map(function(i){return'<span><em>'+_esc(i.qtd)+'×</em> '+_esc(i.nome)+'</span>'}).join("")
     +(Number(a.taxa_entrega)>0?'<span class="ac-tx2">Entrega <em>'+_R(a.taxa_entrega)+'</em></span>':"")+'<span class="ac-tot">Total <em>'+_R(a.total)+'</em></span></div>'
   +'<div class="ac-acoes"><a class="ac-wa"'+(falta(id,a)?" data-acomp-concluir":"")+' target="_blank" rel="noopener" href="https://wa.me/'+_whats()+'?text='+encodeURIComponent(msgLoja)+'">'+waIc()+'<span>Falar com a loja</span></a><button type="button" class="ac-volta" data-acomp-fechar>Voltar</button></div>'
   +'<p class="ac-pe">Esta tela se atualiza sozinha. Para ver de novo depois, toque em “Acompanhar” no topo da loja.</p>';
}
function concluirHTML(id,a){
  if(equipe[id])return'<p class="ac-equipe">Visualização da equipe: é assim que o cliente vê. Nada fica salvo neste aparelho.</p>';
  if(!pago(a)||(a.saiu||a.status==="concluido")&&!(item(id)&&item(id).avisou))return"";   /* só depois do Pix aprovado; some quando a loja já despachou */
  var it=item(id),href="https://wa.me/"+_whats()+"?text="+encodeURIComponent(msgPedido(id,a));
  if(it&&it.avisou)return'<a class="ac-reenvia" data-acomp-concluir target="_blank" rel="noopener" href="'+href+'">'+waIc()+'<span><b>✓ Enviado à loja</b> · reenviar</span></a>';
  return'<div class="ac-fim" id="acFim"><b>Último passo</b><span>Toque em <strong>Concluir pedido</strong> para enviar o pedido ao WhatsApp da loja. Assim a gente começa a separar.</span>'
    +'<a class="ac-concluir" data-acomp-concluir target="_blank" rel="noopener" href="'+href+'">'+waIc()+'<span>Concluir pedido</span></a></div>';
}
function desenha(id,a){
  ultimo[id]=a;
  var m=document.getElementById("acomp");
  if(m&&abertoId===id){var y=m.scrollTop;m.innerHTML=html(a,id);m.scrollTop=y}
  pill();
}
function poll(id){
  clearTimeout(tPoll);if(abertoId!==id)return;
  var a=ultimo[id],ms=document.hidden?30e3:a&&a.status==="aguardando_pagamento"?5e3:15e3;
  tPoll=setTimeout(function(){
    if(abertoId!==id)return;
    buscar(id).then(function(j){if(abertoId!==id)return;if(j&&j.acomp){var antes=ultimo[id];desenha(id,j.acomp);avisaMudanca(antes,j.acomp)}poll(id)}).catch(function(){poll(id)});
  },ms);
}
function avisaMudanca(antes,a){
  if(!antes||antes.status===a.status&&!!antes.saiu===!!a.saiu)return;
  var t=topo(a);_toast(t[1]);if(window.SOM)SOM.toca(a.status==="pago"&&antes.status!=="pago"?"pago":"etapa");
  try{if(navigator.vibrate&&!reduz)navigator.vibrate(120)}catch(_){}
}
function abrir(id,op){
  if(!UUID.test(String(id)))return;
  op=op||{};
  if(op.equipe)equipe[id]=true;else guarda(id,op.numero||(ultimo[id]&&ultimo[id].numero)||"",op.txtLoja||"");
  var m=el();if(!m.classList.contains("on")&&window.SOM)SOM.toca("abre");abertoId=id;
  m.innerHTML=ultimo[id]?html(ultimo[id],id):'<div class="ac-h"><span class="ac-num">Pedido'+(op.numero?' <b>#'+_esc(op.numero)+'</b>':"")+'</span><button type="button" class="ac-x" data-acomp-fechar aria-label="Fechar">×</button></div><div class="ac-load" role="status"><span class="ac-spin"></span>Carregando seu pedido…</div>';
  var v=document.getElementById("veil");if(v)v.classList.add("on");
  m.classList.add("on");m.setAttribute("aria-hidden","false");m.scrollTop=0;
  setTimeout(function(){var x=m.querySelector(".ac-x");if(x)x.focus({preventScroll:true})},60);
  buscar(id).then(function(j){
    if(abertoId!==id)return;
    if(j&&j.acomp){desenha(id,j.acomp);poll(id)}
    else{if(j&&j._http===404)esquece(id);m.innerHTML='<div class="ac-h"><span class="ac-num">Pedido</span><button type="button" class="ac-x" data-acomp-fechar aria-label="Fechar">×</button></div><div class="ac-load">Não encontramos esse pedido. Confira o link ou fale com a loja.</div>'}
  }).catch(function(){if(abertoId===id){poll(id)}});
}
function fechar(forcar){
  var it=abertoId&&item(abertoId),a=abertoId&&ultimo[abertoId];
  if(!forcar&&falta(abertoId,a)&&!tentouFechar[abertoId]){   /* lembra 1 vez antes de sair sem concluir */
    tentouFechar[abertoId]=true;_toast("Falta só um passo: toque em “Concluir pedido” para enviar à loja.");
    var f=document.getElementById("acFim");if(f){f.classList.remove("chama");void f.offsetWidth;f.classList.add("chama");f.scrollIntoView({block:"nearest",behavior:reduz?"auto":"smooth"})}
    return;
  }
  var fechou=abertoId;
  var m=document.getElementById("acomp");abertoId=null;clearTimeout(tPoll);
  if(fechou&&a&&a.status==="concluido")esquece(fechou);   /* pedido concluído: o acompanhamento some do aparelho */
  if(!m)return;if(m.classList.contains("on")&&window.SOM)SOM.toca("fecha");m.classList.remove("on");m.setAttribute("aria-hidden","true");
  if(!document.querySelector("#drawer.on,#pm.on")){var v=document.getElementById("veil");if(v)v.classList.remove("on")}
  pill();
}

/* ── atalho fixo no topo da loja ── */
function pillEl(){
  var b=document.getElementById("acompPill");if(b)return b;
  b=document.createElement("button");b.type="button";b.id="acompPill";b.className="acomp-pill";b.hidden=true;
  b.addEventListener("click",function(){var id=b.dataset.id;if(id)abrir(id)});
  document.body.appendChild(b);return b;
}
function pill(){
  var b=pillEl(),l=lista(),x=null;
  for(var i=0;i<l.length;i++){
    var a=ultimo[l[i].id];
    if(a&&(a.status==="cancelado"||a.status==="expirado"||a.status==="recusado"))continue;
    if(a&&a.status==="concluido")continue;                     /* concluído pela loja: some na hora */
    if(!a&&Date.now()-l[i].t>24*3600e3)continue;
    x=l[i];break;
  }
  if(!x||abertoId){b.hidden=true;return}
  var a2=ultimo[x.id],tp=a2?topo(a2):["bag","Acompanhar pedido","","vivo"];
  b.dataset.id=x.id;b.className="acomp-pill ac-"+tp[3];
  var falta_=falta(x.id,a2);
  b.innerHTML='<span class="ap-ic">'+svg(tp[0])+'</span><span class="ap-tx"><b>Pedido #'+_esc(String(x.numero||(a2&&a2.numero)||"").replace(/-/g,"‑"))+'</b><small>'+_esc(falta_?"Falta concluir o pedido":tp[1])+'</small></span><span class="ap-go'+(falta_?" ap-falta":"")+'">'+(falta_?"Concluir ›":"Acompanhar ›")+'</span>';
  b.hidden=false;
}
function vigiaPill(){
  clearTimeout(tPill);
  var l=lista().filter(function(x){var a=ultimo[x.id];return!a||!final(a)});
  if(!l.length){pill();return}
  var id=l[0].id;
  (abertoId?Promise.resolve(null):buscar(id)).then(function(j){
    if(j&&j.acomp){var antes=ultimo[id];ultimo[id]=j.acomp;if(antes)avisaMudanca(antes,j.acomp);pill()}
    else if(j&&j._http===404)esquece(id);
  }).catch(function(){}).then(function(){tPill=setTimeout(vigiaPill,document.hidden?120e3:45e3)});
}

/* ── início: link /?pedido=<id> abre direto; senão mostra o atalho do pedido em andamento ── */
function inicio(){
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&abertoId)fechar()});
  var v=document.getElementById("veil");if(v)v.addEventListener("click",function(){if(abertoId)fechar()});
  var p=window.__PEDIDO_URL||null;try{p=p||new URLSearchParams(location.search).get("pedido")}catch(_){}
  if(p&&UUID.test(p))setTimeout(function espera(){            /* primeiro a confirmação de idade (+18), depois o pedido */
    var g=document.getElementById("age");if(g&&g.classList.contains("on"))return setTimeout(espera,400);
    abrir(p,{equipe:!!window.__PEDIDO_EQUIPE});
  },400);
  vigiaPill();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",inicio);else inicio();

return{abrir:abrir,fechar:fechar,guarda:guarda,_etapas:etapas,_topo:topo};
})();
