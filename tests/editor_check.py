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

    # ---------- sem resíduos entre temas, estrutura mantida, variedade ----------
    pg.reload(); pg.wait_for_selector('#cv'); pg.set_input_files('#file','/home/claude/safezone/tests/assets/foto-teste.jpg'); pg.wait_for_timeout(500)
    def st(): return pg.evaluate('SafezoneEditor.getState()')
    def gen(prompt, again=False):
        pg.click('#bAI'); pg.fill('#aiPrompt',prompt)
        if again: pg.click('#aiAgain')
        else: pg.click('#aiGo')
        pg.wait_for_timeout(250); out=pg.inner_text('#aiOut'); pg.click('#aiClose'); return out
    pg.click('[data-lay=gamer]'); base=st(); geo=lambda S:[(e['name'],round(e['x']),round(e['y']),round(e['w']),round(e['h'])) for e in S['els'] if not e.get('ai')]
    g0=geo(base)
    gen('layout de Natal com neve'); s1=st(); pal1=s1['pal']
    ok(s1['layout']=='gamer' and geo(s1)==g0,'estrutura do layout selecionado (Layout 04) mantida: mesmas posições e tamanhos')
    ok(sum(1 for e in s1['els'] if e.get('name')=='Selo da campanha')==1,'um único selo da campanha')
    gen('Dia dos Pais azul'); s2=st(); js=json.dumps([e for e in s2['els'] if not e.get('ai')])
    ok(pal1['a'] not in js and pal1['b'] not in js,'cores do tema anterior (%s / %s) não sobram nos elementos do layout'%(pal1['a'],pal1['b']))
    ok(sum(1 for e in s2['els'] if e.get('name')=='Selo da campanha')==1 and sum(1 for e in s2['els'] if e.get('name')=='Texto do selo')==1,'selo não acumula entre gerações')
    n_ai=lambda S:sum(1 for e in S['els'] if e.get('ai'))
    for pr in ['Black Friday amarelo','Halloween']: gen(pr)
    gen('edição especial, 5 unidades, dourado e vermelho'); s3=st(); ok(any('5 UNIDADES' in str(e.get('text','')) for e in s3['els']),'tiragem informada vira texto do selo')
    gen('lançamento ciano e roxo'); s3=st(); ok(s3['layout']=='gamer' and geo(s3)==g0,'após 6 temas seguidos a estrutura continua idêntica')
    # trocar de layout manualmente limpa a IA
    pg.click('[data-lay=premium]'); s4=st(); ok(n_ai(s4)==0 and s4['pal'] is None and s4['layout']=='premium','trocar de layout remove decoração, selo e paleta da IA')
    # estrutura mantida em outro layout + formato story
    pg.select_option('#fmt','story'); gen('Natal'); s5=st(); ok(s5['layout']=='premium' and s5['H']==1920,'funciona com o layout/formato escolhidos (premium, story)')
    pg.select_option('#fmt','portrait'); s6=st(); ok(n_ai(s6)>0 and s6['pal'] is not None,'mudar o formato mantém o tema da IA')
    # desmarcar manter estrutura permite trocar a estrutura
    pg.click('#bAI'); pg.uncheck('#aiKeep'); pg.fill('#aiPrompt','setup gamer neon'); pg.click('#aiGo'); pg.wait_for_timeout(250); pg.click('#aiClose'); s7=st(); ok(s7['layout']=='gamer','sem manter: escolhe estrutura (gamer)')
    # variedade
    pg.click('#bAI'); pg.check('#aiKeep'); pg.fill('#aiPrompt','layout de Natal'); pg.click('#aiGo'); sigs=set()
    for i in range(14):
        pg.click('#aiAgain'); pg.wait_for_timeout(120); S=st(); sigs.add((S['pal']['a'],S['pal']['b'],tuple(sorted({e['kind'] for e in S['els'] if e.get('ai') and e.get('kind')})), next((e.get('kind') for e in S['els'] if e.get('name')=='Selo da campanha'),None), next((e.get('font') for e in S['els'] if e.get('name')=='Nome'),None)))
    pg.click('#aiClose'); ok(len(sigs)>=10,'14 variações de Natal geram %d combinações distintas'%len(sigs))
    pg.screenshot(path=str(OUT/'ia_variacao.png'))
    b.close()
print('SEM ERROS' if not errors else '\n'.join(errors))
