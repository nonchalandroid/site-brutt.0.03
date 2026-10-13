/* ───────── Motor do fundo do topo ("crypto em chamas") ─────────
   Só desenho, sem DOM: roda dentro do worker (js/topo-fogo-worker.js, com OffscreenCanvas, fora da thread da
   página) ou, em navegador sem OffscreenCanvas, na própria página (js/topo-fogo.js). Recebe o tamanho da faixa e
   as "zonas" (logo e ícones) medidas pela página. */
self.FogoMotor=function(ctx,novoCanvas){
  var PASSO=22;                                   /* espaçamento da grade (px CSS) */
  var W=0,H=0,dpr=1,grade,nos=[],pulsos=[],t0=performance.now(),ult=0,zonas=[],calma=false;
  var AURORA=[[255,90,31],[214,57,43],[227,172,61],[255,130,40]];

  function montar(o){
    W=o.W;H=o.H;dpr=o.dpr;zonas=o.zonas||[];calma=!!o.calma;
    ctx.canvas.width=Math.round(W*dpr);ctx.canvas.height=Math.round(H*dpr);
    /* grade fixa: linhas finas + pontinhos nos cruzamentos */
    grade=novoCanvas(Math.round(W*dpr),Math.round(H*dpr));
    var g=grade.getContext("2d");g.scale(dpr,dpr);g.lineWidth=1/dpr;g.strokeStyle="rgba(227,172,61,.075)";g.beginPath();
    for(var x=(W%PASSO)/2;x<=W;x+=PASSO){g.moveTo(x,0);g.lineTo(x,H)}
    for(var y=(H%PASSO)/2;y<=H;y+=PASSO){g.moveTo(0,y);g.lineTo(W,y)}
    g.stroke();g.fillStyle="rgba(255,170,80,.22)";
    for(x=(W%PASSO)/2;x<=W;x+=PASSO)for(y=(H%PASSO)/2;y<=H;y+=PASSO)g.fillRect(x-.75,y-.75,1.5,1.5);
    /* rede: nós espalhados que derivam devagar */
    nos=[];var n=Math.max(8,Math.min(60,Math.round(W/36)));
    for(var i=0;i<n;i++){var nx,ny,tent=0;do{nx=Math.random()*W;ny=Math.random()*H}while(naZona(nx,ny,6)&&++tent<30);nos.push({x:nx,y:ny,vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*6,f:Math.random()*6.28,r:.9+Math.random()*1.3})}
    pulsos=[];ult=0;desenhar(performance.now());
  }

  function naZona(x,y,folga){for(var i=0;i<zonas.length;i++){var z=zonas[i],dx=x-z.x,dy=y-z.y,rr=z.r+(folga||0);if(dx*dx+dy*dy<rr*rr)return z}return null}
  /* o segmento A–B passa por alguma zona? (distância do centro ao segmento) */
  function cruza(ax,ay,bx,by){for(var i=0;i<zonas.length;i++){var z=zonas[i],vx=bx-ax,vy=by-ay,l=vx*vx+vy*vy||1,
    k=Math.max(0,Math.min(1,((z.x-ax)*vx+(z.y-ay)*vy)/l)),dx=ax+vx*k-z.x,dy=ay+vy*k-z.y;if(dx*dx+dy*dy<z.r*z.r)return true}return false}
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
      if(a1.y<2||a1.y>H-2){a1.vy*=-1;a1.y=Math.max(2,Math.min(H-2,a1.y))}
      var z=naZona(a1.x,a1.y,8);if(z){var ex=a1.x-z.x,ey=a1.y-z.y,el=Math.hypot(ex,ey)||1,mn=z.r+8;   /* desvia: empurra pra borda da zona */
        a1.x=z.x+ex/el*mn;a1.y=Math.max(2,Math.min(H-2,z.y+ey/el*mn));if(ex*a1.vx<0)a1.vx*=-1}}
    for(i=0;i<nos.length;i++)for(var j=i+1;j<nos.length;j++){var A=nos[i],B=nos[j],dx=A.x-B.x;if(dx>110||dx<-110)continue;
      var d=Math.hypot(dx,A.y-B.y);if(d>110||cruza(A.x,A.y,B.x,B.y))continue;
      ctx.strokeStyle="rgba(255,140,50,"+((1-d/110)*.38).toFixed(3)+")";ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke()}
    for(i=0;i<nos.length;i++){var p=nos[i],b=.6+.4*Math.sin(t*2+p.f);
      ctx.fillStyle="rgba(255,120,40,"+(b*.18).toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,6.283);ctx.fill();
      ctx.fillStyle="rgba(255,214,150,"+(.55+.4*b).toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill()}
    /* pulsos de dados correndo pela grade */
    if(!calma&&pulsos.length<Math.min(9,2+W/320)&&Math.random()<dt*3)novoPulso();
    for(i=pulsos.length-1;i>=0;i--){var q=pulsos[i];q.p+=q.v*q.dir*dt;
      var fim=q.hz?W:H;if(q.p<-80||q.p>fim+80){pulsos.splice(i,1);continue}
      if(naZona(q.hz?q.p:q.c,q.hz?q.c:q.p,q.len*.6))continue;      /* some ao passar por trás de um ícone */
      var x0=q.hz?q.p-q.len*q.dir:q.c,y0=q.hz?q.c:q.p-q.len*q.dir,x1=q.hz?q.p:q.c,y1=q.hz?q.c:q.p,
        lg=ctx.createLinearGradient(x0,y0,x1,y1);
      lg.addColorStop(0,"rgba(255,90,31,0)");lg.addColorStop(.7,"rgba(255,140,50,.7)");lg.addColorStop(1,"rgba(255,236,190,1)");
      ctx.strokeStyle=lg;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
      ctx.fillStyle="rgba(255,200,120,.35)";ctx.beginPath();ctx.arc(x1,y1,3.2,0,6.283);ctx.fill()}
    /* fundo mais calmo atrás da logo e dos ícones, e bordas escurecidas para fundir com a faixa de cima e o menu */
    ctx.globalCompositeOperation="source-over";
    for(i=0;i<zonas.length;i++){var zz=zonas[i],zr=zz.r*(zz.logo?1.15:1.25),sl=ctx.createRadialGradient(zz.x,zz.y,0,zz.x,zz.y,zr);
      sl.addColorStop(0,"rgba(11,6,4,.8)");sl.addColorStop(.6,"rgba(11,6,4,.55)");sl.addColorStop(1,"rgba(11,6,4,0)");ctx.fillStyle=sl;ctx.fillRect(zz.x-zr,zz.y-zr,zr*2,zr*2)}
    var gr2=ctx.createLinearGradient(0,0,0,H);gr2.addColorStop(0,"rgba(8,5,3,.75)");gr2.addColorStop(.25,"rgba(8,5,3,0)");
    gr2.addColorStop(.78,"rgba(8,5,3,0)");gr2.addColorStop(1,"rgba(8,5,3,.6)");ctx.fillStyle=gr2;ctx.fillRect(0,0,W,H);
  }


  return{montar:montar,desenhar:desenhar,zerar:function(){ult=0}};
};
