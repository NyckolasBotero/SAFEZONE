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
