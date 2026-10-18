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
var DIR="/sons/",CHAVE="brutt_som",VOL=.29;   /* 13/10/2026: −30% (era .42) */
/* Só sons graves e "ocos" (18/10/2026, pedido da loja): ficaram só os sons com quase toda a energia abaixo de 800 Hz
   (medido: drop 91%, minimize_008 100%, question 100%, error_006 99%, error_004 72%). Todos os cliques, aberturas,
   "glass", "pluck" e confirmações agudas saíram; ação que não está aqui fica em silêncio.
   nome da ação: [arquivo, volume relativo, prioridade, velocidade (menor = mais grave; 1 = original)] */
var MAPA={
  add:["drop_002",1,5],          /* produto caiu no carrinho */
  remove:["minimize_008",.75,4], /* item saiu / carrinho limpo */
  aviso:["question_004",.7,3],   /* "toque de novo pra limpar" */
  erro:["error_004",.8,7,.8],    /* falta algo / esgotado / limite de estoque */
  falha:["error_006",.9,8],      /* pagamento recusado ou Pix vencido */
  confirma:["drop_002",.8,4,.85],/* endereço confirmado */
  pago:["drop_002",1,9,.7]       /* pagamento confirmado */
};
var ctx=null,saida=null,buf={},carregando={},fila=[],tFila=0,ultimo={},ligado=true,tocados=[];
try{ligado=localStorage.getItem(CHAVE)!=="0"}catch(_){}

function contexto(){
  if(ctx)return ctx;
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  try{ctx=new AC({latencyHint:"interactive"})}catch(_){try{ctx=new AC()}catch(__){return null}}
  saida=ctx.createGain();saida.gain.value=VOL;
  var grave=ctx.createBiquadFilter();grave.type="lowpass";grave.frequency.value=2000;grave.Q.value=.5;   /* corta o agudo */
  saida.connect(grave);grave.connect(ctx.destination);
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
    s.buffer=bb;if(m[3])s.playbackRate.value=m[3];s.connect(g);g.connect(saida);s.start();
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
  if(ligado){libera();toca("add")}
  if(typeof toast==="function")toast(ligado?"Sons ligados":"Sons desligados");
}
function inicio(){
  var b=document.getElementById("somBtn");
  if(b){b.hidden=false;desenhaBotao();b.addEventListener("click",function(){alterna()})}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",inicio);else inicio();

return{toca:toca,alterna:alterna,ligado:function(){return ligado},_mapa:MAPA,_tocados:tocados};
})();
