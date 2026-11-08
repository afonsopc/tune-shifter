import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
} from "fs";

/**
 * Build target. `TARGET=safari` (npm run build:safari) writes to dist-safari/
 * with a Safari manifest: no Firefox-only keys, plus `scripting` so the popup
 * can inject the content script on sites the user hasn't allowed yet.
 */
const TARGET = process.env.TARGET === "safari" ? "safari" : "default";
const OUT_DIR = TARGET === "safari" ? "dist-safari" : "dist";

function buildManifest(): string {
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, "manifest.json"), "utf-8")
  );
  if (TARGET === "safari") {
    delete manifest.browser_specific_settings;
    manifest.permissions = [...new Set([...manifest.permissions, "scripting"])];
  }
  return JSON.stringify(manifest, null, 2) + "\n";
}

/**
 * Plugin to copy static assets (manifest.json, icons) into dist,
 * and fix the HTML output path and relative references.
 */
function copyExtensionFiles(): Plugin {
  return {
    name: "copy-extension-files",
    closeBundle() {
      const distDir = resolve(__dirname, OUT_DIR);

      // Write manifest.json for the current target
      writeFileSync(resolve(distDir, "manifest.json"), buildManifest());

      // Copy icons
      const iconsSource = resolve(__dirname, "public/icons");
      const iconsDest = resolve(distDir, "icons");
      mkdirSync(iconsDest, { recursive: true });
      if (existsSync(iconsSource)) {
        for (const file of readdirSync(iconsSource)) {
          if (file.endsWith(".png")) {
            copyFileSync(
              resolve(iconsSource, file),
              resolve(iconsDest, file)
            );
          }
        }
      }

      // Move HTML from dist/src/popup/index.html to dist/popup/index.html
      // and fix relative paths
      const srcHtml = resolve(distDir, "src/popup/index.html");
      const destDir = resolve(distDir, "popup");
      const destHtml = resolve(destDir, "index.html");
      mkdirSync(destDir, { recursive: true });

      if (existsSync(srcHtml)) {
        let html = readFileSync(srcHtml, "utf-8");
        // Fix paths: from dist/src/popup/ the refs are ../../popup/X
        // but from dist/popup/ they should be ./X
        html = html.replace(/(?:\.\.\/)*popup\//g, "./");
        writeFileSync(destHtml, html);
        // Clean up the misplaced src directory
        rmSync(resolve(distDir, "src"), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionFiles()],
  base: "./",
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        content: resolve(__dirname, "src/content/content.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") return "content/content.js";
          return "popup/[name].js";
        },
        chunkFileNames: "popup/chunks/[name].[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "popup/[name][extname]";
          return "assets/[name][extname]";
        },
      },
    },
  },
});
