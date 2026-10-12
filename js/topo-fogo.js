/* ───────── Fundo do topo: "crypto em chamas" ─────────
   Atrás da busca: grade digital fina, aurora de fogo (laranja/vermelho/dourado) que deriva devagar, rede de nós
   ligados (estilo blockchain) e pulsos de luz correndo pela grade. Canvas do tamanho da .bar, ~30 fps;
   com prefers-reduced-motion desenha um quadro só. */
(function(){
  var bar=document.querySelector("header .bar"),cv=document.getElementById("topoFx");
  if(!bar||!cv||!cv.getContext)return;
  var ctx=cv.getContext("2d");if(!ctx)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PASSO=22;                                   /* espaçamento da grade (px CSS) */
  var W=0,H=0,dpr=1,grade,nos=[],pulsos=[],t0=performance.now(),ult=0,raf=0,logo={x:-999,y:0,r:0};
  var AURORA=[[255,90,31],[214,57,43],[227,172,61],[255,130,40]];

  function montar(){
    var r=bar.getBoundingClientRect(),hdr=cv.parentNode.getBoundingClientRect();
    W=Math.max(1,Math.round(hdr.width));H=Math.max(1,Math.round(r.height));
    cv.style.top=(r.top-hdr.top)+"px";cv.style.height=H+"px";
    dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var lg=bar.querySelector(".logo-wrap");if(lg){var q=lg.getBoundingClientRect();logo={x:q.left-hdr.left+q.width/2,y:q.top-r.top+q.height/2,r:q.width*.9}}
    /* grade fixa: linhas finas + pontinhos nos cruzamentos */
    grade=document.createElement("canvas");grade.width=cv.width;grade.height=cv.height;
    var g=grade.getContext("2d");g.scale(dpr,dpr);g.lineWidth=1/dpr;g.strokeStyle="rgba(227,172,61,.075)";g.beginPath();
    for(var x=(W%PASSO)/2;x<=W;x+=PASSO){g.moveTo(x,0);g.lineTo(x,H)}
    for(var y=(H%PASSO)/2;y<=H;y+=PASSO){g.moveTo(0,y);g.lineTo(W,y)}
    g.stroke();g.fillStyle="rgba(255,170,80,.22)";
    for(x=(W%PASSO)/2;x<=W;x+=PASSO)for(y=(H%PASSO)/2;y<=H;y+=PASSO)g.fillRect(x-.75,y-.75,1.5,1.5);
    /* rede: nós espalhados que derivam devagar */
    nos=[];var n=Math.max(8,Math.min(60,Math.round(W/36)));
    for(var i=0;i<n;i++)nos.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*6,f:Math.random()*6.28,r:.9+Math.random()*1.3});
    pulsos=[];desenhar(performance.now());
  }

  function novoPulso(){
    var hz=Math.random()<.7,linhas=hz?Math.floor(H/PASSO):Math.floor(W/PASSO),k=Math.floor(Math.random()*(linhas+1)),
      off=hz?(H%PASSO)/2:(W%PASSO)/2,dir=Math.random()<.5?1:-1;
    pulsos.push({hz:hz,c:off+k*PASSO,p:dir>0?-60:(hz?W:H)+60,dir:dir,v:(hz?160:60)+Math.random()*(hz?240:60),len:hz?40+Math.random()*50:16})
  }

  function desenhar(now){
    var t=(now-t0)/1000,dt=Math.min(.1,(now-(ult||now))/1000);ult=now;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
    ctx.fillStyle="#0b0604";ctx.fillRect(0,0,W,H);
    /* aurora de fogo: manchas grandes que correm pelo topo */
    ctx.globalCompositeOperation="lighter";
    for(var i=0;i<6;i++){var c=AURORA[i%4],
      cx=((i/6+t*(.012+i*.004))%1.2-.1)*W+Math.sin(t*.5+i*1.7)*60,
      cy=H*(.5+.45*Math.sin(t*.7+i*2.3)),rr=Math.max(H*1.6,W*.09)*(.85+.25*Math.sin(t*.9+i)),
      a=.32+.1*Math.sin(t*1.3+i*2),gr=ctx.createRadialGradient(cx,cy,0,cx,cy,rr);
      gr.addColorStop(0,"rgba("+c[0]+","+c[1]+","+c[2]+","+a.toFixed(3)+")");gr.addColorStop(1,"rgba("+c[0]+","+c[1]+","+c[2]+",0)");
      ctx.fillStyle=gr;ctx.fillRect(cx-rr,0,rr*2,H)}
    ctx.globalCompositeOperation="source-over";
    ctx.drawImage(grade,0,0,W,H);
    /* rede de nós (estilo blockchain) */
    ctx.globalCompositeOperation="lighter";ctx.lineWidth=.8;
    for(i=0;i<nos.length;i++){var a1=nos[i];
      a1.x+=a1.vx*dt;a1.y+=a1.vy*dt;
      if(a1.x<-20)a1.x=W+20;else if(a1.x>W+20)a1.x=-20;
      if(a1.y<2||a1.y>H-2){a1.vy*=-1;a1.y=Math.max(2,Math.min(H-2,a1.y))}}
    for(i=0;i<nos.length;i++)for(var j=i+1;j<nos.length;j++){var A=nos[i],B=nos[j],dx=A.x-B.x;if(dx>110||dx<-110)continue;
      var d=Math.hypot(dx,A.y-B.y);if(d>110)continue;
      ctx.strokeStyle="rgba(255,140,50,"+((1-d/110)*.38).toFixed(3)+")";ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()}
    for(i=0;i<nos.length;i++){var p=nos[i],b=.6+.4*Math.sin(t*2+p.f);
      ctx.fillStyle="rgba(255,120,40,"+(b*.18).toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,6.283);ctx.fill();
      ctx.fillStyle="rgba(255,214,150,"+(.55+.4*b).toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill()}
    /* pulsos de dados correndo pela grade */
    if(!calma&&pulsos.length<Math.min(9,2+W/320)&&Math.random()<dt*3)novoPulso();
    for(i=pulsos.length-1;i>=0;i--){var q=pulsos[i];q.p+=q.v*q.dir*dt;
      var fim=q.hz?W:H;if(q.p<-80||q.p>fim+80){pulsos.splice(i,1);continue}
      var x0=q.hz?q.p-q.len*q.dir:q.c,y0=q.hz?q.c:q.p-q.len*q.dir,x1=q.hz?q.p:q.c,y1=q.hz?q.c:q.p,
        lg=ctx.createLinearGradient(x0,y0,x1,y1);
      lg.addColorStop(0,"rgba(255,90,31,0)");lg.addColorStop(.7,"rgba(255,140,50,.7)");lg.addColorStop(1,"rgba(255,236,190,1)");
      ctx.strokeStyle=lg;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
      ctx.fillStyle="rgba(255,200,120,.35)";ctx.beginPath();ctx.arc(x1,y1,3.2,0,6.283);ctx.fill()}
    /* fundo mais calmo atrás da logo e bordas escurecidas para fundir com a faixa de cima e o menu */
    ctx.globalCompositeOperation="source-over";
    if(logo.r){var sl=ctx.createRadialGradient(logo.x,logo.y,0,logo.x,logo.y,logo.r);
      sl.addColorStop(0,"rgba(11,6,4,.75)");sl.addColorStop(1,"rgba(11,6,4,0)");ctx.fillStyle=sl;ctx.fillRect(logo.x-logo.r,0,logo.r*2,H)}
    var gr2=ctx.createLinearGradient(0,0,0,H);gr2.addColorStop(0,"rgba(8,5,3,.75)");gr2.addColorStop(.25,"rgba(8,5,3,0)");
    gr2.addColorStop(.78,"rgba(8,5,3,0)");gr2.addColorStop(1,"rgba(8,5,3,.6)");ctx.fillStyle=gr2;ctx.fillRect(0,0,W,H);
  }

  function loop(now){raf=requestAnimationFrame(loop);if(now-ult<33)return;desenhar(now)}
  function iniciar(){cancelAnimationFrame(raf);montar();cv.classList.add("on");if(!calma)raf=requestAnimationFrame(loop)}

  var esp=0;function depois(ms){clearTimeout(esp);esp=setTimeout(iniciar,ms)}
  if(window.ResizeObserver)new ResizeObserver(function(){depois(120)}).observe(bar);else addEventListener("resize",function(){depois(120)});
  var img=bar.querySelector("[data-logo]");if(img&&!img.complete)img.addEventListener("load",function(){depois(60)},{once:true});
  iniciar();
})();
