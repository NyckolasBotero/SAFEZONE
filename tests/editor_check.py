import pathlib, json
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8790'; OUT=pathlib.Path('/tmp/claude-0/e2e'); OUT.mkdir(exist_ok=True)
PHOTO=pathlib.Path('/home/claude/safezone/tests/assets/foto-teste.jpg').read_bytes()
errors=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: errors.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1500,'height':950})
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errors.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'fonts' not in m.text else None)
    pg.goto(BASE+'/editor/index.html'); pg.wait_for_selector('#cv')
    pg.set_input_files('#file','/home/claude/safezone/tests/assets/foto-teste.jpg'); pg.wait_for_timeout(600)
    # formas e efeitos de texto
    for k in ['star5','burst','heart','ribbon','ellipse','arrow','poly','triangle']:
        pg.click(f'[data-add={k}]')
    ok(pg.locator('#layers .layer').count()>20,'formas novas adicionadas')
    pg.click('[data-add=text]'); pg.wait_for_selector('#insp [data-p=underline]')
    pg.check('#insp [data-p=underline]'); pg.select_option('#insp [data-p=font]','Bebas Neue')
    pg.fill('#insp [data-p=shb]','12'); pg.fill('#insp [data-p=ow]','4'); pg.fill('#insp [data-p=gang]','45'); pg.check('#insp [data-p=fade]')
    st=pg.evaluate('SafezoneEditor.getState()'); t=[e for e in st['els'] if e['type']=='text' and e['text']=='Novo texto'][0]
    ok(t['underline'] and t['font']=='Bebas Neue' and t['shb']==12 and t['fade'] and t['gang']==45,'propriedades de texto salvas: '+json.dumps({k:t.get(k) for k in ['underline','font','shb','ow','gang','fade']}))
    pg.click('#insp [data-a=fx]'); pg.click('#insp [data-a=ch]')
    # gerador
    pg.click('#bAI'); pg.fill('#aiPrompt','layout de Natal vermelho e dourado com neve, selo "NATAL SAFEZONE"'); pg.click('#aiGo'); pg.wait_for_function("document.querySelector('#aiOut').innerText.length>10")
    out=pg.inner_text('#aiOut'); ok('Natal' in out and 'NATAL SAFEZONE' in out,'IA entende ocasião e selo: '+out[:140].replace('\n',' '))
    pg.click('#aiClose'); pg.wait_for_timeout(500); pg.screenshot(path=str(OUT/'ia_natal.png'))
    st=pg.evaluate('SafezoneEditor.getState()'); ok(any(e.get('deco') for e in st['els']) and any(e.get('name')=='Selo da campanha' for e in st['els']),'layout traz decoração e selo')
    ok(any(e.get('bind')=='title1' for e in st['els']),'campos do anúncio continuam ligados')
    # outras ocasiões
    for pr,key in [('Black Friday amarelo 50%','Black Friday'),('Dia dos Pais azul','Dia dos Pais'),('algo qualquer','Promoção'),('minimalista roxo e azul','Promoção')]:
        pg.click('#bAI'); pg.fill('#aiPrompt',pr); pg.click('#aiGo'); pg.wait_for_timeout(300); ok(key in pg.inner_text('#aiOut'),f'tema para "{pr}"'); pg.click('#aiClose')
    pg.click('#bAI'); pg.fill('#aiPrompt','Black Friday amarelo 50%'); pg.click('#aiGo'); pg.click('#aiClose'); pg.wait_for_timeout(400); pg.screenshot(path=str(OUT/'ia_bf.png'))
    # variação gera algo diferente
    a=json.dumps(pg.evaluate('SafezoneEditor.getState()')['els'])
    pg.click('#bAI'); pg.click('#aiAgain'); pg.click('#aiClose'); b2=json.dumps(pg.evaluate('SafezoneEditor.getState()')['els']); ok(a!=b2,'outra variação muda a decoração')
    # render headless com layout gerado + produto (como o lote faz)
    st=pg.evaluate('SafezoneEditor.getState()')
    r=pg.evaluate("""async (cfg)=>{ const u=await SafezoneEditor.renderArt(cfg,{nome:'Teclado Mecânico RGB Pro',categoria:'Periféricos',marca:'Safe',modelo:'K1',descricaoCurta:'Switch azul',precoNormal:300,precoPromocional:270,especificacoes:[{item:'Layout',valor:'ABNT2'}]}, null); return u.length+':'+u.slice(0,22); }""", st)
    ok(r.startswith('') and 'data:image/jpeg' in r,'renderização em lote com layout gerado: '+r[:40])
    pg.screenshot(path=str(OUT/'ia_render.png'))
    b.close()
print('SEM ERROS' if not errors else '\n'.join(errors))
