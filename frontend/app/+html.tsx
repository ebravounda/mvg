// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * +html.tsx — Personaliza el <html> root para web (PWA).
 * Inyecta meta tags + manifest + service worker para que la app sea
 * instalable como PWA y compatible con pwabuilder.com.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es-CL" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no"
        />

        {/* PWA core */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0B1121" />
        <meta name="application-name" content="MVG Computación" />
        <meta
          name="description"
          content="MVG Computación · Gestión de órdenes de servicio técnico, pin pads, inventario, costos y rutas para terreno."
        />

        {/* iOS install */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MVG" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />

        {/* Favicons */}
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.png" />

        {/* MS Tile */}
        <meta name="msapplication-TileColor" content="#0B1121" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />

        <title>MVG Computación</title>

        <ScrollViewStyleReset />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { background-color: #0B1121; color: #fff; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              ::selection { background: #6366F1; color: #fff; }
            `,
          }}
        />

        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker
                    .register('/sw.js', { scope: '/' })
                    .catch(function(err) { console.warn('SW register error', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
