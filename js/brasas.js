/* ───────── Brasas do cabeçalho ─────────
   Fundo de carvão em brasa atrás da busca: pedaços de carvão (Voronoi) com rachaduras incandescentes que
   "respiram", uma onda de calor que corre pelo leito e fagulhas subindo. A textura do carvão é desenhada uma
   vez; por quadro só se recalcula o calor numa grade de baixa resolução (ampliada = brilho suave) a ~30 fps. */
(function(){
  var bar=document.querySelector("header .bar"),cv=document.getElementById("brasas");
  if(!bar||!cv||!cv.getContext)return;
  var ctx=cv.getContext("2d");if(!ctx)return;
  var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ruído de valor + fbm (determinístico) */
  function h2(x,y){var n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
  function ruido(x,y){var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),
    a=h2(xi,yi),b=h2(xi+1,yi),c=h2(xi,yi+1),d=h2(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
  function fbm(x,y){return ruido(x,y)*.55+ruido(x*2.03,y*2.03)*.3+ruido(x*4.1,y*4.1)*.15}

  /* paleta de corpo negro: preto → vermelho escuro → laranja → amarelo-claro */
  var LUT=new Uint8ClampedArray(256*3),st=[[0,0,0,0],[.22,70,6,0],[.42,170,32,0],[.62,245,96,8],[.82,255,165,48],[1,255,228,160]];
  for(var i=0;i<256;i++){var t=i/255,k=0;while(k<st.length-2&&t>st[k+1][0])k++;var A=st[k],B=st[k+1],f=(t-A[0])/(B[0]-A[0]);
    LUT[i*3]=A[1]+(B[1]-A[1])*f;LUT[i*3+1]=A[2]+(B[2]-A[2])*f;LUT[i*3+2]=A[3]+(B[3]-A[3])*f}

  var CEL=30,ESC=2;              /* tamanho do pedaço de carvão e redução da grade de calor (px CSS) */
  var W=0,H=0,dpr=1,pts,cols,rows,cel,base,calor,cImg,brilho,gx,gy,gc,ge,gs,gn,fag=[],t0=performance.now(),ult=0,raf=0,logo={x:0,y:0,r:0};

  function semear(){
    cols=Math.ceil(W/CEL)+2;rows=Math.ceil(H/CEL)+2;pts=[];cel=[];
    for(var j=0;j<rows;j++)for(var i=0;i<cols;i++){
      pts.push((i-1+.05+Math.random()*.9)*CEL,(j-1+.05+Math.random()*.9)*CEL);
      var quente=Math.random();
      cel.push({h:quente<.15?.18+Math.random()*.2:.5+Math.random()*.5,w:.5+Math.random()*1.3,p:Math.random()*6.28,p2:Math.random()*6.28,
        tom:14+Math.random()*22,cinza:Math.random()})}
  }
  /* vizinho mais próximo e distância até a borda (F2-F1) */
  function voronoi(x,y){
    x+=(fbm(x*.045,y*.045)-.5)*16;y+=(fbm(x*.045+7.3,y*.045+2.1)-.5)*16;   /* bordas tortas, não azulejo */
    var ci=Math.floor(x/CEL)+1,cj=Math.floor(y/CEL)+1,d1=1e9,d2=1e9,m=0;
    for(var j=cj-1;j<=cj+1;j++){if(j<0||j>=rows)continue;
      for(var i=ci-1;i<=ci+1;i++){if(i<0||i>=cols)continue;var n=j*cols+i,dx=pts[n*2]-x,dy=pts[n*2+1]-y,d=dx*dx+dy*dy;
        if(d<d1){d2=d1;d1=d;m=n}else if(d<d2)d2=d}}
    return [m,Math.sqrt(d2)-Math.sqrt(d1),Math.sqrt(d1)]
  }

  function montar(){
    var r=bar.getBoundingClientRect(),hdr=cv.parentNode.getBoundingClientRect();
    W=Math.max(1,Math.round(hdr.width));H=Math.max(1,Math.round(r.height));
    cv.style.top=(r.top-hdr.top)+"px";cv.style.height=H+"px";
    dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    var lg=bar.querySelector(".logo-wrap");if(lg){var q=lg.getBoundingClientRect();logo={x:q.left-hdr.left+q.width/2,y:q.top-r.top+q.height/2,r:q.width*.85}}
    semear();
    /* carvão: textura fixa em resolução cheia (até 1.5x) */
    var bs=Math.min(dpr,1.5),bw=Math.round(W*bs),bh=Math.round(H*bs);
    base=document.createElement("canvas");base.width=bw;base.height=bh;var bc=base.getContext("2d"),im=bc.createImageData(bw,bh),D=im.data;
    for(var y=0;y<bh;y++)for(var x=0;x<bw;x++){
      var px=x/bs,py=y/bs,v=voronoi(px,py),c=cel[v[0]],o=(y*bw+x)*4,
        borda=Math.min(1,v[1]/5),                         /* 0 na fresta entre os pedaços */
        relevo=.55+.45*fbm(px*.09+v[0],py*.09),           /* face irregular do carvão */
        luz=.75+.35*(1-Math.min(1,v[2]/CEL)),             /* centro do pedaço um pouco mais alto */
        g=c.tom*relevo*luz*borda,
        cin=Math.max(0,fbm(px*.22,py*.22+v[0]*3)-.58)*2.4*(c.h<.4?1.4:.55)*c.cinza;  /* cinza sobre o carvão */
      D[o]=g*1.08+cin*92;D[o+1]=g*.92+cin*84;D[o+2]=g*.82+cin*78;D[o+3]=255}
    bc.putImageData(im,0,0);
    /* grade de calor (baixa resolução): pré-calcula tudo que não muda com o tempo */
    var cw=Math.ceil(W/ESC),ch=Math.ceil(H/ESC),N=cw*ch;
    calor=document.createElement("canvas");calor.width=cw;calor.height=ch;cImg=calor.getContext("2d").createImageData(cw,ch);
    for(var a=3;a<N*4;a+=4)cImg.data[a]=255;
    gx=new Float32Array(N);gy=new Float32Array(N);gc=new Uint16Array(N);ge=new Float32Array(N);gs=new Float32Array(N);gn=new Float32Array(N);
    for(var y2=0,n2=0;y2<ch;y2++)for(var x2=0;x2<cw;x2++,n2++){
      var X=(x2+.5)*ESC,Y=(y2+.5)*ESC,w=voronoi(X,Y),cc=cel[w[0]],
        fresta=Math.exp(-w[1]/3.2),
        face=Math.max(0,Math.min(1,(fbm(X*.07+w[0]*1.7,Y*.07)-.46)*3.2))*(1-Math.min(1,w[2]/(CEL*.9)))*(cc.h>.85?1.25:.8),
        dl=Math.hypot(X-logo.x,Y-logo.y)/logo.r,sombra=logo.r?Math.min(1,.35+.65*dl*dl):1;   /* menos brasa atrás da logo */
      gx[n2]=X;gy[n2]=Y;gc[n2]=w[0];ge[n2]=(fresta+face)*cc.h*(.72+.4*Y/H)*sombra;gn[n2]=fbm(X*.05,Y*.05)*20;gs[n2]=fresta}
    brilho=document.createElement("canvas");brilho.width=Math.max(1,Math.ceil(cw/5));brilho.height=Math.max(1,Math.ceil(ch/5));
    fag=[];desenhar(performance.now());
  }

  function quadro(now){
    var t=(now-t0)/1000,D=cImg.data,N=gx.length,resp=new Float32Array(cel.length);
    for(var i=0;i<cel.length;i++){var c=cel[i];resp[i]=.62+.38*Math.sin(t*c.w+c.p)*(.55+.45*Math.sin(t*.37+c.p2))}
    for(var n=0;n<N;n++){
      var x=gx[n],onda=.78+.22*Math.sin(x*.011-t*.9)*Math.sin(x*.0047+t*.41),
        tremor=.86+.14*Math.sin(t*2.3+gn[n]),
        h=ge[n]*resp[gc[n]]*onda*tremor;
      var k=h>=1?255:h<=0?0:(h*255)|0,o=n*4;D[o]=LUT[k*3];D[o+1]=LUT[k*3+1];D[o+2]=LUT[k*3+2]}
    calor.getContext("2d").putImageData(cImg,0,0);
  }

  function fagulhas(dt){
    if(!calma&&fag.length<Math.min(46,W/30)&&Math.random()<dt*W/260){
      fag.push({x:Math.random()*W,y:H-Math.random()*H*.4,vx:(Math.random()-.5)*14,vy:-(18+Math.random()*38),
        v:0,vida:1+Math.random()*1.8,r:.5+Math.random()*1.1,f:Math.random()*6.28})}
    for(var i=fag.length-1;i>=0;i--){var p=fag[i];p.v+=dt;
      if(p.v>=p.vida||p.y<-4){fag.splice(i,1);continue}
      p.x+=(p.vx+Math.sin(p.v*5+p.f)*10)*dt;p.y+=p.vy*dt;p.vy*=1-.15*dt}
  }

  function desenhar(now){
    var dt=Math.min(.1,(now-(ult||now))/1000);ult=now;
    quadro(now);fagulhas(dt);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(base,0,0,cv.width,cv.height);
    ctx.globalCompositeOperation="lighter";
    ctx.drawImage(calor,0,0,cv.width,cv.height);
    /* bloom: o calor reduzido e ampliado vira um halo difuso */
    var bc=brilho.getContext("2d");bc.clearRect(0,0,brilho.width,brilho.height);bc.drawImage(calor,0,0,brilho.width,brilho.height);
    ctx.globalAlpha=.55;ctx.drawImage(brilho,0,0,cv.width,cv.height);ctx.globalAlpha=1;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    for(var i=0;i<fag.length;i++){var p=fag[i],a=Math.sin(Math.PI*p.v/p.vida),q=1-p.v/p.vida;
      ctx.fillStyle="rgba(255,"+(120+100*q|0)+","+(30+60*q|0)+","+(a*.22).toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r*3.2,0,6.283);ctx.fill();
      ctx.fillStyle="rgba(255,"+(190+50*q|0)+","+(110+80*q|0)+","+a.toFixed(3)+")";ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill()}
    /* sombra nas bordas para fundir com a faixa de cima e o menu */
    ctx.globalCompositeOperation="source-over";
    var gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,"rgba(8,5,3,.8)");gr.addColorStop(.22,"rgba(8,5,3,.18)");
    gr.addColorStop(.8,"rgba(8,5,3,.1)");gr.addColorStop(1,"rgba(8,5,3,.6)");ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
  }

  function loop(now){raf=requestAnimationFrame(loop);if(now-ult<33)return;desenhar(now)}
  function iniciar(){cancelAnimationFrame(raf);montar();cv.classList.add("on");if(!calma)raf=requestAnimationFrame(loop)}

  var esp=0;
  if(window.ResizeObserver)new ResizeObserver(function(){clearTimeout(esp);esp=setTimeout(iniciar,120)}).observe(bar);
  else addEventListener("resize",function(){clearTimeout(esp);esp=setTimeout(iniciar,120)});
  /* a logo carrega depois: remonta quando ela tiver tamanho, para posicionar a sombra atrás dela */
  var img=bar.querySelector("[data-logo]");if(img&&!img.complete)img.addEventListener("load",function(){clearTimeout(esp);esp=setTimeout(iniciar,60)},{once:true});
  iniciar();
})();
