// Genera TODOS los iconos de la marca (favicon, icon.svg y los PNG de las
// tres apps instalables) a partir de un único monograma dibujado en SVG.
// Si cambia el nombre del restaurante: cambia MONOGRAMA (trazos en un lienzo
// de 512) y vuelve a ejecutar:   node scripts/iconos/generar-iconos.mjs
//
// Renderiza con Chrome headless (Windows). Salidas:
//   src/app/icon.svg · src/app/favicon.ico (16/32/48)
//   public/icono-192|512.png · icono-maskable-512.png · apple-touch-icon.png      (brasa: TPV y comandero)
//   public/icono-cocina-192|512.png · icono-cocina-maskable-512.png · apple-touch-cocina.png (carbón: cocina)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

// "T7" de Taula 7: trazos de 56 px (el grosor de la antigua C), centrado en 256.
const MONOGRAMA = [
  "M92 116H232V172H190V396H134V172H92Z", // T
  "M270 116H420V172L344 396H284L360 172H270Z", // 7
].join("");

const PIELES = {
  // Brasa: degradado de ascua + filo cálido + monograma crema.
  brasa: {
    defs: `
      <linearGradient id="fondo" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#F26A3E"/><stop offset=".52" stop-color="#E8532F"/><stop offset="1" stop-color="#C33C1C"/>
      </linearGradient>
      <radialGradient id="brillo" cx="256" cy="205" r="300" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#FF9A66" stop-opacity=".55"/><stop offset="1" stop-color="#FF9A66" stop-opacity="0"/>
      </radialGradient>`,
    filo: { color: "#FFE1CC", opacidad: 0.38 },
    tinta: "#FBF1E8",
  },
  // Carbón: la pantalla de cocina (oscura) con el monograma en brasa.
  carbon: {
    defs: `
      <linearGradient id="fondo" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#3A2A22"/><stop offset="1" stop-color="#17120F"/>
      </linearGradient>
      <radialGradient id="brillo" cx="256" cy="230" r="300" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#6A321F" stop-opacity=".6"/><stop offset="1" stop-color="#6A321F" stop-opacity="0"/>
      </radialGradient>`,
    filo: { color: "#C2643F", opacidad: 0.45 },
    tinta: "#F26B3F",
  },
};

// redondo = azulejo con esquinas y filo (Android/escritorio); a sangre =
// cuadrado lleno (maskable e iOS, que recortan ellos). escala = tamaño del
// monograma dentro del icono (las maskable dejan margen de seguridad).
function svg(piel, { redondo, escala }) {
  const p = PIELES[piel];
  const forma = redondo ? `rx="116"` : "";
  const filo = redondo
    ? `<rect x="16" y="16" width="480" height="480" rx="102" fill="none" stroke="${p.filo.color}" stroke-opacity="${p.filo.opacidad}" stroke-width="4"/>`
    : "";
  const t = escala === 1 ? "" : ` transform="translate(256 256) scale(${escala}) translate(-256 -256)"`;
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>${p.defs}
  </defs>
  <rect width="512" height="512" ${forma} fill="url(#fondo)"/>
  <rect width="512" height="512" ${forma} fill="url(#brillo)"/>
  ${filo}
  <path d="${MONOGRAMA}" fill="${p.tinta}"${t}/>
</svg>
`;
}

const tmp = mkdtempSync(join(tmpdir(), "iconos-"));

function png(svgTexto, lado, destino) {
  const html = join(tmp, `i${lado}-${Math.random().toString(36).slice(2)}.html`);
  const cuerpo = svgTexto.replace('width="512" height="512"', `width="${lado}" height="${lado}"`);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${cuerpo}</body></html>`);
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--default-background-color=00000000",
    `--window-size=${lado},${lado}`,
    `--screenshot=${destino}`,
    pathToFileURL(html).href,
  ], { stdio: "ignore" });
  const b = readFileSync(destino);
  const ancho = b.readUInt32BE(16);
  const alto = b.readUInt32BE(20);
  if (ancho !== lado || alto !== lado) throw new Error(`${destino}: salió ${ancho}x${alto}, esperaba ${lado}x${lado}`);
  return b;
}

// ICO con las imágenes en PNG dentro (lo leen todos los navegadores actuales).
function ico(pngs) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(pngs.length, 4);
  const entradas = [];
  let desplazamiento = 6 + 16 * pngs.length;
  for (const { lado, datos } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(datos.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += datos.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecera, ...entradas, ...pngs.map((p) => p.datos)]);
}

const pub = (f) => join(RAIZ, "public", f);
try {
  const brasa = svg("brasa", { redondo: true, escala: 0.84 });
  writeFileSync(join(RAIZ, "src", "app", "icon.svg"), brasa);

  png(brasa, 192, pub("icono-192.png"));
  png(brasa, 512, pub("icono-512.png"));
  png(svg("brasa", { redondo: false, escala: 0.75 }), 512, pub("icono-maskable-512.png"));
  png(svg("brasa", { redondo: false, escala: 0.82 }), 180, pub("apple-touch-icon.png"));

  const carbon = svg("carbon", { redondo: true, escala: 0.84 });
  png(carbon, 192, pub("icono-cocina-192.png"));
  png(carbon, 512, pub("icono-cocina-512.png"));
  png(svg("carbon", { redondo: false, escala: 0.75 }), 512, pub("icono-cocina-maskable-512.png"));
  png(svg("carbon", { redondo: false, escala: 0.82 }), 180, pub("apple-touch-cocina.png"));

  const favicon = [16, 32, 48].map((lado) => ({ lado, datos: png(brasa, lado, join(tmp, `fav-${lado}.png`)) }));
  writeFileSync(join(RAIZ, "src", "app", "favicon.ico"), ico(favicon));
  console.log("Iconos generados.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
