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
  const p=u.pathname.replace("/rest/v1/","");
  if(p==="rpc/loja_info") return R({horarios:[0,1,2,3,4,5,6].map(d=>({d,aberto:true,a:0,b:1440}))});
  if(p==="rpc/proximo_numero_pedido") return R(55);
  if(p==="products") return R([{site_product_id:"p1",name:"Essência X",price:25,promo_price:null,stock:5,is_active:true}]);
  if(p==="ia_sessoes"&&init.method==="POST"){sessoes[body.session_id]=body.draft;return R({},201)}
  if(p==="ia_sessoes") {const sid=u.searchParams.get("session_id")!.slice(3);return R(sessoes[sid]?[{draft:sessoes[sid]}]:[])}
  if(p==="rpc/ia_buscar_produtos") return R([]);
  return R([],201);
};
const M=await import(new URL("./index.ts", import.meta.url).href);
const chama=async(msg:string,pag:boolean)=>{const r=await M.handler(new Request("https://x/brutt-ia",{method:"POST",body:JSON.stringify({message:msg,session:"sessao-teste-1",history:[],pagamento_online:pag})}));return r.json()};
// 1) cliente escolhe "eu mesmo" SEM ter informado endereço; 2) fecha
roteiro=[[{functionCall:{name:"atualizar_pedido",args:{itens:[{id:"p1",qtd:1}]}}}],[{text:"Anotado!"}]];
let j=await chama("quero 1 essência x",true);
assert.ok(prompts.at(-1)!.includes("Prefiro eu mesmo solicitar a entrega"),"prompt oferece as 2 opções");
assert.ok(prompts.at(-1)!.includes("Mercado Pago"),"prompt fala do pagamento online");
assert.ok(j.sugestoes.some((s:any)=>/Uber\/99/.test(s.t)),"atalho 'Eu mesmo peço Uber/99': "+JSON.stringify(j.sugestoes));
roteiro=[[{functionCall:{name:"escolher_uber_99",args:{app:"ambos"}}}],[{text:"Fechou, frete da loja R$ 0,00."}]];
j=await chama("Prefiro eu mesmo solicitar a entrega pelo Uber ou 99",true);
const r1=ferramentasResp.at(-1).response.output; assert.equal(r1.ok,true,"escolher_uber_99 sem endereço: "+JSON.stringify(r1)); assert.equal(r1.frete_da_loja,0);
roteiro=[[{functionCall:{name:"finalizar_pedido",args:{nome:"Ana"}}}],[{text:"Toque em Ir para o pagamento."}]];
j=await chama("pode fechar, meu nome é Ana",true);
const r2=ferramentasResp.at(-1).response.output; assert.equal(r2.ok,true,JSON.stringify(r2)); assert.match(r2.instrucao,/Ir para o pagamento/);
assert.deepEqual(j.checkout,{nome:"Ana",reserva:false,itens:[{id:"p1",q:1}],entrega:{tipo:"cliente"}});
assert.match(decodeURIComponent(j.whatsapp_url),/frete da loja R\$ 0,00/);
// sem pagamento online: prompt antigo de Pix e botão verde
roteiro=[[{text:"oi"}]]; await chama("oi",false);
assert.ok(prompts.at(-1)!.includes("só por Pix")&&prompts.at(-1)!.includes("botão verde"));
console.log("IA: 'eu mesmo peço' sem endereço, fechamento com checkout e prompts conforme o modo — OK");
