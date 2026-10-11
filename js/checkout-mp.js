/* Pagamento online pelo Mercado Pago (Payment Brick oficial): Pix com QR Code dinâmico, débito e crédito à vista.
   Só a PUBLIC KEY fica no site (window.__MP.publicKey). O Access Token fica na edge function "checkout".
   Sem public key configurada, o site continua no fluxo antigo (pedido pelo WhatsApp).
   Carregado depois do script principal: usa cart, byId, ship, entrega, total, taxaAtual, esc, ic, R, toast… */
window.MPX=(function(){
"use strict";
var CFG=window.__MP||{},S=window.__SUPA||{};
var FN=(S.url||"")+"/functions/v1/checkout";
var LOJA_CEP="23067-030";            /* o mesmo do link "Como chegar" do site */
var metodo="pix",whatsVal="",pedido=null,brick=null,poll=null,emailVal="";
try{whatsVal=JSON.parse(localStorage.getItem("brutt_whats")||'""')||"";emailVal=JSON.parse(localStorage.getItem("brutt_email")||'""')||""}catch(e){}

function ativo(){return!!(CFG.publicKey&&S.url&&S.key)}
function dig(s){return String(s||"").replace(/\D/g,"")}
function emailOk(){return/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(emailVal||"").trim())}
function whatsOk(){var d=dig(whatsVal);if(d.length===12||d.length===13)d=d.replace(/^55/,"");return d.length===10||d.length===11}
function mascara(v){var d=dig(v).slice(0,11);if(d.length<3)return d;if(d.length<7)return"("+d.slice(0,2)+") "+d.slice(2);if(d.length<11)return"("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);return"("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7)}

/* ───────── partes do formulário de checkout ───────── */
function whatsHTML(){if(!ativo())return"";return'<label class="field" for="email">Seu e-mail</label><input class="t" id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="voce@email.com" maxlength="120" value="'+esc(emailVal)+'"><p class="whats-h">O Mercado Pago usa para o comprovante do Pix.</p>'
  +'<label class="field" for="whats">Seu WhatsApp</label><input class="t" id="whats" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" maxlength="16" value="'+esc(mascara(whatsVal))+'"><p class="whats-h">A loja usa para falar com você sobre o pedido.</p>'}
var PIN='<svg class="pin-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.1-7-12a7 7 0 0 1 14 0c0 5.9-7 12-7 12Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
function clienteHTML(){
  return'<div class="cli-box">'
   +'<div class="cli-frete"><span>Frete da loja</span><b>'+R(0)+'</b></div>'
   +'<div class="cli-pin"><button type="button" class="pin-copy" data-pin-copy aria-label="Copiar o endereço da loja: '+esc(END_LOJA+", "+LOJA_CEP)+'">'+PIN+'</button>'
   +'<span class="pin-ok" role="status" aria-live="polite"></span></div>'
   +'<p class="cli-note">Clique no pin para copiar o endereço da loja e cole no aplicativo de entrega (Uber Flash ou 99).</p></div>';
}
/* Só Pix: sem cartão digitado no site (prevenção de fraude). Cartão só volta se a loja decidir. */
var OPT=[["pix","Pix","QR Code na hora"]];
/* Pix = símbolo oficial (simple-icons, CC0) na cor oficial do Banco Central #32BCAD — não redesenhar nem tingir */
var PAY_IC={pix:'<path style="fill:#32BCAD;stroke:none" d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/>',cartao:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>'};
function pagamentoHTML(){
  var teste=CFG.teste?'<p class="mp-teste">🧪 MODO TESTE do pagamento online.</p>':"";
  if(OPT.length===1)return teste+'<div class="pix-aviso"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+PAY_IC.pix+'</svg><span><b>Pagamento por Pix</b><small>Ao tocar no botão, o QR Code e o código copia e cola aparecem na hora. Não aceitamos cartão no site.</small></span></div>';
  return(CFG.teste?'<p class="mp-teste">🧪 MODO TESTE do pagamento online.</p>':"")+'<div class="field">Como você quer pagar?</div><div class="pay-opts'+(OPT.length===1?" um":"")+'" role="radiogroup" aria-label="Forma de pagamento">'
   +OPT.map(function(o){var on=o[0]===metodo;return'<button type="button" class="popt'+(on?" sel":"")+'" role="radio" aria-checked="'+on+'" data-pay="'+o[0]+'"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(o[0]==="pix"?PAY_IC.pix:PAY_IC.cartao)+'</svg><b>'+o[1]+'</b><small>'+o[2]+'</small></button>'}).join("")
   +'</div><p class="pay-safe"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><span>Pix instantâneo, processado com segurança pelo <b>Mercado Pago</b>. Não aceitamos cartão digitado no site.</span></p>';
}
document.addEventListener("input",function(e){if(e.target&&e.target.id==="email"){emailVal=e.target.value.trim();try{localStorage.setItem("brutt_email",JSON.stringify(emailVal))}catch(_){}}});
document.addEventListener("input",function(e){if(e.target&&e.target.id==="whats"){var v=mascara(e.target.value);if(v!==e.target.value)e.target.value=v;whatsVal=v;try{localStorage.setItem("brutt_whats",JSON.stringify(v))}catch(_){}}});
document.addEventListener("click",function(e){
  var b=e.target.closest&&e.target.closest("[data-pay],[data-pin-copy],[data-mp-voltar],[data-mp-copiar],[data-mp-tentar],[data-mp-whats]");if(!b)return;
  if(b.dataset.pay){metodo=b.dataset.pay;document.querySelectorAll(".popt").forEach(function(x){var on=x.dataset.pay===metodo;x.classList.toggle("sel",on);x.setAttribute("aria-checked",String(on))})}
  else if(b.hasAttribute("data-pin-copy"))copiarPin(b);
  else if(b.hasAttribute("data-mp-voltar"))voltar();
  else if(b.hasAttribute("data-mp-copiar"))copiarPix(b);
  else if(b.hasAttribute("data-mp-tentar"))montarBrick();
  else if(b.hasAttribute("data-mp-whats"))viaWhats();
});
function copiarTexto(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t).catch(function(){return fb(t)});
  return Promise.resolve(fb(t));
  function fb(x){var a=document.createElement("textarea");a.value=x;a.setAttribute("readonly","");a.style.cssText="position:fixed;top:0;left:0;opacity:0";document.body.appendChild(a);a.select();try{document.execCommand("copy")}catch(_){}a.remove()}
}
function copiarPin(b){
  copiarTexto(END_LOJA+", "+LOJA_CEP).then(function(){
    var box=b.closest(".cli-pin"),ok=box&&box.querySelector(".pin-ok");
    b.classList.remove("done");void b.offsetWidth;b.classList.add("done");
    if(ok){ok.textContent="Endereço copiado";ok.classList.add("on");clearTimeout(ok._t);ok._t=setTimeout(function(){ok.classList.remove("on")},2600)}
    toast("Endereço copiado");
  });
}

/* ───────── API (edge function) ───────── */
function api(acao,body){
  var h={apikey:S.key,Authorization:"Bearer "+S.key};
  if(body)h["Content-Type"]="application/json";
  return fetch(FN+"?acao="+acao+(body?"":""),{method:body?"POST":"GET",headers:h,body:body?JSON.stringify(body):undefined})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(j){j._http=r.status;return j})});
}
function assinatura(nome,reserva){
  return JSON.stringify([cart,ship,ship==="entrega"?entrega.endereco:null,nome,dig(whatsVal),!!reserva]);
}

/* ───────── etapa de pagamento (dentro do drawer) ───────── */
var _ctx=null;
function iniciar(o){
  _ctx=o;
  cartView="pagamento";
  $("#dTitle").textContent="Pagamento";
  $("#dFoot").innerHTML="";
  $("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button><div class="mp-load" role="status">'+spin()+'<span>Preparando o pagamento…</span></div>';
  var sig=assinatura(o.nome,o.reserva);
  /* mesmo carrinho/endereço/contato de antes: reaproveita o pedido já criado (não gera pedido duplicado) */
  if(pedido&&pedido._sig===sig&&Date.now()-pedido._t<20*60e3)return mostrarEtapa();
  var corpo={nome:o.nome,whats:whatsVal,reserva:!!o.reserva,
    itens:Object.keys(cart).map(function(id){return{id:id,q:cart[id]}}),
    entrega:ship==="entrega"?{tipo:"entrega",endereco:entrega.endereco,geo:entrega.geo}:{tipo:"cliente"}};
  api("criar",corpo).then(function(j){
    if(cartView!=="pagamento")return;
    if(j._http===503){CFG.publicKey="";toast("Pagamento online indisponível agora. Envie o pedido pelo WhatsApp.");drawCart("checkout");return}
    if(!j.ok){return falha(j.erro||"Não conseguimos preparar o pagamento. Tente de novo.")}
    pedido=j;pedido._sig=sig;pedido._t=Date.now();
    if(j.public_key)CFG.publicKey=j.public_key;
    mostrarEtapa();
  }).catch(function(){falha("Sem conexão. Confira sua internet e tente de novo.")});
}
function spin(){return'<svg class="mp-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>'}
/* Rede de proteção: se o pagamento online falhar, o cliente não perde a venda — manda o mesmo pedido pelo WhatsApp. */
var BTN_WHATS='<button type="button" class="go mp-whats" data-mp-whats>Enviar pedido pelo WhatsApp</button>';
function falha(msg){$("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button><p class="mp-err" role="alert">'+esc(msg)+'</p>'+BTN_WHATS}
function viaWhats(){
  clearTimeout(poll);clearInterval(_tempo);desmontar();
  CFG.publicKey="";pedido=null;            /* desliga o pagamento online nesta visita */
  drawCart("checkout");
  if(typeof sendOrder==="function")sendOrder(true);
}
function resumoHTML(){
  var p=pedido,dif=Math.abs(p.total-(total()+taxaAtual()))>=.01;
  return'<div class="mp-res"><div><span>Pedido</span><b>#'+esc(p.numero)+'</b></div>'
   +'<div><span>Produtos</span><b>'+R(p.subtotal)+'</b></div>'
   +'<div><span>'+(ship==="entrega"?"Entrega pela loja":"Frete da loja")+'</span><b>'+R(p.taxa_entrega)+'</b></div>'
   +'<div class="mp-tot"><span>Total</span><b>'+R(p.total)+'</b></div>'
   +(dif?'<p class="mp-dif">Valores conferidos com o estoque e a distância atuais.</p>':"")+'</div>';
}
function mostrarEtapa(){
  var nome={pix:"Pix",debito:"Cartão de débito",credito:"Cartão de crédito · à vista"}[metodo];
  $("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button>'+resumoHTML()
    +(metodo==="pix"?"":'<div class="mp-h"><b>'+nome+'</b></div>')+'<p class="mp-err" id="mpErr" role="alert" hidden></p>'
    +'<div id="mpArea"><div id="mpBrick"></div><div class="mp-load" id="mpLoad" role="status">'+spin()+'<span>Carregando o pagamento seguro…</span></div></div>';
  montarBrick();
}
var _sdk=null;
function carregaSDK(){
  if(window.MercadoPago)return Promise.resolve();
  if(_sdk)return _sdk;
  _sdk=new Promise(function(ok,nok){var s=document.createElement("script");s.src="https://sdk.mercadopago.com/js/v2";s.onload=ok;s.onerror=function(){_sdk=null;nok()};document.head.appendChild(s)});
  return _sdk;
}
function desmontar(){if(brick){try{brick.unmount()}catch(e){}brick=null}}
/* Pix: sem formulário — pede o QR direto ao servidor (o e-mail que o Mercado Pago exige é preenchido lá). */
function gerarPix(){
  var a=$("#mpArea");if(!a)return;
  var e=$("#mpErr");if(e)e.hidden=true;
  a.innerHTML='<div class="mp-load" role="status">'+spin()+'<span>Gerando o QR Code Pix…</span></div>';
  pagar({payment_method_id:"pix",payer:emailOk()?{email:String(emailVal).trim().toLowerCase()}:{}}).catch(function(){var x=$("#mpArea");if(x&&!x.querySelector(".pix"))x.innerHTML=""});
}
function montarBrick(){
  desmontar();
  var area=$("#mpArea");if(!area)return;
  if(metodo==="pix")return gerarPix();
  area.innerHTML='<div id="mpBrick"></div><div class="mp-load" id="mpLoad" role="status">'+spin()+'<span>Carregando o pagamento seguro…</span></div>';
  carregaSDK().then(function(){
    if(!$("#mpBrick"))return;
    var mp=new MercadoPago(CFG.publicKey,{locale:"pt-BR"});
    var metodos=metodo==="pix"?{bankTransfer:"all"}:metodo==="debito"?{debitCard:"all"}:{creditCard:"all",maxInstallments:1,minInstallments:1};
    return mp.bricks().create("payment","mpBrick",{
      initialization:{amount:Number(pedido.total),payer:{email:emailVal||""}},
      customization:{paymentMethods:metodos,visual:{style:{theme:"dark",customVariables:{baseColor:"#e3ac3d",baseColorFirstVariant:"#efc25e",baseColorSecondVariant:"#c8902a",formBackgroundColor:"#170f0a",textPrimaryColor:"#f3e4c8",textSecondaryColor:"#b8a184",inputBackgroundColor:"#0e0806",outlinePrimaryColor:"#2c1d14",borderRadiusMedium:"12px",borderRadiusLarge:"14px"}}}},
      callbacks:{
        onReady:function(){var l=$("#mpLoad");if(l)l.remove()},
        onError:function(err){console.warn("Brick",err);var l=$("#mpLoad");if(l)l.remove();if(err&&err.type==="critical")erroPag("Não foi possível carregar o pagamento. Tente de novo.",true)},
        onSubmit:function(d){return pagar(d&&d.formData||{})}
      }
    }).then(function(c){brick=c});
  }).catch(function(){erroPag("Não foi possível carregar o Mercado Pago. Confira sua internet.",true)});
}
function erroPag(msg,botao){
  var e=$("#mpErr");if(!e)return;
  e.innerHTML=esc(msg)+(botao?' <button type="button" class="chip" data-mp-tentar>Tentar de novo</button>':"")+'<span class="mp-ou">ou</span>'+BTN_WHATS;e.hidden=false;
  try{e.scrollIntoView({block:"nearest",behavior:"smooth"})}catch(_){}
}
var RECUSA={cc_rejected_insufficient_amount:"Saldo ou limite insuficiente.",cc_rejected_bad_filled_security_code:"Código de segurança inválido.",cc_rejected_bad_filled_date:"Data de validade inválida.",cc_rejected_bad_filled_card_number:"Número do cartão inválido.",cc_rejected_bad_filled_other:"Confira os dados do cartão.",cc_rejected_call_for_authorize:"O banco pediu autorização: libere o pagamento com o emissor do cartão.",cc_rejected_card_disabled:"Cartão desativado. Fale com o emissor.",cc_rejected_duplicated_payment:"Pagamento duplicado: esse valor já foi enviado.",cc_rejected_high_risk:"Pagamento recusado por segurança. Tente outro cartão ou Pix.",cc_rejected_max_attempts:"Limite de tentativas atingido. Use outro cartão ou Pix."};
function pagar(fd){
  var e=$("#mpErr");if(e)e.hidden=true;
  if(fd&&fd.payer&&fd.payer.email){emailVal=fd.payer.email;try{localStorage.setItem("brutt_email",JSON.stringify(emailVal))}catch(_){}}
  return new Promise(function(ok,nok){
    api("pagar",{pedido_id:pedido.pedido_id,metodo:metodo,formData:fd}).then(function(j){
      if(!j.ok){nok();erroPag(j.erro||"Não foi possível concluir o pagamento.",false);return}
      ok();
      if(j.status==="pago"||j.status==="concluido")return sucesso(j.numero);
      if(j.status==="recusado"){erroPag("Pagamento não aprovado. "+(RECUSA[j.mp_status_detail]||"Tente outro cartão ou pague com Pix."),true);return}
      if(metodo==="pix"&&j.pix)return mostrarPix(j.pix);
      aguardando('<div class="mp-wait">'+spin()+'<b>Pagamento em análise</b><span>Assim que o Mercado Pago confirmar, você recebe a confirmação aqui e no WhatsApp.</span></div>');
    }).catch(function(){nok();erroPag("Sem conexão. Confira sua internet e tente de novo.",false)});
  });
}
function aguardando(html){desmontar();var a=$("#mpArea");if(a)a.innerHTML=html;acompanhar()}
function mostrarPix(px){
  desmontar();
  var a=$("#mpArea");if(!a)return;
  var res=document.querySelector("#dBody .mp-res");
  if(res&&pedido)res.outerHTML='<div class="pix-topo"><span>Pedido <b>#'+esc(pedido.numero)+'</b></span><span>Total <b>'+R(pedido.total)+'</b></span></div>';
  a.innerHTML='<div class="pix">'
    +(px.qr_code_base64?'<img class="pix-qr" alt="QR Code Pix do pedido" width="220" height="220" src="data:image/png;base64,'+esc(px.qr_code_base64)+'">':"")
    +'<div class="pix-code"><input id="pixCode" readonly value="'+esc(px.qr_code||"")+'" aria-label="Código Pix copia e cola"><button type="button" class="go pix-copy" data-mp-copiar>Copiar código Pix</button></div>'
    +'<p class="pix-t">No app do banco: <b>Pix → Ler QR Code</b> ou <b>Pix copia e cola</b>. O código vale 30 min e é só deste pedido.</p>'
    +'<div class="mp-wait">'+spin()+'<b>Aguardando o pagamento…</b><span id="pixTempo"></span></div></div>';
  tempoPix(px.expira_em);
  if(window.ACOMP&&pedido)ACOMP.guarda(pedido.pedido_id,pedido.numero);   /* atalho "Acompanhar" aparece se o cliente fechar a tela */
  acompanhar();
}
function copiarPix(b){var c=$("#pixCode");if(!c)return;copiarTexto(c.value).then(function(){b.textContent="Código copiado!";b.classList.add("done");toast("Código Pix copiado");setTimeout(function(){if(b.isConnected){b.textContent="Copiar código Pix";b.classList.remove("done")}},2500)})}
var _tempo=null;
function tempoPix(fim){
  clearInterval(_tempo);var f=fim?new Date(fim).getTime():0;if(!f)return;
  var t=function(){var el=$("#pixTempo");if(!el){clearInterval(_tempo);return}var s=Math.max(0,Math.round((f-Date.now())/1e3));el.textContent=s?"O código expira em "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):"Código expirado";};
  t();_tempo=setInterval(t,1e3);
}
function acompanhar(){
  clearTimeout(poll);
  var id=pedido&&pedido.pedido_id,inicio=Date.now();if(!id)return;
  (function vez(){
    poll=setTimeout(function(){
      if(!pedido||pedido.pedido_id!==id)return;
      api("status&pedido="+encodeURIComponent(id)).then(function(j){
        if(!pedido||pedido.pedido_id!==id)return;
        if(j.status==="pago"||j.status==="concluido")return sucesso(j.numero);
        if(j.status==="expirado"){if(cartView==="pagamento")aviso("Pix expirado","O código Pix expirou e nada foi cobrado. Gere um novo pagamento.");pedido._t=0;return}
        if(j.status==="recusado"){if(cartView==="pagamento"){erroPag("Pagamento não aprovado. "+(RECUSA[j.mp_status_detail]||"Tente de novo."),true)}return}
        if(Date.now()-inicio<40*60e3)vez();
      }).catch(function(){if(Date.now()-inicio<40*60e3)vez()});
    },document.hidden?8e3:4e3);
  })();
}
function aviso(t,s){var a=$("#mpArea");if(a)a.innerHTML='<div class="mp-wait off"><b>'+esc(t)+'</b><span>'+esc(s)+'</span><button type="button" class="go" data-mp-tentar>Gerar novo pagamento</button></div>'}
/* Mensagem do pedido PAGO para o WhatsApp da loja (o cliente toca em enviar). Valores vindos do servidor. */
function msgLojaPago(numero){
  var p=pedido||{},c=_ctx||{},L=[];
  L.push("✅ *PEDIDO PAGO NO SITE #"+numero+"*"+(c.reserva?" (reserva: loja fechada)":""));
  L.push("👤 "+(c.nome||"Cliente")+(whatsVal?" · WhatsApp "+mascara(whatsVal):""));
  L.push("");L.push("🛒 *Itens:*");
  var itens=(p.itens&&p.itens.length)?p.itens:Object.keys(cart).filter(function(id){return byId[id]}).map(function(id){return{qtd:cart[id],nome:byId[id].n,subtotal:byId[id].price*cart[id]}});
  itens.forEach(function(i){L.push("• "+i.qtd+"x "+i.nome+" — "+R(Number(i.subtotal)||0))});
  L.push("");
  if(ship==="entrega"&&entrega&&entrega.endereco){var e=entrega.endereco;L.push("🚚 Entrega pela loja: "+e.rua+", "+e.numero+(e.complemento?" ("+e.complemento+")":"")+" — "+[e.bairro,e.cidade].filter(Boolean).join(", ")+(p.km!=null?" · ≈ "+String(p.km).replace(".",",")+" km":""));L.push("Taxa de entrega: "+R(Number(p.taxa_entrega)||0))}
  else L.push("🛵 Vou solicitar a entrega por conta própria (Uber Flash ou 99). Frete da loja R$ 0,00.");
  L.push("💰 *Total pago no Pix: "+R(Number(p.total)||0)+"*");
  L.push("Pagamento confirmado pelo Mercado Pago no site.");
  return L.join("\n");
}
function sucesso(numero){
  clearTimeout(poll);clearInterval(_tempo);desmontar();
  var reserva=_ctx&&_ctx.reserva,txtLoja=pedido?msgLojaPago(numero):"",idPed=pedido&&pedido.pedido_id;
  try{sSet("brutt_nome",_ctx&&_ctx.nome||"")}catch(e){}
  pedido=null;_ctx=null;
  cart={};minHit=false;closeAll();updateCart();cartView="";
  /* tela "Acompanhe seu pedido" (js/acompanhar.js); sem ela, o aviso simples de antes */
  if(window.ACOMP&&idPed){ACOMP.abrir(idPed,{numero:numero,txtLoja:txtLoja});return}
  mostrarFeito(numero,reserva);
  var t=$("#feitoT"),s=$("#feitoS");
  if(t)t.textContent="✅ Pagamento confirmado!";
  if(s)s.textContent="Pedido #"+String(numero).replace(/-/g,"\u2011")+(reserva?" — separamos assim que a loja abrir":"")+(txtLoja?" · toque no botão verde para avisar a loja":"");
  var w=$("#feitoWa");
  if(w&&txtLoja){w.href="https://wa.me/"+WHATS+"?text="+encodeURIComponent(txtLoja);w.innerHTML=ic("chat")+"<span>Avisar a loja no WhatsApp</span>";w.hidden=false}
}
/* Pedido montado pela Brutt IA: carrega no carrinho e abre o MESMO checkout (o servidor revalida tudo). */
function deIA(co){
  if(!co||!Array.isArray(co.itens))return;
  cart={};
  co.itens.forEach(function(i){var p=byId[i.id],q=Math.floor(Number(i.q));if(p&&p.st>0&&q>0)cart[i.id]=Math.min(q,p.st)});
  minHit=false;updateCart();
  if(co.nome)nomeVal=String(co.nome).slice(0,60);
  var e=co.entrega||{};
  if(e.tipo==="cliente")ship="frete";
  else{
    ship="entrega";
    entrega=e.geo&&isFinite(e.geo.lat)&&isFinite(e.geo.lng)&&e.endereco
      ?{verificada:true,distKm:e.km,taxa:e.taxa,geo:{lat:+e.geo.lat,lng:+e.geo.lng},endereco:e.endereco}
      :{verificada:false,distKm:null,taxa:null,endereco:null};       /* sem coordenadas: o cliente confirma o endereço no modal */
  }
  pedido=null;
  var d=document.getElementById("drawer");
  if(!d.classList.contains("on"))document.getElementById("cartBtn").click();
  if(typeof carregarHorarios==="function")carregarHorarios();
  drawCart("checkout");
  setTimeout(function(){var m=$("#email"),w=$("#whats");if(m&&!emailOk())m.focus();else if(w&&!whatsOk())w.focus()},350);
}
function voltar(){clearTimeout(poll);clearInterval(_tempo);desmontar();drawCart("checkout")}

return{deIA:deIA,ativo:ativo,emailOk:emailOk,whatsOk:whatsOk,whatsHTML:whatsHTML,clienteHTML:clienteHTML,pagamentoHTML:pagamentoHTML,iniciar:iniciar};
})();
