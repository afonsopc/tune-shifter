#!/usr/bin/env python3
"""Capturas "em uso" do popup novo para a App Store, sem abrir janelas.

    npm run build:safari && python3 scripts/safari-popup-raws.py
    swift scripts/safari-screenshots.swift

O Safari não deixa capturar o popup de uma extensão sem o abrir à mão, por isso:
1. o popup compilado (dist-safari/popup) é desenhado em Chrome headless com um
   `chrome.tabs` falso que devolve um áudio real a tocar (1.25x, preservar tom,
   reverb 40 %; no iOS sem volume, como na extensão);
2. é posto por cima de capturas reais do Safari (Simulador via simctl e Safari no
   macOS), na forma em que o Safari mostra popups de extensões: folha em baixo no
   iPhone, popover no iPad e no Mac.

Entradas em safari/screenshots/raw/: iphone-page.png, ipad-page.png, mac-safari-base.png.
Saídas no mesmo sítio: iphone-popup-dark.png, iphone-popup-light.png, ipad-popup.png,
mac-safari-popup.png.
"""
import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from functools import partial

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist-safari")
RAW = os.path.join(ROOT, "safari/screenshots/raw")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SF = "/System/Library/Fonts/SFNS.ttf"

MEDIA = {
    "id": 1, "type": "audio", "src": "",
    "title": "Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg.mp3",
    "paused": False, "duration": 186, "volume": 1, "volumeEnabled": False,
    "playbackRate": 1.25, "preservesPitch": True, "muted": False,
    "reverb": 0.4, "reverbEnabled": True, "reverbPending": False,
}


def render(tmp, port, name, *, dark, touch, width, scale, **media):
    """Desenha o popup e devolve a imagem recortada ao conteúdo."""
    pop = os.path.join(tmp, "popup")
    css = open(os.path.join(pop, "popup.css")).read()
    block = re.search(r"@media\(prefers-color-scheme:dark\)\{(:root\{[^}]*\})\}", css)
    css = css.replace(block.group(0), block.group(1) if dark else "")
    if touch:  # o Safari no iOS/iPadOS responde a (pointer: coarse)
        css = css.replace("@media(pointer:coarse){", "@media all{")
    # Fundo quase transparente no <html> para o do <body> não encher a janela toda.
    css += "html{background:rgba(0,0,0,.004)}body{width:%spx!important}" % width
    open(os.path.join(pop, name + ".css"), "w").write(css)
    m = dict(MEDIA, **media)
    stub = ("<script>const M=%s;window.chrome={runtime:{lastError:null},tabs:{query:async()=>[{id:1}],"
            "sendMessage:(t,m,cb)=>cb(m.action==='getMedia'?{media:M}:{ok:1})}};</script>") % json.dumps([m])
    html = open(os.path.join(pop, "index.html")).read()
    html = html.replace('<script type="module"', stub + '<script type="module"').replace("./popup.css", "./%s.css" % name)
    open(os.path.join(pop, name + ".html"), "w").write(html)
    out = os.path.join(tmp, name + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--user-data-dir=" + os.path.join(tmp, "profile"), "--default-background-color=00000000",
                    "--force-device-scale-factor=%s" % scale, "--window-size=900,1000",
                    "--virtual-time-budget=3000", "--screenshot=" + out,
                    "http://127.0.0.1:%d/popup/%s.html" % (port, name)],
                   check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    im = Image.open(out).convert("RGBA")
    bbox = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bbox)
    im.putalpha(255)
    return im


def font(size, weight="Semibold"):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_name(weight)
    return f


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return m


def shadow(base, box, radius, blur, alpha, dy=0):
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((box[0], box[1] + dy, box[2], box[3] + dy), radius, fill=(0, 0, 0, alpha))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))


def iphone(page, pop, dark):
    """Folha do Safari no iPhone (destaque médio, ajustada ao conteúdo) sobre a página escurecida."""
    W, H = page.size
    bg_page = 38
    img = page.convert("RGBA")
    dim = Image.alpha_composite(img, Image.new("RGBA", img.size, (0, 0, 0, 115)))
    # A barra de estado fica por cima do escurecimento.
    top = img.crop((0, 0, W, 170)).convert("L").point(lambda v: max(0, min(255, (v - bg_page) * 255 // (255 - bg_page))))
    dim.paste(img.crop((0, 0, W, 170)), (0, 0), top)
    img = dim
    x0, x1, bottom = 24, W - 24, H - 25
    head = 245
    sheet_h = head + pop.height + 75
    y0 = bottom - sheet_h
    bg = (28, 28, 30) if dark else (255, 255, 255)
    fg = (245, 245, 247) if dark else (29, 29, 31)
    shadow(img, (x0, y0, x1, bottom), 120, 40, 110)
    sheet = Image.new("RGBA", (x1 - x0, sheet_h), bg + (255,))
    d = ImageDraw.Draw(sheet)
    d.text((sheet.width / 2, 130), "Tune Shifter", font=font(51), fill=fg, anchor="mm")
    cx, cy, r = sheet.width - 122, 129, 63
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(74, 149, 255))
    d.line([(cx - 25, cy + 1), (cx - 7, cy + 21), (cx + 26, cy - 22)], fill=(255, 255, 255), width=9, joint="curve")
    for px, py in [(cx - 25, cy + 1), (cx + 26, cy - 22), (cx - 7, cy + 21)]:
        d.ellipse((px - 4, py - 4, px + 4, py + 4), fill=(255, 255, 255))
    sheet.alpha_composite(pop.resize((sheet.width, round(pop.height * sheet.width / pop.width)), Image.LANCZOS), (0, head))
    img.paste(sheet, (x0, y0), rounded_mask(sheet.size, 120))
    return img.convert("RGB")


def ipad(page, pop):
    """Popover do Tune Shifter por baixo do botão das extensões (barra de endereço)."""
    img = page.convert("RGBA")
    cx, y0 = 1287, 176
    box = (cx - pop.width // 2, y0, cx - pop.width // 2 + pop.width, y0 + pop.height)
    shadow(img, box, 44, 40, 150, 10)
    img.paste(pop, box[:2], rounded_mask(pop.size, 44))
    return img.convert("RGB")


def mac(base, pop, bar):
    """Janela real do Safari (macOS): página de áudio da Wikimedia e popover sob o ícone."""
    img = base.copy()
    alpha = img.split()[3]
    W, H = img.size
    d = ImageDraw.Draw(img)
    page_bg = (38, 38, 38, 255)
    d.rectangle((0, 105, W, H), fill=page_bg)  # tapa a página de teste e o popover antigo
    # Página de áudio: a barra de controlos do WebKit (mesma captura do iPad, também @2x) ao centro.
    img.paste(bar, ((W - bar.width) // 2, 105 + (H - 105 - bar.height) // 2))
    # Barra de endereço: endereço real e sem o ícone de tradução (não aparece em ficheiros de áudio).
    field = (57, 57, 57, 255)
    d.rectangle((1410, 30, 1540, 74), fill=field)
    d.text((1475, 52), "upload.wikimedia.org", font=font(27), fill=(236, 236, 236), anchor="mm")
    speaker = img.crop((1928, 28, 1972, 76))
    d.rectangle((1926, 28, 2018, 76), fill=field)
    img.paste(speaker, (1972, 28))
    # Popover: a seta original fica (é desenhada pelo Safari); o conteúdo é o popup novo.
    box = (822 - pop.width // 2, 114, 822 - pop.width // 2 + pop.width, 114 + pop.height)
    shadow(img, box, 30, 30, 140, 8)
    img.paste(pop, box[:2], rounded_mask(pop.size, 30))
    img.putalpha(alpha)
    return img


def main():
    assert os.path.exists(os.path.join(DIST, "popup/index.html")), "corre primeiro npm run build:safari"
    tmp = tempfile.mkdtemp(prefix="ts-raws-")
    try:
        shutil.copytree(DIST, tmp, dirs_exist_ok=True)
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=tmp))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        port = srv.server_address[1]
        ios = dict(touch=True, width=1272 / 3, scale=3, volumeSupported=False)
        pd = render(tmp, port, "ios-dark", dark=True, currentTime=23, **ios)
        pl = render(tmp, port, "ios-light", dark=False, currentTime=23, **ios)
        pi = render(tmp, port, "ipad", dark=True, touch=True, width=360, scale=2, currentTime=2, volumeSupported=False)
        pm = render(tmp, port, "mac", dark=True, touch=False, width=300, scale=2, currentTime=2,
                    volumeSupported=True, volumeEnabled=True, volume=0.8)
        srv.shutdown()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    page = Image.open(os.path.join(RAW, "iphone-page.png"))
    iphone(page, pd, True).save(os.path.join(RAW, "iphone-popup-dark.png"))
    iphone(page, pl, False).save(os.path.join(RAW, "iphone-popup-light.png"))
    ipad_page = Image.open(os.path.join(RAW, "ipad-page.png"))
    ipad(ipad_page, pi).save(os.path.join(RAW, "ipad-popup.png"))
    bar = ipad_page.convert("RGBA").crop((380, 1420, 1690, 1520))
    mac(Image.open(os.path.join(RAW, "mac-safari-base.png")).convert("RGBA"), pm, bar).save(os.path.join(RAW, "mac-safari-popup.png"))
    print("ok")


if __name__ == "__main__":
    main()
