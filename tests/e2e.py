import json, pathlib, sys
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8790'; OUT=pathlib.Path('/tmp/claude-0/e2e'); OUT.mkdir(exist_ok=True)
PHOTO=pathlib.Path('/home/claude/safezone/tests/assets/foto-teste.jpg').read_bytes()
import urllib.request; urllib.request.urlopen('http://127.0.0.1:8790/__reset').read()
errors=[]; calls=[]
def api_route(route, request):
    body=request.post_data
    try: calls.append(json.loads(body).get('action'))
    except Exception: pass
    r=route.fetch(url=BASE+'/__api', method='POST', post_data=body, headers={'content-type':'text/plain'})
    route.fulfill(status=200, body=r.body(), headers={'content-type':'application/json','access-control-allow-origin':'*'})
def setup(ctx):
    ctx.route('https://script.google.com/**', api_route)
    ctx.route('https://lh3.googleusercontent.com/**', lambda r: r.fulfill(status=200, body=PHOTO, headers={'content-type':'image/jpeg','access-control-allow-origin':'*'}))
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
def watch(pg, name):
    pg.on('pageerror', lambda e: errors.append(f'{name} PAGEERR {e}'))
    pg.on('console', lambda m: errors.append(f'{name} CONSOLE {m.text}') if m.type=='error' and 'ERR_FAILED' not in m.text and 'fonts' not in m.text else None)
def ok(c, msg):
    print(('PASS ' if c else 'FAIL ')+msg)
    if not c: errors.append('ASSERT '+msg)

with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1360,'height':900}); setup(ctx)
    pg=ctx.new_page(); watch(pg,'admin')
    # ---------- login ----------
    pg.goto(BASE+'/admin/'); pg.fill('#lu','dono@safezone.com'); pg.fill('#lp','errada'); pg.click('#lb')
    pg.wait_for_selector('#le:not(:empty)'); ok('inválid' in pg.inner_text('#le') or 'inv' in pg.inner_text('#le').lower(), 'login com senha errada mostra erro genérico: '+pg.inner_text('#le'))
    pg.fill('#lp','SenhaForte123'); pg.click('#lb'); pg.wait_for_selector('.shell')
    ok(pg.locator('#nav [data-go]').count()>=4, 'admin vê as 4 abas + subabas')
    # ---------- produtos ----------
    pg.click('[data-go=produtos]'); pg.wait_for_selector('#pnew'); pg.wait_for_selector('#pbody .empty'); ok('Nenhum anúncio cadastrado' in pg.inner_text('#pbody'), 'estado vazio de produtos')
    def new_product(nome, cat, cond, pn, pp, est, status, extra=None):
        pg.click('#pnew'); pg.wait_for_selector('#f_nome')
        pg.fill('#f_nome',nome); pg.select_option('#f_cat',cat)
        if cond: pg.select_option('#f_cond',cond)
        pg.fill('#f_marca','Fifine'); pg.fill('#f_modelo','AM8'); pg.fill('#f_dc','Microfone dinâmico USB + XLR com RGB.')
        pg.fill('#f_esp','Tipo: Dinâmico\nConexão: USB + XLR'); pg.fill('#f_pn',pn); pg.fill('#f_pp',pp); pg.fill('#f_est',str(est)); pg.select_option('#f_st',status)
        if extra: extra()
    # validação: tenta salvar sem foto publicando
    new_product('Fifine Ampligame AM8 RGB','Periféricos','Novo','250,00','199,90',5,'Publicado')
    pg.click('#f_save'); pg.wait_for_function("document.querySelector('#f_err').innerText.length>0")
    ok('foto' in pg.inner_text('#f_err').lower(), 'publicar sem foto é bloqueado: '+pg.inner_text('#f_err').replace('\n',' '))
    pg.set_input_files('#f_file','/home/claude/safezone/tests/assets/foto-teste.jpg'); pg.wait_for_selector('.ph')
    ok('Desconto de 20%' in pg.inner_text('#f_pph'), 'prévia calcula desconto automático')
    ok('-20%' in pg.inner_text('#f_prev') and 'OFERTA' in pg.inner_text('#f_prev'), 'prévia do card mostra selo e -20%')
    pg.screenshot(path=str(OUT/'admin_form.png'))
    pg.click('#f_save'); pg.wait_for_selector('#pbody tr[data-id]'); ok(pg.locator('#pbody tr[data-id]').count()==1, 'anúncio 1 salvo e listado')
    # segundo: preços iguais
    new_product('Placa de Vídeo RTX Teste','Placas de vídeo','Seminovo','1.500,00','1.500,00',1,'Publicado',
        lambda: (pg.set_input_files('#f_file','/home/claude/safezone/tests/assets/foto-teste.jpg'), pg.wait_for_selector('.ph'), pg.fill('#f_cons','Excelente')))
    ok('igual' in pg.inner_text('#f_pph').lower() or 'iguais' in pg.inner_text('#f_pph').lower(), 'preços iguais: aviso sem desconto')
    pg.click('#f_save'); pg.wait_for_function("document.querySelectorAll('#pbody tr[data-id]').length==2")
    # terceiro: rascunho (não deve aparecer no site)
    new_product('Item Rascunho','Memórias RAM','Novo','100,00','',2,'Rascunho'); pg.click('#f_save'); pg.wait_for_function("document.querySelectorAll('#pbody tr[data-id]').length==3")
    # ---------- arte automática pelo layout ----------
    new_product('Mouse Com Arte','Periféricos','Novo','200,00','150,00',3,'Publicado',
        lambda: (pg.set_input_files('#f_file','/home/claude/safezone/tests/assets/foto-teste.jpg'), pg.wait_for_selector('.ph')))
    pg.select_option('#f_lay','b:oferta'); pg.click('#f_artbtn'); pg.wait_for_selector('#f_artimg:not([hidden])', timeout=60000)
    ok(pg.evaluate("document.querySelector('#f_artimg').naturalWidth")==1080, 'arte gerada em 1080 px sem baixar nada')
    pg.locator('#f_artimg').screenshot(path=str(OUT/'arte_gerada.png'))
    pg.click('#f_save'); pg.wait_for_function("document.querySelectorAll('#pbody tr[data-id]').length==4", timeout=60000)
    listing=lambda: pg.evaluate("""async()=>{const r=await fetch('https://script.google.com/macros/s/x/exec',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'listProducts',data:{}})});return (await r.json()).data}""")
    prod=[x for x in listing() if x['nome']=='Mouse Com Arte'][0]
    ok(len(prod['fotos'])==2 and prod['fotoPrincipal']==prod['fotos'][0], 'anúncio salvo com a arte como foto principal + foto original: '+str(len(prod['fotos'])))
    pg.click('#pbody tr[data-id]:has-text("Mouse Com Arte") [data-ed]'); pg.wait_for_selector('#f_lay')
    ok(pg.input_value('#f_lay')=='b:oferta' and 'ARTE' in pg.inner_text('#f_ph'), 'ao reabrir, layout lembrado e foto marcada como ARTE')
    pg.select_option('#f_lay','b:premium'); pg.click('#f_save'); pg.wait_for_selector('.toast.show'); pg.wait_for_timeout(800)
    prod2=[x for x in listing() if x['nome']=='Mouse Com Arte'][0]
    ok(len(prod2['fotos'])==2 and prod2['fotoPrincipal']!=prod['fotoPrincipal'], 'trocar o layout gera outra arte sem duplicar fotos')
    pg.click('#pbody tr[data-id]:has-text("Mouse Com Arte") [data-ed]'); pg.wait_for_selector('#f_lay'); pg.select_option('#f_lay',''); pg.click('#f_save'); pg.wait_for_selector('.toast.show'); pg.wait_for_timeout(800)
    prod3=[x for x in listing() if x['nome']=='Mouse Com Arte'][0]
    ok(len(prod3['fotos'])==1, 'sem layout: volta a usar só a foto original')
    pg.click('#pbody tr[data-id]:has-text("Mouse Com Arte") [data-ed]'); pg.wait_for_selector('#f_lay'); pg.select_option('#f_st','Rascunho'); pg.click('#f_save'); pg.wait_for_selector('.toast.show'); pg.wait_for_timeout(800)
    # ---------- site público ----------
    sp=ctx.new_page(); watch(sp,'site'); sp.goto(BASE+'/index.html'); sp.wait_for_selector('.card')
    ok(sp.locator('.card').count()>=2, 'home lista produtos publicados')
    ok('Item Rascunho' not in sp.inner_text('body'), 'rascunho não aparece no site')
    ok('não emite Nota Fiscal' in sp.inner_text('footer'), 'aviso de NF-e no rodapé')
    sp.screenshot(path=str(OUT/'home_desktop.png'), full_page=True)
    sp.goto(BASE+'/catalogo.html'); sp.wait_for_selector('.card'); ok(sp.locator('.card').count()==2, 'catálogo: 2 produtos')
    sp.fill('#fq','rtx'); sp.wait_for_function("document.querySelectorAll('.card').length==1"); ok('RTX' in sp.inner_text('#grid'), 'busca por nome filtra')
    sp.fill('#fq',''); sp.select_option('#fcond','Seminovo'); sp.wait_for_function("document.querySelectorAll('.card').length==1"); ok('RTX' in sp.inner_text('#grid'), 'filtro de condição')
    sp.select_option('#fcond',''); sp.check('#fpromo'); sp.wait_for_function("document.querySelectorAll('.card').length==2"); sp.uncheck('#fpromo')
    sp.fill('#fmin','1000'); sp.wait_for_function("document.querySelectorAll('.card').length==1"); ok('RTX' in sp.inner_text('#grid'), 'filtro de preço'); sp.fill('#fmin','')
    sp.fill('#fq','zzzz'); sp.wait_for_selector('.empty'); sp.fill('#fq','')
    sp.screenshot(path=str(OUT/'catalog_desktop.png'))
    # detalhes + WhatsApp
    sp.wait_for_function("document.querySelectorAll('.card').length==2"); sp.locator('.card', has_text='Ampligame').locator('.card-title a').click(); sp.wait_for_selector('#wa')
    href=sp.get_attribute('#wa','href'); from urllib.parse import urlparse, parse_qs, unquote
    u=urlparse(href); txt=parse_qs(u.query)['text'][0]
    ok(u.netloc=='wa.me' and u.path=='/5561994377971', 'WhatsApp abre o número correto')
    ok('Fifine Ampligame AM8 RGB' in txt and 'R$' in txt and '199,90' in txt and 'Novo' in txt and 'SZ-' in txt, 'mensagem com nome, preço, condição e ID: '+txt.replace('\n',' | ')[:150])
    ok('-20%' in sp.inner_text('.pd') and 'R$' in sp.inner_text('.pd'), 'detalhe mostra desconto')
    sp.screenshot(path=str(OUT/'product_desktop.png'), full_page=True)
    n0=calls.count('registerInterest'); 
    with sp.expect_popup() as pop: sp.click('#wa')
    pop.value.close(); sp.wait_for_timeout(600); ok(calls.count('registerInterest')==n0+1, 'clique em "tenho interesse" registrou interesse')
    # ---------- vendas ----------
    pg.click('[data-go=vendas]'); pg.wait_for_selector('#sbody tr[data-id]'); ok('Interesse recebido' in pg.inner_text('#sbody'), 'interesse aparece em Vendas')
    ok(pg.locator('.stat.hl b').first.inner_text()=='0', 'interesse NÃO conta como venda concluída')
    pg.select_option('#sbody tr[data-id] [data-st]','Venda concluída'); pg.wait_for_function("(document.querySelector('.stat.hl b')||{}).innerText=='1'")
    ok('199,90' in pg.inner_text('.stat.hl:nth-child(2)'), 'valor concluído soma só venda concluída: '+pg.inner_text('.stat.hl:nth-child(2)').replace('\n',' '))
    pg.screenshot(path=str(OUT/'admin_sales.png'))
    # ---------- adm ----------
    pg.click('[data-go=adm]'); pg.wait_for_selector('#ibody .cards'); t=pg.inner_text('#view').lower(); ok('vendas concluídas' in t and 'indisponível' in t, 'indicadores renderizam')
    pg.screenshot(path=str(OUT/'admin_indicators.png'), full_page=True)
    pg.click('[data-go="adm/logins"]'); pg.wait_for_selector('#ubody tr'); ok('vendas@safezone.com' in pg.inner_text('#ubody') and 'SenhaForte' not in pg.content(), 'logins listados sem senhas')
    pg.click('#unew'); pg.fill('#u_l','novo@safezone.com'); pg.fill('#u_n','Novo'); pg.fill('#u_p','curta'); pg.check('input[value=Produtos]'); pg.click('#u_go'); pg.wait_for_function("document.querySelector('#u_e').innerText.length>0")
    ok('8' in pg.inner_text('#u_e'), 'senha curta rejeitada: '+pg.inner_text('#u_e')); pg.fill('#u_p','SenhaNova123'); pg.click('#u_go'); pg.wait_for_function("document.querySelectorAll('#ubody tbody tr').length==3")
    pg.click('[data-go="adm/layouts"]'); pg.wait_for_selector('#edf'); fr=pg.frame_locator('#edf'); fr.locator('#prodSel').wait_for(state='attached'); pg.wait_for_timeout(1200)
    ok(fr.locator('#prodSel option').count()>=4, 'editor recebeu anúncios cadastrados: '+str(fr.locator('#prodSel option').count()))
    fr.locator('#prodSel').select_option(index=1); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT/'admin_layouts.png'))
    pg.click('[data-go=config]'); pg.wait_for_selector('#cf'); pg.fill('[name=FormasPagamento]','Pix e cartão'); pg.click('#cf button[type=submit]'); pg.wait_for_selector('.toast.show')
    sp.goto(BASE+'/index.html'); sp.evaluate("sessionStorage.clear()"); sp.reload(); sp.wait_for_selector('.ftr'); ok('Pix e cartão' in sp.inner_text('footer'), 'configuração salva aparece no rodapé')
    # ---------- permissões ----------
    c2=b.new_context(viewport={'width':1360,'height':900}); setup(c2); v=c2.new_page(); watch(v,'vendedor'); v.goto(BASE+'/admin/'); v.fill('#lu','vendas@safezone.com'); v.fill('#lp','Outra12345'); v.click('#lb'); v.wait_for_selector('.shell')
    tabs=v.locator('#nav > button').all_inner_texts(); ok(len(tabs)==1 and 'Vendas' in tabs[0], 'usuário só com "Vendas" vê apenas a aba Vendas: '+str(tabs))
    tok=v.evaluate("JSON.parse(sessionStorage.getItem('sz_sess')).token")
    r=v.evaluate("""async t=>{const r=await fetch('https://script.google.com/macros/s/x/exec',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'listUsers',data:{},token:t})});return r.json()}""", tok)
    ok(r['ok'] is False and r['error']['code']=='FORBIDDEN', 'backend nega listUsers a quem não é admin: '+r['error']['code'])
    r=v.evaluate("""async()=>{const r=await fetch('https://script.google.com/macros/s/x/exec',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'saveProduct',data:{nome:'x'}})});return r.json()}""")
    ok(r['ok'] is False and r['error']['code']=='SESSION', 'sem sessão não grava nada')
    # logout
    pg.click('#out'); pg.wait_for_selector('#lf'); pg.goto(BASE+'/admin/'); pg.wait_for_selector('#lf'); ok(True, 'logout encerra a sessão')
    # ---------- mobile ----------
    mc=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, has_touch=True, is_mobile=True); setup(mc); m=mc.new_page(); watch(m,'mobile')
    m.goto(BASE+'/index.html'); m.wait_for_selector('.card'); m.screenshot(path=str(OUT/'home_mobile.png'))
    ok(m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'home mobile sem rolagem horizontal')
    m.goto(BASE+'/catalogo.html'); m.wait_for_selector('.card'); m.click('#fbtn'); m.screenshot(path=str(OUT/'catalog_mobile.png'))
    m.goto(BASE+'/servicos.html'); m.wait_for_selector('.svc'); ok(m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'serviços mobile sem rolagem horizontal'); m.screenshot(path=str(OUT/'services_mobile.png'))
    am=mc.new_page(); watch(am,'adm-mobile'); am.goto(BASE+'/admin/'); am.fill('#lu','dono@safezone.com'); am.fill('#lp','SenhaForte123'); am.click('#lb'); am.wait_for_selector('.shell'); am.click('[data-go=produtos]'); am.wait_for_selector('#pbody tr[data-id]')
    ok(am.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"), 'painel mobile sem rolagem horizontal'); am.screenshot(path=str(OUT/'admin_mobile.png'))
    b.close()
print('\nERROS:' if errors else '\nSEM ERROS'); print('\n'.join(errors))
