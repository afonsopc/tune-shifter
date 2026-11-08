// Capturas da App Store a partir das capturas reais em safari/screenshots/raw/
// (Simulador iOS/iPadOS e Safari no macOS): fundo da marca, legenda e a captura.
//   swift scripts/safari-screenshots.swift
// Escreve safari/screenshots/<iphone|ipad|mac>/<pt-PT|en>/N.png nos tamanhos pedidos:
// iPhone 6,9" 1320x2868, iPad 13" 2064x2752, Mac 2880x1800.
import AppKit
import CoreText

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("safari/screenshots")
let raw = root.appendingPathComponent("raw")

func load(_ name: String) -> CGImage {
  let url = raw.appendingPathComponent(name)
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    fatalError("falta \(url.path)")
  }
  return img
}

/// Recorta em píxeis (origem no canto superior esquerdo, como nas capturas).
func crop(_ img: CGImage, _ x: Int, _ y: Int, _ w: Int, _ h: Int) -> CGImage {
  img.cropping(to: CGRect(x: x, y: y, width: w, height: h))!
}

let cs = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
  CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: a)
}

func canvas(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> CGImage {
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.interpolationQuality = .high
  // Fundo: quase preto quente com um brilho laranja em cima.
  let bg = CGGradient(colorsSpace: cs, colors: [color(0x241A14), color(0x121110)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: 0), options: [])
  let glow = CGGradient(colorsSpace: cs, colors: [color(0xEC7738, 0.35), color(0xEC7738, 0)] as CFArray, locations: [0, 1])!
  ctx.drawRadialGradient(glow, startCenter: CGPoint(x: CGFloat(w) * 0.5, y: CGFloat(h) * 1.02), startRadius: 0,
                         endCenter: CGPoint(x: CGFloat(w) * 0.5, y: CGFloat(h) * 1.02), endRadius: CGFloat(max(w, h)) * 0.6, options: [])
  draw(ctx)
  return ctx.makeImage()!
}

/// Texto centrado em `rect` (coordenadas do CoreGraphics, origem em baixo).
func text(_ ctx: CGContext, _ s: String, size: CGFloat, weight: NSFont.Weight, color c: CGColor, in rect: CGRect, align: CTTextAlignment = .center) {
  let font = NSFont.systemFont(ofSize: size, weight: weight)
  var al = align
  let settings = [CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: &al)]
  let para = CTParagraphStyleCreate(settings, settings.count)
  let attr = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: NSColor(cgColor: c)!, .paragraphStyle: para])
  let fs = CTFramesetterCreateWithAttributedString(attr)
  let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), CGPath(rect: rect, transform: nil), nil)
  CTFrameDraw(frame, ctx)
}

/// Desenha a imagem com cantos arredondados e sombra, ajustada a `box` (mantém proporções).
@discardableResult
func place(_ ctx: CGContext, _ img: CGImage, in box: CGRect, radius: CGFloat, border: Bool = true) -> CGRect {
  let s = min(box.width / CGFloat(img.width), box.height / CGFloat(img.height))
  let w = CGFloat(img.width) * s, h = CGFloat(img.height) * s
  let r = CGRect(x: box.midX - w / 2, y: box.maxY - h, width: w, height: h)
  let path = CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -radius * 0.25), blur: radius * 1.2, color: color(0x000000, 0.55))
  ctx.addPath(path); ctx.setFillColor(color(0x000000)); ctx.fillPath()
  ctx.restoreGState()
  ctx.saveGState()
  ctx.addPath(path); ctx.clip()
  ctx.draw(img, in: r)
  ctx.restoreGState()
  if border {
    ctx.addPath(path); ctx.setStrokeColor(color(0xFFFFFF, 0.12)); ctx.setLineWidth(max(2, radius * 0.04)); ctx.strokePath()
  }
  return r
}

func save(_ img: CGImage, _ rel: String) {
  let url = root.appendingPathComponent(rel)
  try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
  print(rel, img.width, "x", img.height)
}

struct Caption { let title: String; let sub: String }
let captions: [String: [Caption]] = [
  "pt-PT": [
    Caption(title: "Velocidade, reverb e tom", sub: "Em qualquer áudio ou vídeo no Safari"),
    Caption(title: "Sempre à mão", sub: "Abre a partir do menu do Safari"),
    Caption(title: "Liga em poucos passos", sub: "A app explica tudo, sem contas nem anúncios"),
  ],
  "en": [
    Caption(title: "Speed, reverb and pitch", sub: "On any audio or video in Safari"),
    Caption(title: "Always within reach", sub: "Open it right from Safari's menu"),
    Caption(title: "Set up in a few steps", sub: "No accounts, no ads"),
  ],
]

/// Ecrã vertical (iPhone / iPad): legenda em cima, captura por baixo.
func portrait(_ w: Int, _ h: Int, _ shot: CGImage, _ c: Caption, radius: CGFloat) -> CGImage {
  canvas(w, h) { ctx in
    let W = CGFloat(w), H = CGFloat(h)
    let titleSize = W * 0.068
    text(ctx, c.title, size: titleSize, weight: .bold, color: color(0xF2EFE9), in: CGRect(x: W * 0.06, y: H - H * 0.115, width: W * 0.88, height: titleSize * 1.3))
    text(ctx, c.sub, size: titleSize * 0.5, weight: .medium, color: color(0xE0A458), in: CGRect(x: W * 0.06, y: H - H * 0.115 - titleSize * 1.05, width: W * 0.88, height: titleSize * 0.9))
    place(ctx, shot, in: CGRect(x: W * 0.1, y: -H * 0.02, width: W * 0.8, height: H * 0.8), radius: radius)
  }
}

/// Mac (horizontal): legenda à esquerda, captura à direita.
func landscape(_ shot: CGImage, _ c: Caption) -> CGImage {
  canvas(2880, 1800) { ctx in
    text(ctx, c.title, size: 112, weight: .bold, color: color(0xF2EFE9), in: CGRect(x: 160, y: 900, width: 1000, height: 300), align: .left)
    text(ctx, c.sub, size: 56, weight: .medium, color: color(0xE0A458), in: CGRect(x: 160, y: 700, width: 1000, height: 200), align: .left)
    place(ctx, shot, in: CGRect(x: 1260, y: 180, width: 1460, height: 1440), radius: 36)
  }
}

let iphonePopupFull = load("iphone-popup-full.png")
let iphonePopupHalf = load("iphone-popup-half.png")
// O popup do Tune Shifter (sem a folha do Safari), para o iPad.
let popupCard = crop(iphonePopupFull, 30, 450, 1260, 1540)
let ipadPage = load("ipad-page.png")
// iPad: popover do Tune Shifter por baixo do ícone das extensões, sobre a página real.
let ipadSafari = canvas(2064, 2752) { ctx in
  ctx.draw(ipadPage, in: CGRect(x: 0, y: 0, width: 2064, height: 2752))
  let w: CGFloat = 840, h = w * CGFloat(popupCard.height) / CGFloat(popupCard.width)
  let box = CGRect(x: 1290 - w / 2, y: 2752 - 190 - h, width: w, height: h)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 60, color: color(0x000000, 0.6))
  ctx.addPath(CGPath(roundedRect: box, cornerWidth: 36, cornerHeight: 36, transform: nil)); ctx.setFillColor(color(0x1A1815)); ctx.fillPath()
  ctx.restoreGState()
  ctx.saveGState()
  ctx.addPath(CGPath(roundedRect: box, cornerWidth: 36, cornerHeight: 36, transform: nil)); ctx.clip()
  ctx.draw(popupCard, in: box)
  ctx.restoreGState()
}
// Mac: o popover do Safari recortado da captura real.
let macPopup = crop(load("mac-safari-popup.png"), 480, 124, 694, 1042)
let macApp = load("mac-app-pt.png")

for (loc, cap) in captions {
  let iphoneApp = load("iphone-app-\(loc == "pt-PT" ? "pt" : "en").png")
  let ipadApp = load("ipad-app-\(loc == "pt-PT" ? "pt" : "en").png")
  save(portrait(1320, 2868, iphonePopupFull, cap[0], radius: 90), "iphone/\(loc)/1.png")
  save(portrait(1320, 2868, iphonePopupHalf, cap[1], radius: 90), "iphone/\(loc)/2.png")
  save(portrait(1320, 2868, iphoneApp, cap[2], radius: 90), "iphone/\(loc)/3.png")
  save(portrait(2064, 2752, ipadSafari, cap[0], radius: 50), "ipad/\(loc)/1.png")
  save(portrait(2064, 2752, ipadApp, cap[2], radius: 50), "ipad/\(loc)/2.png")
  save(landscape(macPopup, cap[0]), "mac/\(loc)/1.png")
  if loc == "pt-PT" { save(landscape(macApp, cap[2]), "mac/\(loc)/2.png") }
}
