/**
 * Generate extension icons as simple SVG files, then convert to PNG.
 * We create SVG files that can be opened in browser to verify.
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, "../public/icons");
mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 32, 48, 128];

function createSvg(size) {
  const pad = Math.round(size * 0.1);
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#e94560"/>
      <stop offset="100%" style="stop-color:#c23152"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${Math.round(s * 0.2)}" fill="url(#bg)"/>
  <g transform="translate(${pad}, ${pad}) scale(${(s - pad * 2) / 24})" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </g>
</svg>`;
}

for (const size of sizes) {
  const svg = createSvg(size);
  writeFileSync(resolve(iconsDir, `icon-${size}.svg`), svg);
  console.log(`Created icon-${size}.svg`);
}

console.log(
  "\nSVG icons created. To convert to PNG, you can use any SVG-to-PNG tool."
);
console.log(
  "For Chrome/Firefox extensions, SVG icons in manifest.json also work if renamed to .png is not required."
);
