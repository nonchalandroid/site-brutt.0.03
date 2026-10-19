// Teste da Brutt IA com Gemini e Supabase simulados. Rodar: node --experimental-strip-types supabase/functions/brutt-ia/brutt-ia.test.mts
import assert from "node:assert/strict";
const ENV:any={SUPABASE_URL:"https://sb.test",SUPABASE_SERVICE_ROLE_KEY:"k",GEMINI_API_KEY:"g"};
(globalThis as any).Deno={env:{get:(k:string)=>ENV[k]}};
const sessoes:any={}; let roteiro:any[]=[]; const prompts:string[]=[]; const ferramentasResp:any[]=[];
const R=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s});
(globalThis as any).fetch=async(url:string,init:any={})=>{
  const u=new URL(url), body=init.body?JSON.parse(init.body):null;
  if(u.host==="generativelanguage.googleapis.com"){
    prompts.push(body.systemInstruction.parts[0].text);
    const ult=body.contents[body.contents.length-1]; if(ult.parts?.[0]?.functionResponse) ferramentasResp.push(...ult.parts.map((p:any)=>p.functionResponse));
    const passo=roteiro.shift(); return R({candidates:[{content:{role:"model",parts:passo}}]});
  }
  if(u.pathname==="/functions/v1/geoapify-autocomplete") return R({resultados:geoMapa});
  if(u.host==="nominatim.openstreetmap.org") return R([]);
  if(u.host==="brasilapi.com.br") return R({});
  if(u.host==="router.project-osrm.org") return R({code:"Ok",routes:[{distance:rotaM}]});
  const p=u.pathname.replace("/rest/v1/","");
  if(p==="rpc/loja_info") return R({horarios:[0,1,2,3,4,5,6].map(d=>({d,aberto:true,a:0,b:1440}))});
  if(p==="rpc/proximo_numero_pedido") return R(55);
  if(p==="products") return R([{site_product_id:"p1",name:"Essência X",price:25,promo_price:null,stock:5,is_active:true}]);
  if(p==="ia_sessoes"&&init.method==="POST"){sessoes[body.session_id]=body.draft;return R({},201)}
  if(p==="ia_sessoes") {const sid=u.searchParams.get("session_id")!.slice(3);return R(sessoes[sid]?[{draft:sessoes[sid]}]:[])}
  if(p==="rpc/ia_cota") { cotaChamadas.push(body); return R({ok:cotaOk,total:1,ip:1}); }
  if(p==="rpc/ia_buscar_produtos") return R([]);
  if(p==="ia_conhecimento") return R(conhecimento);
  return R([],201);
};
let conhecimento:any[]=[{titulo:"Estacionamento",texto:"Tem vaga na rua em frente à loja."},{titulo:"",texto:"  "}];
let cotaOk=true; const cotaChamadas:any[]=[]; let geoMapa:any[]=[]; let rotaM=500;
const M=await import(new URL("./index.ts", import.meta.url).href);
const chama=async(msg:string,pag:boolean)=>{const r=await M.handler(new Request("https://x/brutt-ia",{method:"POST",body:JSON.stringify({message:msg,session:"sessao-teste-1",history:[],pagamento_online:pag})}));return r.json()};
// 1) cliente escolhe "eu mesmo" SEM ter informado endereço; 2) fecha
roteiro=[[{functionCall:{name:"atualizar_pedido",args:{itens:[{id:"p1",qtd:1}]}}}],[{text:"Anotado!"}]];
let j=await chama("quero 1 essência x",true);
assert.ok(prompts.at(-1)!.includes("Prefiro eu mesmo solicitar a entrega"),"prompt oferece as 2 opções");
assert.ok(prompts.at(-1)!.includes("Mercado Pago"),"prompt fala do pagamento online");
assert.ok(prompts.at(-1)!.includes("O QUE A EQUIPE ENSINOU")&&prompts.at(-1)!.includes("• Estacionamento: Tem vaga na rua em frente à loja."),"conhecimento do painel entra no prompt");
assert.equal(M.conhecimentoTexto([{titulo:"a",texto:"x".repeat(5000)},{titulo:"b",texto:"y".repeat(800)},{titulo:"c",texto:"z".repeat(800)}]).length<=M.CONHECIMENTO_MAX,true,"limite total");
assert.ok(j.sugestoes.some((s:any)=>/Uber\/99/.test(s.t)),"atalho 'Eu mesmo peço Uber/99': "+JSON.stringify(j.sugestoes));
roteiro=[[{functionCall:{name:"escolher_uber_99",args:{app:"ambos"}}}],[{text:"Fechou, frete da loja R$ 0,00."}]];
j=await chama("Prefiro eu mesmo solicitar a entrega pelo Uber ou 99",true);
const r1=ferramentasResp.at(-1).response.output; assert.equal(r1.ok,true,"escolher_uber_99 sem endereço: "+JSON.stringify(r1)); assert.equal(r1.frete_da_loja,0);
roteiro=[[{functionCall:{name:"finalizar_pedido",args:{nome:"Ana"}}}],[{text:"Toque em Ir para o pagamento."}]];
j=await chama("pode fechar, meu nome é Ana",true);
const r2=ferramentasResp.at(-1).response.output; assert.equal(r2.ok,true,JSON.stringify(r2)); assert.match(r2.instrucao,/Pagar com Pix/);
assert.deepEqual(j.checkout,{nome:"Ana",reserva:false,itens:[{id:"p1",q:1}],entrega:{tipo:"cliente"}});
assert.match(decodeURIComponent(j.whatsapp_url),/frete da loja R\$ 0,00/);
// sem pagamento online: prompt antigo de Pix e botão verde
roteiro=[[{text:"oi"}]]; await chama("oi",false);
assert.ok(prompts.at(-1)!.includes("só por Pix")&&prompts.at(-1)!.includes("botão verde"));
console.log("IA: 'eu mesmo peço' sem endereço, fechamento com checkout e prompts conforme o modo — OK");

// cota diária no banco: passou do limite, não chama o Gemini e oferece a equipe; IP nunca vai em claro
{ const antes=prompts.length; cotaOk=false;
  const r=await M.handler(new Request("https://x/brutt-ia",{method:"POST",headers:{"x-forwarded-for":"200.1.2.3"},body:JSON.stringify({message:"oi",session:"sessao-cota-1",history:[]})}));
  const j=await r.json();
  if(r.status!==429||!/descansou/.test(j.error)||!j.humano_url) throw new Error("cota: devia barrar com 429 e link da equipe "+JSON.stringify(j));
  if(prompts.length!==antes) throw new Error("cota: não podia chamar o Gemini");
  const c=cotaChamadas[cotaChamadas.length-1]; if(!c||/200\.1\.2\.3/.test(JSON.stringify(c))||c.p_lim_total!==M.COTA.total) throw new Error("cota: chave deve ser hash do IP "+JSON.stringify(c));
  cotaOk=true; console.log("IA: cota diária barra sem chamar o Gemini e não guarda o IP — OK"); }

// Conjunto Campinho: rua numerada sem a casa no mapa (ou homônima longe) = taxa mínima; casa achada com número = km rodado
{ const ent=async(args:any)=>{ roteiro=[[{functionCall:{name:"definir_entrega",args}}],[{text:"ok"}]]; const n=ferramentasResp.length; await chama("entrega",false); return ferramentasResp.slice(n).find((f:any)=>f.name==="definir_entrega")?.response?.output; };
  geoMapa=[]; let r=await ent({rua:"Rua 5",numero:"120",bairro:"Conjunto Campinho"});
  assert.equal(r.ok,true); assert.equal(r.taxa_entrega,5); assert.equal(r.conjunto,true);
  r=await ent({rua:"Rua 5",numero:"120",bairro:"conjunto"}); assert.equal(r.taxa_entrega,5,"'o conjunto' também");
  geoMapa=[{rua:"Rua 5",numero:"120",bairro:"Santa Cruz",cidade:"Rio de Janeiro",uf:"RJ",cep:"",lat:-22.92,lng:-43.69}]; rotaM=12000;
  r=await ent({rua:"Rua 5",numero:"120",bairro:"Conjunto Campinho"}); assert.equal(r.ok,true); assert.equal(r.taxa_entrega,5,"homônima longe não vale");
  geoMapa=[{rua:"Rua 5",numero:"120",bairro:"Campo Grande",cidade:"Rio de Janeiro",uf:"RJ",cep:"23060000",lat:-22.8890,lng:-43.6300}]; rotaM=3400;
  r=await ent({rua:"Rua 5",numero:"120",bairro:"Conjunto Campinho"}); assert.equal(r.ok,true); assert.equal(r.km,3.4); assert.equal(r.taxa_entrega,8,"casa achada a 3,4 km: 5 + 2×2 = 9 → teto 8");
  geoMapa=[{rua:"Rua 5",numero:"120",bairro:"Santa Cruz",cidade:"Rio de Janeiro",uf:"RJ",cep:"",lat:-22.92,lng:-43.69}]; rotaM=12000;
  r=await ent({rua:"Rua 5",numero:"120",bairro:"Santa Cruz"}); assert.equal(r.ok,true); assert.equal(r.taxa_entrega,8,"fora do conjunto: sem limite de raio, paga a regra normal (teto R$ 8)");
  assert.ok(prompts.at(-1)!.includes("CONJUNTO CAMPINHO"));
  assert.ok(prompts.at(-1)!.includes("ONDE FICA A LOJA") && prompts.at(-1)!.includes("Rua Dezoito, 145 — Conjunto Campinho, Campo Grande"), "a loja é do Conjunto Campinho, em Campo Grande");
  geoMapa=[]; rotaM=500; console.log("IA: Conjunto Campinho = taxa mínima; casa achada longe soma por km; homônima não engana — OK"); }
