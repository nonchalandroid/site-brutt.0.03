/* Worker do fundo do topo: desenha no OffscreenCanvas fora da thread da página, então o fogo não disputa
   quadro com a rolagem, os toques e o catálogo. Mensagens de js/topo-fogo.js:
   {canvas} (1ª vez) · {tam:{W,H,dpr,zonas,calma}} · {ligado:bool, ms:intervalo entre quadros} */
importScripts("topo-fogo-motor.js?v=20261013a");
var motor=null,ligado=false,ms=33,ult=0,agendado=false;
var raf=self.requestAnimationFrame?function(f){return self.requestAnimationFrame(f)}:function(f){return setTimeout(function(){f(performance.now())},16)};
function loop(now){agendado=false;if(!ligado||!motor)return;agenda();if(now-ult<ms)return;ult=now;motor.desenhar(now)}
function agenda(){if(!agendado){agendado=true;raf(loop)}}
onmessage=function(e){var d=e.data||{};
  if(d.canvas)motor=self.FogoMotor(d.canvas.getContext("2d"),function(w,h){return new OffscreenCanvas(w,h)});
  if(d.tam&&motor)motor.montar(d.tam);
  if("ligado" in d){ligado=!!d.ligado;if(d.ms)ms=d.ms;if(ligado){motor&&motor.zerar();agenda()}}
};
