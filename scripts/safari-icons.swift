// Gera os ícones da app Safari (iOS + macOS) a partir do desenho do ícone da
// extensão (public/icons/icon-16.svg: moldura laranja, fundo escuro, 3 barras).
//   swift scripts/safari-icons.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let appset = root.appendingPathComponent("safari/Shared (App)/Assets.xcassets/AppIcon.appiconset")
let large = root.appendingPathComponent("safari/Shared (App)/Assets.xcassets/LargeIcon.imageset")
let resources = root.appendingPathComponent("safari/Shared (App)/Resources")

let orange = CGColor(red: 0xEC / 255, green: 0x77 / 255, blue: 0x38 / 255, alpha: 1)
let yellow = CGColor(red: 1, green: 0xBE / 255, blue: 0x0B / 255, alpha: 1)
let dark = CGColor(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0F / 255, alpha: 1)

/// Desenha o ícone num quadrado `rect` (grelha de 16 unidades, como o SVG).
/// fullBleed: fundo laranja até às bordas (o iOS recorta os cantos).
func drawIcon(_ ctx: CGContext, _ rect: CGRect, fullBleed: Bool, outerRadius: CGFloat) {
  let u = rect.width / 16
  func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
    // y do SVG cresce para baixo; o CoreGraphics para cima.
    CGRect(x: rect.minX + x * u, y: rect.maxY - (y + h) * u, width: w * u, height: h * u)
  }
  ctx.setFillColor(orange)
  if fullBleed {
    ctx.fill(rect)
  } else {
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: outerRadius, cornerHeight: outerRadius, transform: nil))
    ctx.fillPath()
  }
  let inset: CGFloat = 1
  let inner = r(inset, inset, 16 - 2 * inset, 16 - 2 * inset)
  let innerRadius = max(outerRadius - inset * u, u)
  ctx.setFillColor(dark)
  ctx.addPath(CGPath(roundedRect: inner, cornerWidth: innerRadius, cornerHeight: innerRadius, transform: nil))
  ctx.fillPath()
  for (bar, color) in [(r(7, 3, 2, 10), orange), (r(4, 5, 2, 6), yellow), (r(10, 4, 2, 8), yellow)] {
    ctx.setFillColor(color)
    ctx.addPath(CGPath(roundedRect: bar, cornerWidth: 0.5 * u, cornerHeight: 0.5 * u, transform: nil))
    ctx.fillPath()
  }
}

func png(_ size: Int, opaque: Bool, _ draw: (CGContext, CGFloat) -> Void) -> Data {
  let cs = CGColorSpace(name: CGColorSpace.sRGB)!
  let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: info)!
  ctx.interpolationQuality = .high
  ctx.setShouldAntialias(true)
  draw(ctx, CGFloat(size))
  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  return rep.representation(using: .png, properties: [:])!
}

// iOS / universal: 1024, opaco, até às bordas.
try png(1024, opaque: true) { ctx, s in
  drawIcon(ctx, CGRect(x: 0, y: 0, width: s, height: s), fullBleed: true, outerRadius: s * 0.2237)
}.write(to: appset.appendingPathComponent("universal-icon-1024@1x.png"))

// macOS: forma arredondada de 824/1024 com margem transparente e sombra leve.
func macIcon(_ px: Int) -> Data {
  png(px, opaque: false) { ctx, s in
    let shape = s * 824 / 1024
    let o = (s - shape) / 2
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.01), blur: s * 0.02, color: CGColor(gray: 0, alpha: 0.35))
    ctx.setFillColor(orange)
    ctx.addPath(CGPath(roundedRect: CGRect(x: o, y: o + s * 0.01, width: shape, height: shape), cornerWidth: shape * 0.225, cornerHeight: shape * 0.225, transform: nil))
    ctx.fillPath()
    ctx.restoreGState()
    drawIcon(ctx, CGRect(x: o, y: o + s * 0.01, width: shape, height: shape), fullBleed: false, outerRadius: shape * 0.225)
  }
}
for base in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    try macIcon(base * scale).write(to: appset.appendingPathComponent("mac-icon-\(base)@\(scale)x.png"))
  }
}

// Ícone grande da página da app (sem margem).
let shaped: (Int) -> Data = { px in
  png(px, opaque: false) { ctx, s in
    drawIcon(ctx, CGRect(x: 0, y: 0, width: s, height: s), fullBleed: false, outerRadius: s * 0.225)
  }
}
try shaped(256).write(to: large.appendingPathComponent("icon-128.png"))
try shaped(512).write(to: resources.appendingPathComponent("Icon.png"))
print("ícones gerados")
