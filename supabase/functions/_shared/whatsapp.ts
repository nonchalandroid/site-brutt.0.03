export function normalizarWhatsapp(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (!/^[+\d\s().-]+$/.test(texto)) return "";
  let n = texto.replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return /^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(n) ? n : "";
}

export async function whatsappLoja(ler: (path: string) => Promise<any>, padrao: string): Promise<string> {
  const dados = await ler("site_cms_config?select=config&id=eq.homepage");
  const valor = dados?.[0]?.config?.contato?.whatsapp;
  if (valor == null || valor === "") return normalizarWhatsapp(padrao);
  const numero = normalizarWhatsapp(valor);
  if (!numero) throw new Error("WhatsApp da loja inválido no CMS.");
  return numero;
}
