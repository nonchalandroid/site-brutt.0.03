/* Pagamento online pelo Mercado Pago (Payment Brick oficial): Pix com QR Code dinâmico, débito e crédito à vista.
   Só a PUBLIC KEY fica no site (window.__MP.publicKey). O Access Token fica na edge function "checkout".
   Sem public key configurada, o site continua no fluxo antigo (pedido pelo WhatsApp).
   Carregado depois do script principal: usa cart, byId, ship, entrega, total, taxaAtual, esc, ic, R, toast… */
window.MPX=(function(){
"use strict";
var CFG=window.__MP||{},S=window.__SUPA||{};
var FN=(S.url||"")+"/functions/v1/checkout";
var LOJA_CEP="23067-030";            /* o mesmo do link "Como chegar" do site */
var metodo="pix",whatsVal="",pedido=null,brick=null,poll=null,emailVal="",promosVal=false,_avisoTimer=null;
/* 18/10/2026: o checkout pede só o NOME (e-mail e WhatsApp travavam compras). O contato chega quando o cliente manda o
   pedido no WhatsApp da loja. O Mercado Pago recebe um e-mail interno do pedido (servidor); o comprovante do Mercado Pago
   chega ao cliente no e-mail da conta dele, por isso a tela só avisa, sem pedir e-mail. */
var CNPJ="68.325.560/0001-50";   /* chave Pix da loja: aparece formatada, copia só os números (o banco reconhece a chave) */

function ativo(){return!!(CFG.publicKey&&S.url&&S.key)}
function dig(s){return String(s||"").replace(/\D/g,"")}
function emailOk(){return/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(emailVal||"").trim())}
function whatsOk(){var d=dig(whatsVal);if(d.length===12||d.length===13)d=d.replace(/^55/,"");return d.length===10||d.length===11}
function mascara(v){var d=dig(v).slice(0,11);if(d.length<3)return d;if(d.length<7)return"("+d.slice(0,2)+") "+d.slice(2);if(d.length<11)return"("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);return"("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7)}

/* ───────── partes do formulário de checkout ───────── */
/* Contato OPCIONAL (19/10/2026): WhatsApp e e-mail para o andamento do pedido, comprovante e, só se marcar a caixa
   (que vem desmarcada: consentimento explícito, LGPD), promoções e cupons. Nada aqui trava a compra. */
try{whatsVal=JSON.parse(localStorage.getItem("brutt_whats")||'""')||"";emailVal=JSON.parse(localStorage.getItem("brutt_email")||'""')||""}catch(e){}
function whatsInvalido(){return!!dig(whatsVal)&&!whatsOk()}
function emailInvalido(){return!!String(emailVal||"").trim()&&!emailOk()}
/* entrega=true ("Entrega pela loja"): mostra por que vale deixar o WhatsApp; a dica liga/desliga em marcarEntrega (#cttDica) */
function whatsHTML(entrega){if(!ativo())return"";return'<div class="ctt"><p class="ctt-t">Quer acompanhar o pedido e receber novidades? <small>Opcional</small></p>'
  +'<p class="ctt-dica" id="cttDica"'+(entrega?"":" hidden")+'>Deixe seu WhatsApp para o entregador te chamar quando chegar.</p>'
  +'<div class="ctt-g"><div><label class="field" for="whats">WhatsApp</label><input class="t" id="whats" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" maxlength="16" value="'+esc(mascara(whatsVal))+'"></div>'
  +'<div><label class="field" for="email">E-mail</label><input class="t" id="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="voce@email.com" maxlength="120" value="'+esc(emailVal)+'"></div></div>'
  +'<label class="ctt-ok"><input type="checkbox" id="promos"'+(promosVal?" checked":"")+'><span>Quero receber promoções e cupons de desconto da Brutt</span></label></div>'}
var PIN='<svg class="pin-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.1-7-12a7 7 0 0 1 14 0c0 5.9-7 12-7 12Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
/* "Prefiro eu mesmo solicitar a entrega": o cliente chama o Uber/99 dele, então aqui não aparece valor nenhum.
   Pin copia o endereço da loja (ponto de coleta); botões abrem os apps. Uber = logotipo oficial (simple-icons, CC0),
   branco sobre preto como no kit da marca, abrindo com a loja como coleta. 99: logotipo oficial enviado pela loja
   (imagens/marcas/99.webp, 120 px), sem redesenhar nem tingir. */
var UBER_URL="https://m.uber.com/go/connect/drop?pickup="+encodeURIComponent(JSON.stringify({addressLine1:"Tabacaria Brutt",addressLine2:"Rua 18, 145 - Campo Grande, Rio de Janeiro - RJ",id:"ChIJ2ZoYwxLjmwARXZoZR_SDnp0",source:"SEARCH",latitude:-22.8814745,longitude:-43.6137391,provider:"google_places"}));
var APP99_URL="https://99app.com/";
var UBER_LOGO='<svg class="uber-logo" viewBox="0 7.6 24 8.8" role="img" aria-label="Uber"><path d="M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z"/></svg>';
function clienteHTML(){
  return'<div class="cli-box">'
   +'<div class="cli-pin"><button type="button" class="pin-copy" data-pin-copy aria-label="Copiar o endereço da loja: '+esc(END_LOJA+", "+LOJA_CEP)+'">'+PIN+'</button>'
   +'<span class="pin-ok" role="status" aria-live="polite"></span></div>'
   +'<p class="cli-note">Toque no pin para copiar o endereço da loja e cole no app de entrega como ponto de coleta.</p>'
   +'<div class="cli-apps"><a class="app-btn uber" href="'+esc(UBER_URL)+'" target="_blank" rel="noopener" aria-label="Abrir o Uber com a loja como coleta">'+UBER_LOGO+'</a>'
   +'<a class="app-btn n99" href="'+APP99_URL+'" target="_blank" rel="noopener" aria-label="Abrir o app 99"><img src="/imagens/marcas/99.webp" alt="99" width="44" height="44" decoding="async"></a></div></div>';
}
/* Só Pix: sem cartão digitado no site (prevenção de fraude). Cartão só volta se a loja decidir. */
var OPT=[["pix","Pix","QR Code na hora"]];
/* Pix = símbolo oficial (simple-icons, CC0) na cor oficial do Banco Central #32BCAD — não redesenhar nem tingir */
/* Selos de pagamento seguro (rodapé do checkout e da tela do Pix). Símbolos OFICIAIS (simple-icons, CC0), nas cores das marcas:
   Mercado Pago #00B1EA, Pix #32BCAD. O cadeado "Conexão segura SSL" só aparece quando a página está mesmo em https. */
var MP_LOGO='<path style="fill:#00B1EA;stroke:none" d="M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z"/>';
var CADEADO='<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><path d="M12 14.6v2.4"/>';
function selosHTML(){
  var ssl=location.protocol==="https:"||window.__SELO_SSL===true;
  var sv=function(p,c){return'<svg class="ic'+(c?" "+c:"")+'" viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>'};
  return'<div class="selos" aria-label="Pagamento seguro">'+(ssl?'<span class="selo">'+sv(CADEADO,"cad")+'Conexão segura SSL</span>':"")
    +'<span class="selo">'+sv(MP_LOGO)+'Mercado Pago</span><span class="selo">'+sv(PAY_IC.pix)+'Pix</span></div>';
}
var PAY_IC={pix:'<path style="fill:#32BCAD;stroke:none" d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/>',cartao:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>'};
function pagamentoHTML(){
  var teste=CFG.teste?'<p class="mp-teste">🧪 MODO TESTE do pagamento online.</p>':"";
  if(OPT.length===1)return teste+'<div class="pix-aviso"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+PAY_IC.pix+'</svg><span><b>Pagamento por Pix</b><small>Ao tocar no botão, o QR Code e o código copia e cola aparecem na hora. Não aceitamos cartão no site.</small></span></div>';
  return(CFG.teste?'<p class="mp-teste">🧪 MODO TESTE do pagamento online.</p>':"")+'<div class="field">Como você quer pagar?</div><div class="pay-opts'+(OPT.length===1?" um":"")+'" role="radiogroup" aria-label="Forma de pagamento">'
   +OPT.map(function(o){var on=o[0]===metodo;return'<button type="button" class="popt'+(on?" sel":"")+'" role="radio" aria-checked="'+on+'" data-pay="'+o[0]+'"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+(o[0]==="pix"?PAY_IC.pix:PAY_IC.cartao)+'</svg><b>'+o[1]+'</b><small>'+o[2]+'</small></button>'}).join("")
   +'</div><p class="pay-safe"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><span>Pix instantâneo, processado com segurança pelo <b>Mercado Pago</b>. Não aceitamos cartão digitado no site.</span></p>';
}
document.addEventListener("input",function(e){var t=e.target;if(!t)return;
  if(t.id==="whats"){var v=mascara(t.value);if(v!==t.value)t.value=v;whatsVal=v;try{localStorage.setItem("brutt_whats",JSON.stringify(v))}catch(_){}}
  else if(t.id==="email"){emailVal=t.value.trim();try{localStorage.setItem("brutt_email",JSON.stringify(emailVal))}catch(_){}}});
document.addEventListener("change",function(e){if(e.target&&e.target.id==="promos")promosVal=e.target.checked});
document.addEventListener("click",function(e){
  var b=e.target.closest&&e.target.closest("[data-pay],[data-pin-copy],[data-mp-voltar],[data-mp-copiar],[data-mp-tentar],[data-mp-whats],[data-mp-gerar],[data-mp-cnpj]");if(!b)return;
  if(b.dataset.pay){metodo=b.dataset.pay;document.querySelectorAll(".popt").forEach(function(x){var on=x.dataset.pay===metodo;x.classList.toggle("sel",on);x.setAttribute("aria-checked",String(on))})}
  else if(b.hasAttribute("data-pin-copy"))copiarPin(b);
  else if(b.hasAttribute("data-mp-voltar"))voltar();
  else if(b.hasAttribute("data-mp-copiar"))copiarPix(b);
  else if(b.hasAttribute("data-mp-tentar"))montarBrick();
  else if(b.hasAttribute("data-mp-whats"))viaWhats();
  else if(b.hasAttribute("data-mp-gerar"))gerarPix();
  else if(b.hasAttribute("data-mp-cnpj"))copiarCnpj(b);
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
  var corpo={nome:o.nome,whats:whatsOk()?whatsVal:"",email:emailOk()?String(emailVal).trim():"",promos:!!promosVal&&(whatsOk()||emailOk()),reserva:!!o.reserva,
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
var BTN_WHATS='<button type="button" class="go mp-whats" data-mp-whats>Enviar no WhatsApp</button>';
function falha(msg){if(window.SOM)SOM.toca("falha");$("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button><p class="mp-err" role="alert">'+esc(msg)+'</p>'+BTN_WHATS}
function viaWhats(){
  clearTimeout(poll);clearInterval(_tempo);desmontar();
  CFG.publicKey="";pedido=null;            /* desliga o pagamento online nesta visita */
  drawCart("checkout");
  if(typeof sendOrder==="function")sendOrder(true);
}
/* Comanda do pedido (pagamento, antes de gerar o Pix): itens à esquerda, picote, total grande em Anton. */
function resumoHTML(){
  var p=pedido,dif=Math.abs(p.total-(total()+taxaAtual()))>=.01;
  return'<div class="pg-ticket"><div class="pg-lin"><span>Pedido</span><b class="pg-num">#'+esc(p.numero)+'</b></div>'
   +'<div class="pg-lin"><span>Produtos</span><b>'+R(p.subtotal)+'</b></div>'
   +(ship==="entrega"?'<div class="pg-lin"><span>Entrega pela loja</span><b>'+R(p.taxa_entrega)+'</b></div>':"")   /* Uber/99 do cliente: sem linha de valor */
   +'<div class="pg-total"><span>Total a pagar</span><b>'+R(p.total)+'</b></div>'
   +(dif?'<p class="pg-dif">O total foi conferido com o estoque e a taxa de entrega de agora.</p>':"")+'</div>';
}
var AVISO_MP="O Mercado Pago também envia as informações da compra para o e-mail da sua conta.";
function mostrarEtapa(){
  var nome={pix:"Pix",debito:"Cartão de débito",credito:"Cartão de crédito · à vista"}[metodo];
  $("#dBody").innerHTML='<button class="chip" data-mp-voltar>‹ Voltar</button>'+resumoHTML()
    +(metodo==="pix"?"":'<div class="mp-h"><b>'+nome+'</b></div>')+'<p class="mp-err" id="mpErr" role="alert" hidden></p>'
    +'<div id="mpArea"><div id="mpBrick"></div><div class="mp-load" id="mpLoad" role="status">'+spin()+'<span>Carregando o pagamento seguro…</span></div></div>';
  if(metodo==="pix"){
    $("#mpArea").innerHTML='<div class="pg-gerar"><button type="button" class="go pix-gera" data-mp-gerar><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+PAY_IC.pix+'</svg><span>Gerar Pix de '+R(pedido.total)+'</span></button>'
      +'<p>O QR Code e o código copia e cola aparecem na hora e valem 30 minutos. '+AVISO_MP+'</p>'+selosHTML()+'</div>';
    return;
  }
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
  clearTimeout(_avisoTimer);
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
  var e=$("#mpErr");if(!e)return;if(window.SOM)SOM.toca("falha");
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
function mostrarPix(px){if(window.SOM)SOM.toca("pix");
  desmontar();
  var a=$("#mpArea");if(!a)return;
  var res=document.querySelector("#dBody .pg-ticket");
  if(res&&pedido)res.outerHTML='<div class="pg-ticket pg-curto"><div class="pg-total"><span><span>Pedido <b class="pg-num">#'+esc(pedido.numero)+'</b></span><small id="pixTempo"></small></span><b>'+R(pedido.total)+'</b></div></div>';
  a.innerHTML='<div class="pg-pix">'
    +(px.qr_code_base64?'<div class="pg-qr"><img alt="QR Code Pix do pedido" width="220" height="220" src="data:image/png;base64,'+esc(px.qr_code_base64)+'"></div>':"")
    +'<input id="pixCode" class="pg-codigo" readonly value="'+esc(px.qr_code||"")+'" aria-label="Código Pix copia e cola" tabindex="-1">'
    +'<button type="button" class="go pix-copy" data-mp-copiar>Copiar código Pix</button>'
    +'<p class="pg-passos">No app do banco: <b>Pix</b> → <b>Ler QR Code</b> ou <b>Copia e cola</b>.</p>'
    +'<div class="pg-espera" role="status"><i aria-hidden="true"></i><b>Aguardando o pagamento</b></div>'
    +'<div class="pg-chave"><span class="pg-cnpj"><small>Ou pague pela chave CNPJ</small>'+CNPJ+'</span><button type="button" class="pg-copiar" data-mp-cnpj>Copiar</button></div>'
    +'<p class="pg-aviso">'+AVISO_MP+'</p></div>';
  tempoPix(px.expira_em);
  if(window.ACOMP&&pedido)ACOMP.guarda(pedido.pedido_id,pedido.numero,msgLojaPedido(pedido.numero));   /* atalho "Acompanhar" + mensagem completa do pedido guardada JÁ AQUI: o celular pode recarregar a página enquanto o cliente paga no app do banco */
  acompanhar();
}
function copiarCnpj(b){copiarTexto(CNPJ.replace(/\D/g,"")).then(function(){b.textContent="Copiada!";b.classList.add("done");toast("Chave CNPJ copiada");setTimeout(function(){if(b.isConnected){b.textContent="Copiar";b.classList.remove("done")}},2500)})}
function copiarPix(b){var c=$("#pixCode");if(!c)return;copiarTexto(c.value).then(function(){b.textContent="Código copiado";b.classList.add("done");toast("Código Pix copiado");setTimeout(function(){if(b.isConnected){b.textContent="Copiar código Pix";b.classList.remove("done")}},2500)})}
var _tempo=null;
function tempoPix(fim){
  clearInterval(_tempo);var f=fim?new Date(fim).getTime():0;if(!f)return;
  var t=function(){var el=$("#pixTempo");if(!el){clearInterval(_tempo);return}var s=Math.max(0,Math.round((f-Date.now())/1e3));el.textContent=s?"Vale por "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0"):"Código vencido";};
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
        if(j.status==="expirado"){pedido._t=0;if(cartView==="pagamento")aviso("Pix expirado","O código Pix expirou e nada foi cobrado. Voltando ao checkout…",true);return}
        if(j.status==="recusado"){if(cartView==="pagamento"){erroPag("Pagamento não aprovado. "+(RECUSA[j.mp_status_detail]||"Tente de novo."),true)}return}
        if(Date.now()-inicio<40*60e3)vez();
      }).catch(function(){if(Date.now()-inicio<40*60e3)vez()});
    },document.hidden?8e3:4e3);
  })();
}
function aviso(t,s,voltarAoCheckout){clearTimeout(_avisoTimer);clearInterval(_tempo);var tp=$("#pixTempo");if(tp)tp.textContent="Código vencido";if(window.SOM)SOM.toca("falha");var a=$("#mpArea");if(a)a.innerHTML='<div class="mp-wait off"><b>'+esc(t)+'</b><span>'+esc(s)+'</span>'+(voltarAoCheckout?'<small>Voltando ao checkout em instantes…</small>':'<button type="button" class="go" data-mp-tentar>Gerar novo Pix</button>')+'</div>';if(voltarAoCheckout){var id=pedido&&pedido.pedido_id;_avisoTimer=setTimeout(function(){if(!(cartView==="pagamento"&&pedido&&pedido.pedido_id===id))return;document.querySelectorAll("#mpArea .mp-wait.off,#dBody .pg-ticket").forEach(function(w){w.classList.add("some-nevoa")});   /* some como fumaça antes de voltar */
    _avisoTimer=setTimeout(function(){if(cartView==="pagamento"&&pedido&&pedido.pedido_id===id)voltar()},matchMedia("(prefers-reduced-motion: reduce)").matches?0:1500)},3500)}}
/* Mensagem do pedido PAGO para o WhatsApp da loja (o cliente toca em enviar). Valores vindos do servidor. */
/* Mensagem do pedido para o WhatsApp da loja: o MESMO formato do pedido pelo WhatsApp (montarMsg da loja), para a equipe
   saber tudo sem abrir o painel. A linha do pagamento fica como {PAGAMENTO} e é preenchida na hora do envio com a situação
   do Pix (pago / aguardando / vencido) por MPX.pagamentoLinha() em js/acompanhar.js. */
var PAG_TOKEN="{PAGAMENTO}";
function pagamentoLinha(st){
  var s={pago:"✅ PAGO",concluido:"✅ PAGO",aguardando_pagamento:"⏳ Pix gerado, aguardando pagamento",expirado:"⌛ Pix vencido (não foi pago)",recusado:"❌ pagamento recusado",cancelado:"cancelado"}[st]||"⏳ aguardando pagamento";
  return "💳 *Pagamento:* Pix (Mercado Pago) — "+s;
}
function msgLojaPedido(numero){
  var p=pedido||{},c=_ctx||{},r=c.reserva&&typeof c.reserva==="object"?c.reserva:(c.reserva?{nenhum:true}:null);
  var itens=(p.itens&&p.itens.length)?p.itens:Object.keys(cart).filter(function(id){return byId[id]}).map(function(id){return{qtd:cart[id],nome:byId[id].n,subtotal:byId[id].price*cart[id]}});
  var envio;
  if(ship==="entrega"&&entrega&&entrega.endereco){
    var e=entrega.endereco,cepF=(e.cep||"").length===8?e.cep.slice(0,5)+"-"+e.cep.slice(5):(e.cep||"");
    var mapa=[e.rua+", "+e.numero,e.bairro,e.cidade+" - "+e.uf,cepF].filter(Boolean).join(", ");
    envio="Entrega pela loja — "+e.rua+", "+e.numero+(e.complemento?" ("+e.complemento+")":"")+", "+[e.bairro,(e.cidade||"")+(e.uf?"/"+e.uf:"")].filter(Boolean).join(", ")+"."+(e.cep?" CEP "+e.cep+".":"")
      +" Taxa de entrega: "+R(Number(p.taxa_entrega)||0)+" (já incluída no total)."
      +"\n🗺️ Localização: https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(mapa).replace(/%20/g,"+");
  }else envio="Vou solicitar a entrega por conta própria (Uber Flash ou 99) — frete da loja R$ 0,00. Eu sou o destinatário, a Tabacaria Brutt é o ponto de coleta.";
  return [r?"📌 RESERVA DE PEDIDO #"+numero:"📦 NOVO PEDIDO #"+numero,
    "👤 CLIENTE: *"+(c.nome||"Cliente")+"*"+(whatsVal?"\n📱 WhatsApp: "+mascara(whatsVal):""),
    r?"⏰ *Loja fechada quando o cliente pediu.* Ele aguarda contato da equipe assim que abrirmos"+(r.nenhum?"":" ("+r.quando+" às "+r.hora+")")+".":null,
    "----------","🛒 ITENS DO PEDIDO",
    itens.map(function(i){return"• "+i.qtd+"x "+i.nome+" — "+R(Number(i.subtotal)||0)}).join("\n"),
    "----------","💰 *Total:* "+R(Number(p.total)||0),
    "🚚 *Recebimento:* "+envio,
    PAG_TOKEN].filter(function(x){return x!==null}).join("\n");
}
function msgLojaPago(numero){return msgLojaPedido(numero).replace(PAG_TOKEN,pagamentoLinha("pago"))}
function sucesso(numero){if(window.SOM)SOM.toca("pago");
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
}
function voltar(){clearTimeout(poll);clearInterval(_tempo);clearTimeout(_avisoTimer);desmontar();drawCart("checkout")}

return{deIA:deIA,ativo:ativo,whatsInvalido:whatsInvalido,emailInvalido:emailInvalido,pagamentoLinha:pagamentoLinha,emailOk:emailOk,whatsOk:whatsOk,whatsHTML:whatsHTML,clienteHTML:clienteHTML,pagamentoHTML:pagamentoHTML,iniciar:iniciar,selosHTML:selosHTML};
})();
