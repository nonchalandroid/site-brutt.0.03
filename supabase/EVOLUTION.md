# WhatsApp automático (Evolution API) — instalação passo a passo

O checkout já está pronto para mandar no WhatsApp:
- **cliente:** "✅ Pagamento confirmado" (+ boas-vindas na 1ª compra, "📦 Pedido concluído", "⌛ Pix expirado");
- **loja:** "🔔 NOVO PEDIDO PAGO" com itens, total e entrega.

Falta só o "carteiro": a **Evolution API** rodando num servidor seu, com o WhatsApp da loja conectado por QR Code.
Enquanto ela não existe, o log da função `checkout` mostra `Evolution API não configurada` e nenhuma mensagem sai
(o pagamento e o pedido funcionam normalmente; os pedidos aparecem no admin em **Pedidos online**).

Conferido no código oficial da Evolution API **v2.3.7** (repositório `EvolutionAPI/evolution-api`):
imagem `evoapicloud/evolution-api`, painel em `/manager`, envio em `POST /message/sendText/{instância}` com `{ "number", "text" }`
e cabeçalho `apikey` — exatamente o que `supabase/functions/checkout/index.ts` usa.

> ⚠️ A Evolution usa o WhatsApp Web (não é a API oficial da Meta). Use um **número só da loja** para o robô:
> mensagens automáticas em excesso podem levar o WhatsApp a bloquear o número. O site só manda mensagens de pedido
> (poucas por cliente), o que é o uso mais seguro.

---

## 1. O que você precisa

| Item | Para quê |
|---|---|
| **Um chip/número de WhatsApp da loja** (pode ser WhatsApp Business) | É o número que **envia** as mensagens (fica conectado na Evolution) |
| **Outro número** (ex.: o seu pessoal) | Recebe o aviso "NOVO PEDIDO PAGO". Tem que ser **diferente** do de cima |
| **Um servidor VPS** com Ubuntu 22.04 ou 24.04, **2 GB de RAM** ou mais | Onde a Evolution fica ligada 24 h (Hostinger, Contabo, DigitalOcean, Hetzner…) |
| **Acesso ao DNS** de `tabacariabrutt.com.br` (onde o domínio foi registrado/está apontado) | Para criar `evo.tabacariabrutt.com.br` com HTTPS |

## 2. Apontar o subdomínio

No painel do DNS do domínio, crie um registro:

| Tipo | Nome | Valor |
|---|---|---|
| `A` | `evo` | o **IP** do seu VPS |

(Se usar Cloudflare, deixe a nuvem **cinza** — "DNS only" — para o certificado HTTPS funcionar.)

## 3. Instalar no VPS

Entre no VPS pelo terminal (o provedor mostra o comando `ssh root@IP` e a senha) e rode:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/evolution && cd /opt/evolution
openssl rand -hex 24   # copie o resultado: será a sua CHAVE da Evolution
openssl rand -hex 16   # copie o resultado: será a SENHA do banco
```

Crie os 3 arquivos abaixo dentro de `/opt/evolution` (ex.: `nano docker-compose.yml`, colar, `Ctrl+O`, `Enter`, `Ctrl+X`).
Troque `COLE_A_CHAVE` e `COLE_A_SENHA` pelos valores gerados acima (a mesma senha nos dois lugares em que aparece).

### `docker-compose.yml`

```yaml
services:
  api:
    image: evoapicloud/evolution-api:v2.3.7
    restart: always
    env_file: .env
    depends_on: [postgres, redis]
    volumes:
      - evolution_instances:/evolution/instances
    expose: ["8080"]

  postgres:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: COLE_A_SENHA
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  caddy:            # HTTPS automático (Let's Encrypt) na frente da Evolution
    image: caddy:2
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [api]

volumes:
  evolution_instances:
  postgres_data:
  redis_data:
  caddy_data:
```

### `.env`

```ini
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://evo.tabacariabrutt.com.br
AUTHENTICATION_API_KEY=COLE_A_CHAVE
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:COLE_A_SENHA@postgres:5432/evolution?schema=evolution_api
DATABASE_CONNECTION_CLIENT_NAME=brutt
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_LOCAL_ENABLED=false
DEL_INSTANCE=false
LANGUAGE=pt-BR
```

### `Caddyfile`

```
evo.tabacariabrutt.com.br {
  reverse_proxy api:8080
}
```

Ligue tudo:

```bash
cd /opt/evolution && docker compose up -d
docker compose logs -f api     # espere aparecer que o servidor subiu; Ctrl+C para sair
```

## 4. Conectar o WhatsApp da loja

1. Abra **https://evo.tabacariabrutt.com.br/manager** no computador.
2. Entre com a URL `https://evo.tabacariabrutt.com.br` e a **CHAVE** (`AUTHENTICATION_API_KEY`).
3. **Create instance** → nome: `brutt` → canal **Baileys** → salvar.
4. Abra a instância → **Get QR Code** → no celular da loja: WhatsApp → Aparelhos conectados → Conectar aparelho → ler o QR.
5. O status deve ficar **open/connected**.

## 5. Cadastrar os segredos no Supabase

Supabase → projeto `tabacaria-brutt` → **Edge Functions → Secrets** → adicionar:

| Nome | Valor |
|---|---|
| `EVOLUTION_API_URL` | `https://evo.tabacariabrutt.com.br` |
| `EVOLUTION_API_KEY` | a **CHAVE** gerada no passo 3 |
| `EVOLUTION_INSTANCE` | `brutt` |
| `WHATS_LOJA_AVISOS` | número que recebe os avisos, com DDD (ex.: `21999998888`), **diferente** do conectado |

Não precisa publicar nada de novo: a função `checkout` lê os segredos na hora.

## 6. Testar

Faça um Pix de teste em `https://tabacariabrutt.com.br/?mpteste=1`. Em até alguns segundos depois do pagamento:
- o WhatsApp do cliente recebe "✅ Pagamento confirmado";
- o número de `WHATS_LOJA_AVISOS` recebe "🔔 NOVO PEDIDO PAGO".

Se não chegar: Supabase → Edge Functions → `checkout` → **Logs**, procure `whats` (o erro da Evolution aparece ali,
ex.: `Evolution 401` = chave errada; `Evolution 404` = nome da instância errado; `Evolution não configurada` = falta segredo).

## Manutenção

- Atualizar a Evolution: troque a tag `v2.3.7` no `docker-compose.yml` e rode `docker compose pull && docker compose up -d`.
- Se o celular da loja desconectar (trocou de aparelho, ficou muito tempo sem internet), repita o passo 4 (QR Code).
- Nunca coloque a CHAVE da Evolution no site/HTML: ela só existe no VPS e nos Secrets do Supabase.
