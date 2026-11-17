import assert from "node:assert/strict";
import { normalizarWhatsapp, whatsappLoja } from "./whatsapp.ts";
for (const valor of ["(21) 98888-7777", "+55 (21) 98888-7777", "5521988887777"]) {
  assert.equal(normalizarWhatsapp(valor), "5521988887777");
}
for (const valor of ["", "123", "javascript:5521988887777", "https://wa.me/5521988887777", "+1 2125551234"]) {
  assert.equal(normalizarWhatsapp(valor), "");
}
assert.equal(await whatsappLoja(async () => [], "5521996600243"), "5521996600243");
let numero = "5521988887777";
const ler = async () => [{config: {contato: {whatsapp: numero}}}];
assert.equal(await whatsappLoja(ler, "5521996600243"), numero);
numero = "5511977776666";
assert.equal(await whatsappLoja(ler, "5521996600243"), numero);
numero = "inválido";
await assert.rejects(whatsappLoja(ler, "5521996600243"));
await assert.rejects(whatsappLoja(async () => { throw new Error("offline"); }, "5521996600243"));
console.log("WhatsApp servidor: normalização, prioridade do CMS, troca e falhas OK.");
