(function(){
"use strict";
var PADRAO="5521996600243",atual=PADRAO,pendente=null,S=window.__SUPA||{url:"https://vedlxtljilsanykmddtj.supabase.co",key:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZGx4dGxqaWxzYW55a21kZHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NjYzNzUsImV4cCI6MjEwNjE0MjM3NX0.JlUPvGdomBHLlu5ei5dEb1qFR4FZ2nC45JTZUJ-IN6g"};
function normalizar(valor){
 var texto=String(valor==null?"":valor).trim();
 if(!/^[+\d\s().-]+$/.test(texto))return "";
 var n=texto.replace(/\D/g,"");if(n.length===10||n.length===11)n="55"+n;
 return /^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(n)?n:"";
}
function url(link){
 try{var u=new URL(link,location.href);if(u.protocol==="https:"&&u.hostname==="wa.me"&&/^\/\d+\/?$/.test(u.pathname)){u.pathname="/"+atual;return u.href}}catch(_){}
 return link;
}
function atualizarLinks(){
 document.querySelectorAll('a[href*="wa.me/"]').forEach(function(a){a.href=url(a.href)});
 document.querySelectorAll("[data-whatsapp-loja]").forEach(function(el){el.textContent="+"+atual});
}
function aplicar(config){
 var n=normalizar(config&&config.contato&&config.contato.whatsapp);
 if(n){atual=n;try{localStorage.setItem("brutt_whatsapp_loja",n)}catch(_){}}
 atualizarLinks();document.dispatchEvent(new CustomEvent("brutt:contato",{detail:{whatsapp:atual}}));
}
function carregar(){
 if(pendente)return pendente;
 pendente=fetch(S.url+"/rest/v1/site_cms_config?select=config&id=eq.homepage",{headers:{apikey:S.key,Authorization:"Bearer "+S.key},cache:"no-store",signal:AbortSignal.timeout(5000)})
 .then(function(r){if(!r.ok)throw new Error("Contato indisponível");return r.json()})
 .then(function(j){aplicar(j[0]&&j[0].config);return atual})
 .finally(function(){pendente=null});
 return pendente;
}
window.BruttContato={normalizar:normalizar,aplicar:aplicar,carregar:carregar,numero:function(){return atual},url:url};
if(/^\/admin(?:\/|$)/.test(location.pathname))return;
try{atual=normalizar(localStorage.getItem("brutt_whatsapp_loja"))||PADRAO}catch(_){}
aplicar(null);
if(window.__catalogo)window.__catalogo.then(function(d){aplicar(d[3]&&d[3][0]&&d[3][0].config)}).catch(function(){});
else carregar().catch(function(){});
document.addEventListener("visibilitychange",function(){if(!document.hidden)carregar().catch(function(){})});
document.addEventListener("click",function(e){
 var a=e.target.closest&&e.target.closest('a[href*="wa.me/"]');
 if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 var u;try{u=new URL(a.href)}catch(_){return}
 if(u.hostname!=="wa.me")return;
 e.preventDefault();
 var aba=a.target==="_blank"?window.open("about:blank","_blank"):null;
 if(aba)aba.opener=null;
 carregar().catch(function(){}).then(function(){
  a.href=url(a.href);if(aba)aba.location.replace(a.href);else location.assign(a.href);
 });
},true);
})();

