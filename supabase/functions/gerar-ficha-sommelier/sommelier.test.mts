// Testes da função do Sommelier (sem chamar o Gemini). Rodar: node --experimental-strip-types supabase/functions/gerar-ficha-sommelier/sommelier.test.mts
import { limpa, categoriasDe, montaPrompt, tipoDe, semAvisoIdade } from "./index.ts";
const ok=(n:string,c:boolean)=>{console.log((c?"✓ ":"✗ ")+n); if(!c) process.exitCode=1};
const cats=categoriasDe({categorias:[{slug:"headshop-cases",nome:"Headshop > Cases"},{slug:"x y",nome:"ruim"},{slug:"doces-balas",nome:"Doces > Balas"}]});
ok("categoriasDe filtra slugs inválidos", cats.length===2);
ok("categoria válida passa", limpa({categoria_slug:"headshop-cases"},"geral",cats).categoria_sugerida==="headshop-cases");
ok("categoria inventada é descartada", limpa({categoria_slug:"inventada"},"geral",cats).categoria_sugerida===null);
ok("sem lista: nunca sugere", limpa({categoria_slug:"headshop-cases"},"geral",[]).categoria_sugerida===null);
const p=montaPrompt({name:"Case X",categorias:[{slug:"headshop-cases",nome:"Headshop > Cases"}],categoria_slug_atual:"headshop-outros"},"headshop");
ok("prompt lista as categorias e a atual", p.includes("headshop-cases = Headshop > Cases")&&p.includes("Categoria atual: headshop-outros"));
ok("prompt sem lista não fala de categorias", !montaPrompt({name:"X"},"geral").includes("CATEGORIAS DA LOJA"));
ok("tipoDe e aviso de idade seguem iguais", tipoDe("Essências","Ziggy","Uva")==="essencia" && !/18/.test(semAvisoIdade("Uva doce. Venda proibida para menores de 18 anos.")));
ok("descrição longa é compactada", limpa({description:"a ".repeat(200)},"geral").description.length<=170);
