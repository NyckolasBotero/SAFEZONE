import sys, base64, pathlib
from playwright.sync_api import sync_playwright
out = pathlib.Path('/tmp/claude-0/shots'); out.mkdir(exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':1440,'height':900}, accept_downloads=True)
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
    pg.goto('file:///home/claude/safezone/editor/index.html')
    pg.wait_for_timeout(600)
    pg.set_input_files('#file','/home/claude/safezone/tests/assets/foto-teste.jpg')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(out/'ui.png'))
    for lay in ['premium','oferta','seminovo','gamer','minimal','servicos']:
        pg.click(f'[data-lay={lay}]')
        if lay=='oferta':
            pg.fill('[data-k=pricePromo]','199,90')
        if lay=='seminovo':
            pg.select_option('[data-k=condition]','Seminovo'); pg.fill('[data-k=score]','9'); pg.fill('[data-k=conservation]','Excelente, sem marcas de uso')
        for fmt in ['portrait','story','banner','square']:
            pg.select_option('#fmt',fmt); pg.wait_for_timeout(80)
            with pg.expect_download() as d: pg.click('#bPng')
            d.value.save_as(str(out/f'{lay}_{fmt}.png'))
    print('\n'.join(errs) or 'no errors')
    b.close()
