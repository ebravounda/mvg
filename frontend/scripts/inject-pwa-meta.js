#!/usr/bin/env node
/* eslint-disable */
/**
 * Post-build: inyecta tags PWA en dist/index.html.
 * Expo con output:"single" no aplica +html.tsx, así que parcheamos el HTML
 * después del `expo export`.
 */
const fs = require("fs");
const path = require("path");

// Permite override via variable de entorno (usado por Docker) o argumento CLI
const distArg = process.argv.slice(2).find((a) => a.startsWith("--dist="));
const envDist = process.env.PWA_DIST_DIR;
const distDir = distArg
  ? distArg.replace("--dist=", "")
  : envDist || path.resolve(__dirname, "..", "dist");

const htmlPath = path.join(distDir, "index.html");
console.log("[inject-pwa] Patching", htmlPath);
if (!fs.existsSync(htmlPath)) {
  console.error("[inject-pwa] No existe:", htmlPath);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf8");

const injectHead = `
  <!-- PWA (inyectado por scripts/inject-pwa-meta.js) -->
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#0B1121" />
  <meta name="background-color" content="#000000" />
  <meta name="application-name" content="MVG Computación" />
  <meta name="description" content="MVG Computación · Gestión de órdenes de servicio técnico, pin pads, inventario, costos y rutas para terreno." />

  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="MVG" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />

  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="shortcut icon" href="/favicon.png" />

  <meta name="msapplication-TileColor" content="#0B1121" />
  <meta name="msapplication-TileImage" content="/icon-192.png" />
`.trim();

const injectBodyEnd = `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .catch(function(err) { console.warn('SW register error', err); });
      });
    }
  </script>
`.trim();

// Remove Expo's default <link rel="icon" href="/favicon.ico" /> (we replace with .png)
html = html.replace(/<link rel="icon"[^>]*favicon\.ico[^>]*\/?>\s*/g, "");
// Remove Expo's auto-injected theme-color and description so we control them
html = html.replace(/<meta name="theme-color"[^>]*\/?>\s*/g, "");
html = html.replace(/<meta name="description"[^>]*\/?>\s*/g, "");

// Inject before </head>
if (!html.includes('rel="manifest"')) {
  html = html.replace("</head>", `${injectHead}\n</head>`);
}
// Inject SW script before </body>
if (!html.includes("navigator.serviceWorker.register")) {
  html = html.replace("</body>", `  ${injectBodyEnd}\n</body>`);
}

// Set lang="es-CL"
html = html.replace(/<html([^>]*)>/, (match, attrs) => {
  if (/lang=/.test(attrs)) return `<html${attrs.replace(/lang="[^"]*"/, 'lang="es-CL"')}>`;
  return `<html${attrs} lang="es-CL">`;
});

fs.writeFileSync(htmlPath, html, "utf8");
console.log("[inject-pwa] index.html parcheado con tags PWA ✓");
