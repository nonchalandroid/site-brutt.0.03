/* Sons da loja (window.SOM). Arquivos em /sons/*.mp3 (pacote de sons de interface enviado pela loja).
   Regras:
   - Nada toca antes do 1º toque do cliente (o navegador exige; e ninguém leva susto ao abrir o site).
   - Um som por ação: tudo que for pedido na mesma tarefa vira UM som, o de maior prioridade
     (ex.: pagar fecha a gaveta e abre o acompanhamento, mas só toca "pago").
   - Volume baixo, respeita o modo silencioso do iPhone e não pausa a música do cliente (audioSession "ambient").
   - Botão de som no topo (#somBtn); a escolha fica salva no aparelho (localStorage brutt_som).
   Uso no código: SOM.toca("add"). Cliques simples (setas, filtros, opções, copiar) são tratados aqui por delegação. */
window.SOM=(function(){
"use strict";
var DIR="/sons/",CHAVE="brutt_som",VOL=.42;
/* nome da ação: [arquivo, volume relativo, prioridade] */
var MAPA={
  add:["drop_002",1,5],          /* produto caiu no carrinho */
  mais:["tick_004",.8,1],        /* + quantidade */
  menos:["tick_002",.8,1],       /* − quantidade */
  remove:["minimize_008",.75,4], /* item saiu / carrinho limpo */
  aviso:["question_004",.7,3],   /* "toque de novo pra limpar" */
  erro:["error_004",.8,7],       /* falta algo / esgotado / limite de estoque */
  falha:["error_006",.9,8],      /* pagamento recusado ou Pix vencido */
  seleciona:["select_002",.8,1], /* menu de categorias, filtros */
  seta:["click_002",.7,1],       /* setas dos carrosséis e do produto */
  opcao:["toggle_002",.75,1],    /* forma de entrega / pagamento */
  avanca:["select_007",.7,2],    /* Finalizar pedido */
  volta:["back_003",.7,2],       /* voltar */
  envia:["maximize_009",.7,4],   /* enviar pedido / ir para o pagamento / mandar no WhatsApp / perguntar à IA */
  abre:["open_002",1,2],         /* abre produto, carrinho, endereço, acompanhamento */
  fecha:["close_002",1,2],
  copia:["pluck_001",.9,3],      /* copiou código Pix / endereço */
  confirma:["pluck_002",.9,4],   /* endereço confirmado */
  pix:["glass_002",.8,6],        /* QR Code do Pix pronto */
  minimo:["glass_006",.8,5],     /* pedido mínimo atingido */
  pago:["confirmation_004",.9,9],/* pagamento confirmado */
  etapa:["confirmation_002",.8,6],/* pedido mudou de etapa (saiu para entrega, entregue) */
  ia_abre:["maximize_003",.8,2],
  ia_fecha:["minimize_003",.8,2],
  ia_resposta:["glass_005",.8,3]
};
var ctx=null,saida=null,buf={},carregando={},fila=[],tFila=0,ultimo={},ligado=true,tocados=[];
try{ligado=localStorage.getItem(CHAVE)!=="0"}catch(_){}

function contexto(){
  if(ctx)return ctx;
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  try{ctx=new AC({latencyHint:"interactive"})}catch(_){try{ctx=new AC()}catch(__){return null}}
  saida=ctx.createGain();saida.gain.value=VOL;saida.connect(ctx.destination);
  return ctx;
}
function carrega(arq){
  if(buf[arq])return Promise.resolve(buf[arq]);
  if(carregando[arq])return carregando[arq];
  carregando[arq]=fetch(DIR+arq+".mp3").then(function(r){if(!r.ok)throw 0;return r.arrayBuffer()})
    .then(function(ab){return new Promise(function(ok,erro){ctx.decodeAudioData(ab,ok,erro)})})
    .then(function(b){buf[arq]=b;return b})
    .catch(function(){delete carregando[arq];return null});
  return carregando[arq];
}
/* 1º toque: libera o áudio e baixa os sons (≈50 KB) quando o navegador estiver folgado */
var liberado=false;
function libera(){
  if(!ligado)return;
  try{if(navigator.audioSession)navigator.audioSession.type="ambient"}catch(_){}
  var c=contexto();if(!c)return;
  if(c.state!=="running")c.resume().catch(function(){});
  if(liberado)return;liberado=true;
  var baixa=function(){Object.keys(MAPA).forEach(function(k){carrega(MAPA[k][0])})};
  if(window.requestIdleCallback)requestIdleCallback(baixa,{timeout:3000});else setTimeout(baixa,800);
}
document.addEventListener("pointerdown",libera,{capture:true,passive:true});
document.addEventListener("keydown",libera,{capture:true});

function tocaAgora(nome){
  var m=MAPA[nome];if(!m||!ctx||ctx.state!=="running")return;
  var b=buf[m[0]],pedido=performance.now();
  var vai=function(bb){
    if(!bb||performance.now()-pedido>300)return;          /* chegou atrasado demais: melhor não tocar */
    var s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=m[1];
    s.buffer=bb;s.connect(g);g.connect(saida);s.start();
    tocados.push(nome);if(tocados.length>30)tocados.shift();   /* histórico curto (diagnóstico e testes) */
  };
  if(b)vai(b);else carrega(m[0]).then(vai);
}
function despeja(){
  tFila=0;var melhor=null;
  fila.forEach(function(n){if(!melhor||MAPA[n][2]>=MAPA[melhor][2])melhor=n});
  fila=[];if(melhor)tocaAgora(melhor);
}
function toca(nome){
  if(!ligado||!MAPA[nome]||document.hidden||!ctx)return;
  var agora=performance.now();if(ultimo[nome]&&agora-ultimo[nome]<90)return;ultimo[nome]=agora;
  if(ctx.state!=="running")ctx.resume().catch(function(){});
  fila.push(nome);if(!tFila)tFila=setTimeout(despeja,0);
}

/* cliques simples: o som sai daqui (o resultado não depende de validação) */
var CLIQUES=[
  ["[data-scroll],[data-pm-nav],.arrows button","seta"],
  ["[data-chip],.nv,[data-mi]","seleciona"],
  ["[data-ship],[data-app],[data-pay]","opcao"],
  ["[data-copy],[data-pin-copy],[data-mp-copiar],[data-acomp-copiar]","copia"],
  ["[data-checkout]","avanca"],
  ["[data-back],[data-mp-voltar]","volta"],
  ["[data-acomp-concluir]","envia"]
];
document.addEventListener("click",function(e){
  var t=e.target&&e.target.closest?e.target:null;if(!t)return;
  for(var i=0;i<CLIQUES.length;i++){var el=t.closest(CLIQUES[i][0]);if(el&&!el.disabled){toca(CLIQUES[i][1]);return}}
});

/* botão de som no topo */
var IC_ON='<svg class="ic bi" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.536 14.01A8.47 8.47 0 0 0 14.026 8a8.47 8.47 0 0 0-2.49-6.01l-.708.707A7.48 7.48 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303z"/> <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.48 5.48 0 0 1 11.025 8a5.48 5.48 0 0 1-1.61 3.89z"/> <path d="M10.025 8a4.5 4.5 0 0 1-1.318 3.182L8 10.475A3.5 3.5 0 0 0 9.025 8c0-.966-.392-1.841-1.025-2.475l.707-.707A4.5 4.5 0 0 1 10.025 8M7 4a.5.5 0 0 0-.812-.39L3.825 5.5H1.5A.5.5 0 0 0 1 6v4a.5.5 0 0 0 .5.5h2.325l2.363 1.89A.5.5 0 0 0 7 12zM4.312 6.39 6 5.04v5.92L4.312 9.61A.5.5 0 0 0 4 9.5H2v-3h2a.5.5 0 0 0 .312-.11"/></svg>';
var IC_OFF='<svg class="ic bi" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06M6 5.04 4.312 6.39A.5.5 0 0 1 4 6.5H2v3h2a.5.5 0 0 1 .312.11L6 10.96zm7.854.606a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0"/></svg>';
function desenhaBotao(){
  var b=document.getElementById("somBtn");if(!b)return;
  b.innerHTML=ligado?IC_ON:IC_OFF;b.setAttribute("aria-pressed",String(ligado));
  b.setAttribute("aria-label",ligado?"Sons do site ligados. Toque para desligar":"Sons do site desligados. Toque para ligar");
  b.title=ligado?"Desligar sons":"Ligar sons";
}
function alterna(v){
  ligado=v===void 0?!ligado:!!v;
  try{localStorage.setItem(CHAVE,ligado?"1":"0")}catch(_){}
  desenhaBotao();
  if(ligado){libera();toca("opcao")}
  if(typeof toast==="function")toast(ligado?"Sons ligados":"Sons desligados");
}
function inicio(){
  var b=document.getElementById("somBtn");
  if(b){b.hidden=false;desenhaBotao();b.addEventListener("click",function(){alterna()})}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",inicio);else inicio();

return{toca:toca,alterna:alterna,ligado:function(){return ligado},_mapa:MAPA,_tocados:tocados};
})();
