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
function whatsOk(){var d=dig(whatsVal);if(d.length===12||d.length===13)d=d.replace(/^55/,"");return d.length===10||d.length===11}
function mascara(v){var d=dig(v).slice(0,11);if(d.length<3)return d;if(d.length<7)return"("+d.slice(0,2)+") "+d.slice(2);if(d.length<11)return"("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);return"("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7)}

/* ───────── partes do formulário de checkout ───────── */
function whatsHTML(){if(!ativo())return"";return'<label class="field" for="whats">Seu WhatsApp</label><input class="t" id="whats" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" maxlength="16" value="'+esc(mascara(whatsVal))+'"><p class="whats-h">A confirmação do pagamento chega por aqui.</p>'}
var PIN='<svg class="pin-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.1-7-12a7 7 0 0 1 14 0c0 5.9-7 12-7 12Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
function clienteHTML(){
  return'<div class="cli-box">'
   +'<div class="cli-frete"><span>Frete da loja</span><b>'+R(0)+'</b></div>'
   +'<div class="cli-pin"><button type="button" class="pin-copy" data-pin-copy aria-label="Copiar o endereço da loja: '+esc(END_LOJA+", "+LOJA_CEP)+'">'+PIN+'</button>'
   +'<span class="pin-ok" role="status" aria-live="polite"></span></div>'
   +'<p class="cli-note">Clique no pin para copiar o endereço da loja e cole no aplicativo de entrega (Uber Flash ou 99).</p></div>';
}
var OPT=[["pix","Pix","QR Code na hora"],["debito","Débito","Cartão de débito"],["credito","Crédito","À vista"]];
var PAY_IC={pix:'<path d="M12 2.6 21.4 12 12 21.4 2.6 12Z"/><path d="M8.6 9.2 12 12.6l3.4-3.4M8.6 14.8 12 11.4l3.4 3.4"/>',cartao:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>'};
function pagamentoHTML(){
  return(CFG.teste?'<p class="mp-teste">🧪 MODO TESTE: use só cartões e contas de teste do Mercado Pago.</p>':"")+'<div class="field">Como você quer pagar?</div><div class="pay-opts" role="radiogroup" aria-label="Forma de pagamento">'
   +OPT.map(function(o){var on=o[0]===metodo;return'<button type="button" class="popt'+(on?" sel":"")+'" role="radio" aria-checked="'+on+'" data-pay="'+o[0]+'"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(o[0]==="pix"?PAY_IC.pix:PAY_IC.cartao)+'</svg><b>'+o[1]+'</b><small>'+o[2]+'</small></button>'}).join("")
   +'</div><p class="pay-safe"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><span>Pagamento seguro pelo <b>Mercado Pago</b>. Os dados do cartão não passam pela loja.</span></p>';
}
document.addEventListener("input",function(e){if(e.target&&e.target.id==="whats"){var v=mascara(e.target.value);if(v!==e.target.value)e.target.value=v;whatsVal=v;try{localStorage.setItem("brutt_whats",JSON.stringify(v))}catch(_){}}});
document.addEventListener("click",function(e){
  var b=e.target.closest&&e.target.closest("[data-pay],[data-pin-copy],[data-mp-voltar],[data-mp-copiar],[data-mp-tentar]");if(!b)return;
  if(b.dataset.pay){metodo=b.dataset.pay;document.querySelectorAll(".popt").forEach(function(x){var on=x.dataset.pay===metodo;x.classList.toggle("sel",on);x.setAttribute("aria-checked",String(on))})}
  else if(b.hasAttribute("data-pin-copy"))copiarPin(b);
  else if(b.hasAttribute("data-mp-voltar"))voltar();
  else if(b.hasAttribute("data-mp-copiar"))copiarPix(b);
  else if(b.hasAttribute("data-mp-tentar"))montarBrick();
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
function falha(msg){$("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button><p class="mp-err" role="alert">'+esc(msg)+'</p>'}
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
    +'<div class="mp-h"><b>'+nome+'</b></div><p class="mp-err" id="mpErr" role="alert" hidden></p>'
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
function montarBrick(){
  desmontar();
  var area=$("#mpArea");if(!area)return;
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
  e.innerHTML=esc(msg)+(botao?' <button type="button" class="chip" data-mp-tentar>Tentar de novo</button>':"");e.hidden=false;
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
  a.innerHTML='<div class="pix">'
    +(px.qr_code_base64?'<img class="pix-qr" alt="QR Code Pix do pedido" width="220" height="220" src="data:image/png;base64,'+esc(px.qr_code_base64)+'">':"")
    +'<p class="pix-t">Abra o app do seu banco, escolha <b>Pix</b> e escaneie o QR Code ou use o <b>Pix copia e cola</b>:</p>'
    +'<div class="pix-code"><input id="pixCode" readonly value="'+esc(px.qr_code||"")+'" aria-label="Código Pix copia e cola"><button type="button" class="go pix-copy" data-mp-copiar>Copiar código</button></div>'
    +'<div class="mp-wait">'+spin()+'<b>Aguardando o pagamento…</b><span id="pixTempo"></span></div></div>';
  tempoPix(px.expira_em);
  acompanhar();
}
function copiarPix(b){var c=$("#pixCode");if(!c)return;copiarTexto(c.value).then(function(){b.textContent="Código copiado!";b.classList.add("done");toast("Código Pix copiado");setTimeout(function(){if(b.isConnected){b.textContent="Copiar código";b.classList.remove("done")}},2500)})}
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
function sucesso(numero){
  clearTimeout(poll);clearInterval(_tempo);desmontar();
  var reserva=_ctx&&_ctx.reserva;
  try{sSet("brutt_nome",_ctx&&_ctx.nome||"")}catch(e){}
  pedido=null;_ctx=null;
  cart={};minHit=false;closeAll();updateCart();cartView="";
  mostrarFeito(numero,reserva);
  var t=$("#feitoT"),s=$("#feitoS");
  if(t)t.textContent="✅ Pagamento confirmado!";
  if(s)s.textContent="Pedido #"+numero+(reserva?" — separamos assim que a loja abrir":"")+" · confirmação enviada no seu WhatsApp";
}
function voltar(){clearTimeout(poll);clearInterval(_tempo);desmontar();drawCart("checkout")}

return{ativo:ativo,whatsOk:whatsOk,whatsHTML:whatsHTML,clienteHTML:clienteHTML,pagamentoHTML:pagamentoHTML,iniciar:iniciar};
})();
