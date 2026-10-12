// Web Push sem bibliotecas (padrão dos navegadores): RFC 8030 (envio), RFC 8291 (conteúdo criptografado
// "aes128gcm") e RFC 8292 (VAPID: o servidor se identifica com um par de chaves P-256 e um JWT ES256).
// Usa só WebCrypto, então roda igual no Deno (Supabase) e no Node (testes).

const enc = new TextEncoder();
export const b64u = (b: Uint8Array) => {
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const deB64u = (s: string) => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const junta = (...partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}

/** Novo par VAPID: { publica (base64url, 65 bytes, vai para o navegador), privadaJwk (fica no servidor) } */
export async function gerarChavesVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const privadaJwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  return { publica: b64u(publica), privadaJwk };
}

/** Cabeçalho Authorization do VAPID para o serviço de push do endpoint (Google, Apple, Mozilla…) */
export async function cabecalhoVapid(endpoint: string, publica: string, privadaJwk: JsonWebKey, contato: string) {
  const aud = new URL(endpoint).origin, exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(enc.encode(JSON.stringify({ aud, exp, sub: contato })));
  const chave = await crypto.subtle.importKey("jwk", { ...privadaJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ass = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, enc.encode(`${h}.${c}`)));   // r||s (64 bytes) = formato JWS
  return `vapid t=${h}.${c}.${b64u(ass)}, k=${publica}`;
}

/** Criptografa o conteúdo para UM aparelho (chaves p256dh/auth que o navegador entregou na inscrição) */
export async function criptografar(conteudo: Uint8Array, p256dh: string, auth: string) {
  const uaPub = deB64u(p256dh), segredo = deB64u(auth);
  const meu = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const meuPub = new Uint8Array(await crypto.subtle.exportKey("raw", meu.publicKey));
  const uaChave = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaChave }, meu.privateKey, 256));
  const ikm = await hkdf(segredo, ecdh, junta(enc.encode("WebPush: info\0"), uaPub, meuPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, junta(conteudo, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   // tamanho de registro 4096
  return junta(salt, rs, new Uint8Array([meuPub.length]), meuPub, cifrado);
}

/** Envia um aviso. Devolve o status HTTP do serviço de push (201 = entregue; 404/410 = inscrição morreu). */
export async function enviarPush(ass: { endpoint: string; p256dh: string; auth: string }, dados: unknown, vapid: { publica: string; privadaJwk: JsonWebKey }, contato: string) {
  const corpo = await criptografar(enc.encode(JSON.stringify(dados)), ass.p256dh, ass.auth);
  const c = new AbortController(), t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(ass.endpoint, { method: "POST", signal: c.signal, body: corpo, headers: {
      TTL: "86400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      Authorization: await cabecalhoVapid(ass.endpoint, vapid.publica, vapid.privadaJwk, contato) } });
    return r.status;
  } finally { clearTimeout(t); }
}
