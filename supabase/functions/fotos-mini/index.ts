// Miniaturas da loja (13/10/2026): para cada foto de produto sem mini_url, gera WebP de 400 px (cache de 1 ano) em
// product-images/mini/<product_id>.webp e grava product_images.mini_url. Processa um lote pequeno por chamada (?n= até 8, padrão 5; ?p= 1º dígito do id)
// e diz quantas faltam. Só roda com o cabeçalho x-sync-secret igual a sync_config.sync_secret (o mesmo do sync-nex),
// chamado pelo banco (pg_net); o painel faz o mesmo no navegador (gravaMini / "Preparar fotos da loja").
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.30";

const wasm = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")));
await initializeImageMagick(wasm);

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const { data: cfg } = await sb.from("sync_config").select("value").eq("key", "sync_secret").maybeSingle();
  const seg = req.headers.get("x-sync-secret");
  if (!cfg?.value || seg !== cfg.value) return new Response("nao autorizado", { status: 401 });
  // lote pequeno (o limite de CPU por chamada é curto); ?p=0..f separa as fotos pelo 1º dígito do id para rodar em paralelo
  const q = new URL(req.url).searchParams, n = Math.min(8, Math.max(1, Number(q.get("n")) || 5)), p = (q.get("p") || "").toLowerCase();
  let sel = sb.from("product_images").select("product_id,url").is("mini_url", null).like("url", "https://%");
  if (/^[0-9a-f]$/.test(p)) { const prox = p === "f" ? null : (parseInt(p, 16) + 1).toString(16); sel = sel.gte("product_id", p + "0000000-0000-0000-0000-000000000000"); if (prox) sel = sel.lt("product_id", prox + "0000000-0000-0000-0000-000000000000"); }
  const { data: fila, error } = await sel.limit(n);
  if (error) return Response.json({ erro: "leitura" }, { status: 500 });
  let ok = 0; const falhas: string[] = [];
  for (const r of fila ?? []) {
    try {
      const resp = await fetch(r.url);
      if (!resp.ok) throw new Error("http " + resp.status);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      let out: Uint8Array | null = null;
      ImageMagick.read(bytes, (img) => {
        if (Math.max(img.width, img.height) > 400) img.resize(400, 400);   // cabe em 400×400, mantém a proporção
        img.strip(); img.quality = 78;
        img.write(MagickFormat.WebP, (d) => { out = d.slice(); });
      });
      if (!out) throw new Error("sem saida");
      const path = `mini/${r.product_id}.webp`;
      const up = await sb.storage.from("product-images").upload(path, out, { upsert: true, contentType: "image/webp", cacheControl: "31536000" });
      if (up.error) throw up.error;
      const url = sb.storage.from("product-images").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      const u = await sb.from("product_images").update({ mini_url: url }).eq("product_id", r.product_id);
      if (u.error) throw u.error;
      ok++;
    } catch (e) { falhas.push(r.product_id); console.error("mini", r.product_id, String(e)); }
  }
  const { count } = await sb.from("product_images").select("product_id", { count: "exact", head: true }).is("mini_url", null).like("url", "https://%");
  return Response.json({ feitos: ok, falhas: falhas.length, restam: count ?? null });
});
