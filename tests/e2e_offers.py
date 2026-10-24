import json, pathlib, urllib.request
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8790'; OUT=pathlib.Path('/tmp/claude-0/e2e'); OUT.mkdir(exist_ok=True)
PHOTO=pathlib.Path('/home/claude/safezone/tests/assets/foto-teste.jpg').read_bytes()
urllib.request.urlopen(BASE+'/__reset').read()
errors=[]
def call(action, data=None, token=None):
    req=urllib.request.Request(BASE+'/__api', data=json.dumps({'action':action,'data':data or {},'token':token}).encode(), headers={'content-type':'text/plain'})
    return json.loads(urllib.request.urlopen(req).read())
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: errors.append(m)
T=call('login',{'login':'dono@safezone.com','password':'SenhaForte123'})['data']['token']
photo='https://lh3.googleusercontent.com/d/ABCDEFGHIJ1234'
def mk(n,cat,sub,pn,custo,est=5):
    r=call('saveProduct',{'nome':n,'categoria':cat,'subcategoria':sub,'condicao':'Novo','precoNormal':pn,'custo':custo,'estoque':est,'status':'Publicado','fotoPrincipal':photo,'marca':'Marca','modelo':'M1','requestId':'s'+n},T); assert r['ok'],r; return r['data']['id']
t1=mk('Teclado Alfa','Periféricos','Teclados','1200,00','1000,00'); t2=mk('Teclado Beta','Periféricos','Teclados','300,00','200,00'); m1=mk('Mouse Gama','Periféricos','Mouses','100,00','60,00'); sc=mk('Teclado Sem Custo','Periféricos','Teclados','150,00','')
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1360,'height':900})
    def api_route(route, request):
        r=route.fetch(url=BASE+'/__api', method='POST', post_data=request.post_data, headers={'content-type':'text/plain'})
        route.fulfill(status=200, body=r.body(), headers={'content-type':'application/json','access-control-allow-origin':'*'})
    ctx.route('https://script.google.com/**', api_route)
    ctx.route('https://lh3.googleusercontent.com/**', lambda r: r.fulfill(status=200, body=PHOTO, headers={'content-type':'image/jpeg','access-control-allow-origin':'*'}))
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'fonts' not in m.text else None)
    pg.goto(BASE+'/admin/'); pg.fill('#lu','dono@safezone.com'); pg.fill('#lp','SenhaForte123'); pg.click('#lb'); pg.wait_for_selector('.shell')
    # ---- campos novos no formulário
    pg.click('[data-go=adm]'); pg.click('[data-go="adm/postagem"]'); pg.wait_for_selector('#pbody tr[data-id]')
    pg.click('#pbody tr[data-id]:has-text("Teclado Alfa") [data-ed]'); pg.wait_for_selector('#f_custo')
    ok(pg.input_value('#f_custo')=='1000' or pg.input_value('#f_custo')=='1000,00','custo carregado no formulário')
    ok('Teclados' in pg.inner_text('#f_sub') and pg.input_value('#f_sub')=='Teclados','subcategoria carregada e lista vem das configurações')
    pg.wait_for_function("document.querySelector('#f_custoh').innerText.includes('1.200,00')")
    ok('Margem atual: 20%' in pg.inner_text('#f_custoh'),'dica de margem: '+pg.inner_text('#f_custoh'))
    pg.click('[data-x2]')
    # ---- seleção em massa + layout em lote
    pg.check('#pbody tr:has-text("Teclado Alfa") [data-sel]'); pg.check('#pbody tr:has-text("Teclado Beta") [data-sel]')
    ok('2 selecionados' in pg.inner_text('#pbulk'),'barra de seleção em massa')
    pg.click('#bl'); pg.wait_for_selector('#b_lay'); pg.select_option('#b_lay','b:oferta'); pg.click('#b_go')
    pg.wait_for_selector('#b_prog .note', timeout=90000); txt=pg.inner_text('#b_prog'); ok('2 arte(s) atualizada(s)' in txt,'lote aplicou layout em 2 anúncios: '+txt.replace('\n',' '))
    pg.click('#b_x')
    lst=call('listAllProducts',{},T)['data']; a=[x for x in lst if x['nome']=='Teclado Alfa'][0]
    ok(a['layoutArte'].startswith('b:oferta') and a['fotoPrincipal']==a['fotoArte'] and len(a['fotos'])==2,'anúncio com arte nova e foto original preservada')
    ok([x for x in lst if x['nome']=='Mouse Gama'][0]['layoutArte']=='','não selecionados ficam intactos')
    # selecionar todos filtrados
    pg.select_option('#pcat','Periféricos'); pg.check('#pall'); ok('4 selecionados' in pg.inner_text('#pbulk'),'selecionar todos os listados')
    # ---- oferta a partir da seleção
    pg.click('#bo'); pg.wait_for_selector('#o_nome'); ok('4 selecionado' in pg.inner_text('#o_cnt'),'oferta nasce com a seleção')
    pg.click('#o_x'); pg.click('#onew'); pg.wait_for_selector('#o_nome')
    pg.fill('#o_nome','Semana dos teclados'); pg.select_option('#o_esc','categoria'); pg.select_option('#o_cat','Periféricos'); pg.select_option('#o_sub','Teclados'); pg.fill('#o_pct','30')
    pg.click('#o_prev'); pg.wait_for_selector('#o_pv table'); pv=pg.inner_text('#o_pv')
    ok('limite: desconto máximo' in pv and '1.080,00' in pv,'prévia mostra desconto limitado a 10%: 1.200 -> 1.080')
    ok('sem custo cadastrado' in pv,'produto sem custo fica de fora')
    pg.screenshot(path=str(OUT/'oferta_form.png'))
    pg.click('#o_save'); pg.wait_for_selector('#obody tr[data-id]'); ok('No ar' in pg.inner_text('#obody'),'oferta salva e já no ar')
    pub=call('listProducts')['data']; k=[x for x in pub if x['nome']=='Teclado Alfa'][0]; ok(k['precoAtual']==1080 and k['desconto']==10,'site público já mostra R$ 1.080 (-10%)')
    ok([x for x in pub if x['nome']=='Teclado Sem Custo'][0]['precoAtual']==150,'sem custo: preço intacto')
    ok('custo' not in json.dumps(pub),'custo não vaza no catálogo')
    # atualizar artes da oferta
    pg.click('#obody [data-art]'); pg.wait_for_selector('#b_go'); pg.click('#b_go'); pg.wait_for_selector('#b_prog .note', timeout=90000); ok('arte(s) atualizada(s)' in pg.inner_text('#b_prog'),'atualizar artes com preço de oferta'); pg.click('#b_x')
    pg.click('#obody [data-pz]'); pg.wait_for_function("document.querySelector('#obody').innerText.includes('Pausada')"); ok(True,'pausar oferta')
    ok([x for x in call('listProducts')['data'] if x['nome']=='Teclado Alfa'][0]['precoAtual']==1200,'pausada: preço volta ao normal')
    # ---- indicadores
    call('createSale',{'idAnuncio':m1,'quantidade':4,'valorUnitario':100,'status':'Venda concluída'},T)
    pg.click('[data-go="adm/indicadores"]'); pg.wait_for_selector('#gv table'); gv=pg.inner_text('#gv')
    ok('Alto giro' in gv and 'Mouse Gama' in gv and 'Pode vender mais barato' in gv,'indicador de giro com sugestão')
    pg.screenshot(path=str(OUT/'indicador_giro.png'), full_page=True)
    # ---- regras em Configurações
    pg.click('[data-go=config]'); pg.wait_for_selector('#rf'); pg.wait_for_function("document.querySelector('#rf [name=descMax]').value!==''")
    pg.fill('#rf [name=descMax]','15'); pg.click('#rf button'); pg.wait_for_selector('.toast.show')
    ok(call('getPricingRules',{},T)['data']['descMax']==15,'regras salvas')
    ok('Teclados' in pg.input_value('#cf [name=Subcategorias]'),'subcategorias editáveis em Configurações')
    b.close()
print('SEM ERROS' if not errors else '\n'.join(errors))
