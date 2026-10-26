# Safezone — site, painel e editor de artes

Site estático (HTML/CSS/JS puro, sem build) + backend em Google Apps Script + Google Sheets/Drive.

## Estrutura
- `index.html, catalogo.html, produto.html, servicos.html` — loja pública
- `admin/` — painel (login, Vendas, Adm, Produtos, Configurações)
- `editor/` — editor de artes promocionais (gerado de `editor-src/` com `node editor-src/build.mjs`)
- `apps-script/Code.gs` — backend (cole no projeto Apps Script)
- `assets/js/config.js` — URLs públicas (sem segredos)
- `functions/api.js` — proxy para Cloudflare Pages (não usado no GitHub Pages)
- `tests/` — testes com mock do Apps Script (`node --test tests/appscript.test.mjs`)

## Publicar no GitHub Pages
1. Crie o repositório e envie todos os arquivos (a pasta `tests/` e `editor-src/` são opcionais).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. O site abre em `https://USUARIO.github.io/REPO/` (links já são relativos).

## Apps Script
1. Cole `apps-script/Code.gs`, rode `setup()` (cria abas/permissões), depois `migrarSenhas()`.
2. Implantar → Nova implantação → Web app (Executar como: Eu; Acesso: Qualquer pessoa). Ao mudar o código: Gerenciar implantações → editar → **Nova versão**.
3. Coloque a URL `/exec` em `assets/js/config.js`.
4. Deixe a planilha com compartilhamento **Restrito**.

## Segurança
- Nunca coloque chaves/senhas no repositório. Senhas ficam como hash na planilha.
- Modo GitHub Pages: sem chave (`REQUIRE_KEY` desligado); o painel é protegido por login + sessão e permissões validadas no backend.
- A API_KEY colada no chat deve ser considerada exposta: rode `gerarNovaApiKey()` antes de usar chave.

## Migrar para Cloudflare Pages
1. Conecte o repositório (Build command vazio, output = raiz).
2. No Apps Script rode `gerarNovaApiKey()` e `exigirChave()`.
3. Cloudflare → Settings → Variables and Secrets (Encrypt): `APPS_SCRIPT_URL`, `APPS_SCRIPT_API_KEY`.
4. Em `assets/js/config.js` troque `proxyUrl: ''` por `proxyUrl: '/api'` e `apiUrl` pode ficar vazio.

## Ofertas, margem e giro (Adm)

- **Custo e Subcategoria** em cada anúncio. O custo é privado (nunca sai no catálogo público).
- **Configurações → Margem de lucro e ofertas**: margem alvo, desconto máximo e margem mínima sobre o custo. Ficam em chaves privadas (`_MargemLucro`, `_DescontoMaximo`, `_MargemMinima`) que `getSettings` não devolve.
- **Subcategorias** são editadas em Configurações (uma categoria por linha: `Periféricos: Teclados, Mouses`).
- **Adm → Agenda de ofertas**: oferta por categoria/subcategoria, produtos escolhidos ou todos, com início e fim. O preço é calculado na leitura (sem editar cada anúncio), respeita o desconto máximo e nunca fica abaixo do custo (+ margem mínima). Produtos sem custo ficam de fora.
- **Postagem de vendas**: caixas de seleção + “Aplicar layout” em lote; “Atualizar artes” refaz as artes com os preços vigentes.
- **Indicadores**: giro (vendas 30/90 dias x estoque) e folga de margem para ofertas.
- **Editor**: formas, sublinhado, sombra, contorno, degradê com ângulo/fade, fontes, espelhar/centralizar e “Criar com IA” (gerador por regras, offline).
- Depois de colar o novo `Code.gs`, rode `setup()` uma vez e publique uma nova versão da implantação.

### Regras de preço da oferta programada
- O preço da oferta é **arredondado para cima fechando em 9,90** (ex.: 313,40 → 319,90; 1.330,00 → 1.339,90). Nunca fica abaixo do custo + margem mínima; se o arredondamento chegasse ao preço normal, usa o valor exato.
- Ao salvar uma oferta que atinge produtos com **promoção manual**, o Adm pergunta se a oferta **substitui** a manual durante a vigência ou se **mantém** a manual. A promoção manual nunca é apagada: ao fim da vigência ela volta sozinha. Ofertas antigas (sem a escolha) substituem por padrão. Rode `setup()` para criar a coluna `SubstituirManual`.
