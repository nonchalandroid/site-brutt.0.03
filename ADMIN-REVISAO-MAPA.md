# Mapa de revisão do painel Brutt

**Status:** somente diagnóstico. Nenhum código funcional foi alterado nesta etapa.

## 1. Regra de segurança

O painel já tem muita lógica manual, integração com Nex, pedidos, notificações, checkout e rotinas de lote. A reorganização deve:

- preservar todas as rotas existentes;
- não alterar estoque, preço ou sincronização do Nex;
- não alterar checkout, PIX, webhook, pedidos ou acompanhamento;
- não apagar o CMS do site que já aparece na versão publicada;
- separar mudanças visuais de mudanças no banco;
- criar uma branch própria e validar cada fase antes de qualquer merge.

## 2. Divergência que precisa ser preservada

A versão publicada em `https://tabacariabrutt.com.br/admin/` possui o menu **CMS do site**, mas esse item não aparece no branch local analisado. Portanto, antes da implementação será necessário comparar o código publicado com o repositório e trazer o CMS para a base de trabalho sem sobrescrever a versão online.

Até essa reconciliação, nenhum arquivo funcional deve ser reescrito.

## 3. Menu: manter, agrupar e tirar do primeiro nível

### Manter sempre visível na operação diária

| Item | Ação | Motivo |
|---|---|---|
| Visão geral | Manter | Ponto de partida do operador. Deve mostrar somente o que exige atenção agora. |
| Pedidos online | Manter | Rotina crítica e frequente. |
| Produtos | Manter | Cadastro, busca, código de barras e edição. |
| Clientes | Manter | Consulta operacional e histórico de compradores. |
| Estoque e compras | Manter como entrada | Reúne estoque, reposição e apoio à compra. |

### Agrupar sem apagar rotas

| Grupo sugerido | Conteúdo |
|---|---|
| **Estoque e compras** | Estoque; Estoque baixo; Giro e reposição; Mais vendidos; Planilha de compra |
| **Catálogo e conteúdo** | CMS do site; Vitrine e destaques; Conferência de produtos; Fotos em lote; Sommelier em massa |
| **Configurações da loja** | Horários; Integrações Nex; Equipe; notificações |
| **Gestão** | Financeiro; relatórios administrativos |

### Itens que não precisam competir no primeiro nível

- **Estoque baixo:** manter como filtro/atalho dentro de Estoque, com badge de quantidade.
- **Mais vendidos:** usar como relatório dentro de Estoque e compras; continuar acessível por rota.
- **Planilha de compra:** manter dentro do mesmo grupo, pois depende do fluxo de reposição.
- **Fotos em lote** e **Sommelier em massa:** manter acessíveis, mas tratar como ferramentas ocasionais.
- **Integrações Nex:** manter em Configurações; não deve parecer uma tarefa diária.
- **Financeiro:** manter no menu, mas fora da Visão geral principal.

## 4. Visão geral: o que deve aparecer

### Prioridade alta

1. Pedidos pagos esperando conclusão.
2. Novos pedidos ainda não vistos.
3. Falha ou atraso da sincronização com o Nex.
4. Produtos ativos sem estoque.
5. Produtos que precisam de reposição em breve.

### Informação operacional secundária

- Loja aberta/fechada e horário de fechamento.
- Atalho para Pedidos.
- Atalho para Estoque.
- Atalho para cadastrar/buscar produto.

### Remover da página principal

- Cartão detalhado de **Lucro líquido**.
- Ponto de equilíbrio.
- Custos pagos.
- Qualquer gráfico financeiro grande.

A Visão geral pode ter no máximo um pequeno link discreto para **Abrir Financeiro**, sem carregar os cálculos financeiros como parte da rotina operacional.

## 5. Financeiro: tela própria

A tela Financeiro já possui dados de `vendas_dia`, histórico e cálculo de margem. A proposta não é substituir essa lógica agora.

### Melhorias futuras de leitura

- Separar claramente **vendas**, **custos**, **lucro bruto** e **lucro líquido**.
- Mostrar período selecionado no título de cada gráfico.
- Diferenciar dado real do Nex de projeção digitada.
- Usar gráfico de faturamento acumulado e gráfico de lucro/P&L com legendas simples.
- Manter o simulador em uma seção recolhível, pois é uma ferramenta de análise e não uma informação diária.
- Deixar “Custos” como edição secundária, com confirmação visual de salvamento.

### Observação

Os números extraídos pelo navegador aparecem com dígitos separados em alguns textos acessíveis, mas a renderização visual mostra o valor formatado. Isso deve ser tratado como possível questão de leitura/acessibilidade, não como erro financeiro, até uma validação específica.

## 6. CMS do site: objetivo real

O CMS deve permitir mudar o conteúdo público sem editar HTML, mas sem misturar conteúdo com estoque do Nex.

### Já existe e pode ser reaproveitado

- Destaque de produto (`is_featured`).
- Prioridade de produto (`sort_priority`).
- Nome, preço e estoque vindos do cadastro/Nex.
- Categorias e subseções já usadas pelo catálogo.

### O CMS deve controlar

- Textos do topo e chamadas principais.
- Banners e destaques.
- Ordem das seções do site.
- Visibilidade de seções.
- Produtos destacados.
- Textos de apoio, avisos e informações de entrega.
- Links de WhatsApp, Instagram, mapa e horários exibidos no site.

### O CMS não deve controlar

- Estoque do Nex.
- Baixa de estoque.
- Preço que pertence ao Nex.
- Confirmação de PIX.
- Status de pedido.
- Regras de webhook.

### Arquitetura recomendada para a próxima fase

Criar uma camada de configurações do site no Supabase, com permissões de equipe e histórico de alteração. A primeira versão deve trabalhar com rascunho e publicação simples:

1. editar;
2. visualizar prévia;
3. publicar;
4. registrar quem publicou e quando.

Não é necessário criar um construtor visual complexo logo no início. Primeiro devem ser controlados os campos que já existem no site.

## 7. Botões e hierarquia visual

### Botão principal

Usar dourado apenas para a ação principal da tela, por exemplo:

- Salvar;
- Publicar;
- Confirmar sincronização;
- Concluir pedido.

### Botões secundários

Usar estilo discreto para:

- Atualizar;
- Abrir detalhes;
- Ver histórico;
- Simular;
- Cancelar.

### Evitar

- Dois botões com a mesma ação em uma tela.
- “Atualizar” repetido em cada card.
- Botões de ferramenta rara no mesmo peso de “Pedidos online”.
- Ações destrutivas com a mesma cor do botão Salvar.

## 8. Fases de implementação depois da revisão

### Fase 0 — Reconciliação

Comparar o CMS publicado com o branch do GitHub e criar uma base única, sem remover funcionalidades.

### Fase 1 — Navegação

Reagrupar menus, manter rotas, preservar badges e tirar duplicidades visuais.

### Fase 2 — Visão geral

Remover o financeiro da página principal e reorganizar a tela pela ordem de urgência operacional.

### Fase 3 — CMS do site

Mapear campos públicos, adicionar edição segura, prévia e publicação sem tocar em estoque ou pedidos.

### Fase 4 — Financeiro

Melhorar gráficos, filtros, rótulos e separação entre dado real e projeção.

### Fase 5 — Validação

Testar login, permissões, pedidos, Nex, notificações, CMS, edição de produtos e Financeiro antes de abrir PR.

## 9. Decisões que ainda não serão tomadas automaticamente

- Remover definitivamente qualquer rota.
- Alterar tabelas de pedidos ou produtos.
- Mudar o funcionamento do Nex.
- Trocar a lógica do checkout/PIX.
- Publicar direto na `main`.
- Substituir o CMS publicado sem comparação de código.
