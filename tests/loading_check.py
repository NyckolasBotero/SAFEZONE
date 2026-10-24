import json, pathlib, time, urllib.request
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8790'; OUT=pathlib.Path('/tmp/claude-0/e2e'); OUT.mkdir(exist_ok=True)
PHOTO=pathlib.Path('/home/claude/safezone/tests/assets/foto-teste.jpg').read_bytes()
def route_factory(delay):
    def api_route(route, request):
        r=route.fetch(url=BASE+'/__api', method='POST', post_data=request.post_data, headers={'content-type':'text/plain'})
        route.fulfill(status=200, body=r.body(), headers={'content-type':'application/json','access-control-allow-origin':'*'})
    return api_route
res={}
urllib.request.urlopen(BASE+'/__reset').read()
def api(action,data,token=None):
    rq=urllib.request.Request(BASE+'/__api',data=json.dumps({'action':action,'data':data,'token':token}).encode(),method='POST')
    return json.loads(urllib.request.urlopen(rq).read())
tok=api('login',{'login':'dono@safezone.com','password':'SenhaForte123'})['data']['token']
for i in range(4):
    api('saveProduct',{'nome':f'Produto Teste {i}','categoria':'Periféricos','condicao':'Novo','precoNormal':'250,00','precoPromocional':'199,90','estoque':'3','status':'Publicado','descricaoCurta':'Descrição de teste do produto.','fotoPrincipal':'https://lh3.googleusercontent.com/d/ABCDEFGHIJ1234','fotosAdicionais':[],'destaque':True},tok)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1360,'height':900}, reduced_motion='reduce')
    ctx.route('https://script.google.com/**', route_factory(2.5))
    ctx.route('https://lh3.googleusercontent.com/**', lambda r: r.fulfill(status=200, body=PHOTO, headers={'content-type':'image/jpeg','access-control-allow-origin':'*'}))
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    pg=ctx.new_page(); urllib.request.urlopen(BASE+'/__delay?ms=2500').read(); pg.goto(BASE+'/index.html', wait_until='domcontentloaded')
    pg.wait_for_selector('.hdr'); t=pg.evaluate("performance.now()")
    res['header_imediato']=t<1500
    res['skeletons']=pg.locator('#recent .skel').count()
    res['footer_sem_numero_errado']=pg.locator('footer .sk-line').count()>0 and pg.locator('.wa-float').count()==0
    res['barra_ativa']=pg.evaluate("document.getElementById('szbar')&&document.getElementById('szbar').classList.contains('on')")
    res['bar_anim']=pg.evaluate("getComputedStyle(document.querySelector('#szbar i')).animationName")
    res['spin_anim_reduced']=pg.evaluate("(()=>{const e=document.createElement('span');e.className='spin';document.body.appendChild(e);return getComputedStyle(e).animationName})()")
    res['skel_anim_reduced']=pg.evaluate("getComputedStyle(document.querySelector('.skel')).animationName")
    res['skel_h']=pg.evaluate("document.querySelector('#recent .skel').getBoundingClientRect().height")
    h_before=pg.evaluate("document.documentElement.scrollHeight")
    pg.screenshot(path=str(OUT/'loading_home.png'))
    pg.wait_for_selector('#recent .card', timeout=20000)
    res['card_h']=pg.evaluate("document.querySelector('#recent .card').getBoundingClientRect().height")
    res['page_h_antes_depois']=[h_before, pg.evaluate("document.documentElement.scrollHeight")]
    # segunda visita: aparece na hora (dados salvos no aparelho)
    pg.goto(BASE+'/index.html', wait_until='domcontentloaded'); t0=time.time()
    pg.wait_for_selector('#recent .card', timeout=20000); res['2a_visita_s']=round(time.time()-t0,2)
    b.close()
urllib.request.urlopen(BASE+'/__delay?ms=0').read()
print(json.dumps(res,indent=1,ensure_ascii=False))
