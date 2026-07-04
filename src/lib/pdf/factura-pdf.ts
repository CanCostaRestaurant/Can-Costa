// Generador del PDF de una factura de venta, sin dependencias: escribe el
// PDF a mano (A4, Helvetica estándar, codificación WinAnsi para acentos y €).
// Mismo layout que la vista /facturacion/[id]: emisor + nº, cliente, líneas
// y totales. Devuelve un Buffer listo para adjuntar al correo o descargar.
import { type FacturaVenta } from "@/lib/db/queries";

const A4_ANCHO = 595.28;
const A4_ALTO = 841.89;
const MARGEN = 50;

// Anchuras Helvetica / Helvetica-Bold (milésimas de em, AFM estándar) para
// poder alinear a la derecha los importes. Caracteres fuera de tabla → 556.
const ANCHOS_REGULAR: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, "€": 556,
};
const ANCHOS_NEGRITA: Record<string, number> = {
  ...ANCHOS_REGULAR,
  "!": 333, '"': 474, "'": 238, ":": 333, ";": 333, "?": 611, "@": 975,
  A: 722, B: 722, J: 556, K: 722, L: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278,
  j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389,
  s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};

function anchoTexto(texto: string, tam: number, negrita: boolean): number {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS_REGULAR;
  let suma = 0;
  for (const ch of texto) suma += tabla[ch] ?? 556;
  return (suma / 1000) * tam;
}

// WinAnsi (cp1252): latin-1 directo + los especiales del rango 0x80-0x9F.
const CP1252_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99,
};

function escaparWinAnsi(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    const cod = CP1252_EXTRA[ch] ?? ch.charCodeAt(0);
    const byte = cod <= 0xff ? cod : 0x3f; // fuera de WinAnsi → "?"
    if (byte === 0x5c) salida += "\\\\";
    else if (byte === 0x28) salida += "\\(";
    else if (byte === 0x29) salida += "\\)";
    else salida += String.fromCharCode(byte);
  }
  return salida;
}

function eurTexto(n: number): string {
  const txt = n.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  });
  return `${txt} €`;
}

// Acumula los operadores de contenido de una página.
class Pagina {
  ops = "";

  texto(
    x: number,
    y: number, // y desde ARRIBA de la página (se convierte a coordenadas PDF)
    texto: string,
    opciones: { tam?: number; negrita?: boolean; gris?: boolean; alinear?: "izq" | "der" } = {},
  ) {
    const tam = opciones.tam ?? 10;
    const negrita = opciones.negrita ?? false;
    const xReal = opciones.alinear === "der" ? x - anchoTexto(texto, tam, negrita) : x;
    const color = opciones.gris ? "0.42 0.4 0.37 rg" : "0.11 0.09 0.09 rg";
    this.ops += `BT /${negrita ? "F2" : "F1"} ${tam} Tf ${color} ${xReal.toFixed(2)} ${(A4_ALTO - y).toFixed(2)} Td (${escaparWinAnsi(texto)}) Tj ET\n`;
  }

  linea(x1: number, y1: number, x2: number, y2: number, opciones: { grosor?: number; gris?: boolean } = {}) {
    const color = opciones.gris ? "0.85 0.83 0.79 RG" : "0.11 0.09 0.09 RG";
    this.ops += `${(opciones.grosor ?? 0.7).toFixed(2)} w ${color} ${x1.toFixed(2)} ${(A4_ALTO - y1).toFixed(2)} m ${x2.toFixed(2)} ${(A4_ALTO - y2).toFixed(2)} l S\n`;
  }
}

// Ensambla el fichero PDF (catálogo + páginas + fuentes + streams + xref).
function ensamblarPdf(paginas: Pagina[]): Buffer {
  const objetos: string[] = [];
  const idsPaginas = paginas.map((_, i) => 5 + i * 2); // página, contenido, página, ...

  objetos.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  objetos.push(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`); // 2
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4

  for (const p of paginas) {
    const idContenido = objetos.length + 2; // el stream va justo después de la página
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_ANCHO} ${A4_ALTO}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`,
    );
    const bytes = Buffer.byteLength(p.ops, "latin1");
    objetos.push(`<< /Length ${bytes} >>\nstream\n${p.ops}endstream`);
  }

  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(cuerpo, "latin1"));
    cuerpo += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(cuerpo, "latin1");
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) cuerpo += `${String(off).padStart(10, "0")} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

  return Buffer.from(cuerpo, "latin1");
}

// Recorta una descripción para que quepa en su columna (añade "…" si se pasa).
function recortar(texto: string, anchoMax: number, tam: number): string {
  if (anchoTexto(texto, tam, false) <= anchoMax) return texto;
  let corto = texto;
  while (corto.length > 1 && anchoTexto(corto + "…", tam, false) > anchoMax) corto = corto.slice(0, -1);
  return corto.trimEnd() + "…";
}

export function generarPdfFactura(f: FacturaVenta): Buffer {
  const paginas: Pagina[] = [];
  let pag = new Pagina();
  paginas.push(pag);

  const DER = A4_ANCHO - MARGEN; // borde derecho útil
  const COL_CANT = 385;
  const COL_PRECIO = 470;

  // ── Cabecera: emisor a la izquierda, nº de factura a la derecha ──
  let y = MARGEN + 18;
  pag.texto(MARGEN, y, f.local.nombre, { tam: 19, negrita: true });
  pag.texto(DER, y - 8, "FACTURA", { tam: 9, gris: true, alinear: "der" });
  pag.texto(DER, y + 10, f.numero, { tam: 16, negrita: true, alinear: "der" });
  pag.texto(DER, y + 24, f.fechaLegible, { tam: 10, gris: true, alinear: "der" });

  y += 16;
  if (f.local.cif) { pag.texto(MARGEN, y, `CIF ${f.local.cif}`, { tam: 9.5, gris: true }); y += 12.5; }
  if (f.local.direccion) { pag.texto(MARGEN, y, f.local.direccion, { tam: 9.5, gris: true }); y += 12.5; }
  if (f.local.telefono) { pag.texto(MARGEN, y, `Tel ${f.local.telefono}`, { tam: 9.5, gris: true }); y += 12.5; }

  y = Math.max(y, MARGEN + 60) + 12;
  pag.linea(MARGEN, y, DER, y, { gris: true });

  // ── Cliente ──
  y += 22;
  pag.texto(MARGEN, y, "FACTURAR A", { tam: 8, gris: true });
  y += 15;
  pag.texto(MARGEN, y, f.cliente.nombre, { tam: 12, negrita: true });
  y += 14;
  if (f.cliente.cif) { pag.texto(MARGEN, y, `NIF ${f.cliente.cif}`, { tam: 9.5, gris: true }); y += 12.5; }
  if (f.cliente.direccion) { pag.texto(MARGEN, y, f.cliente.direccion, { tam: 9.5, gris: true }); y += 12.5; }

  // ── Tabla de líneas ──
  y += 16;
  pag.texto(MARGEN, y, "CONCEPTO", { tam: 8, gris: true });
  pag.texto(COL_CANT, y, "CANT.", { tam: 8, gris: true, alinear: "der" });
  pag.texto(COL_PRECIO, y, "PRECIO", { tam: 8, gris: true, alinear: "der" });
  pag.texto(DER, y, "IMPORTE", { tam: 8, gris: true, alinear: "der" });
  y += 6;
  pag.linea(MARGEN, y, DER, y);

  for (const l of f.lineas) {
    // Salto de página si no queda sitio (deja hueco para los totales).
    if (y > A4_ALTO - 170) {
      pag = new Pagina();
      paginas.push(pag);
      y = MARGEN + 10;
    }
    y += 17;
    pag.texto(MARGEN, y, recortar(l.descripcion, COL_CANT - MARGEN - 40, 10));
    pag.texto(COL_CANT, y, String(l.cantidad), { alinear: "der", gris: true });
    pag.texto(COL_PRECIO, y, eurTexto(l.precioUnitario), { alinear: "der", gris: true });
    pag.texto(DER, y, eurTexto(l.total), { alinear: "der", negrita: true });
    y += 5.5;
    pag.linea(MARGEN, y, DER, y, { grosor: 0.4, gris: true });
  }

  // ── Totales ──
  const X_ETIQ = 380;
  y += 24;
  pag.texto(X_ETIQ, y, "Base imponible", { gris: true });
  pag.texto(DER, y, eurTexto(f.base), { alinear: "der" });
  y += 15;
  pag.texto(X_ETIQ, y, `IVA ${f.ivaPct}%`, { gris: true });
  pag.texto(DER, y, eurTexto(f.iva), { alinear: "der" });
  y += 9;
  pag.linea(X_ETIQ, y, DER, y);
  y += 17;
  pag.texto(X_ETIQ, y, "TOTAL", { tam: 13, negrita: true });
  pag.texto(DER, y, eurTexto(f.total), { tam: 13, negrita: true, alinear: "der" });

  // ── Pie ──
  const yPie = A4_ALTO - MARGEN;
  pag.linea(MARGEN, yPie - 14, DER, yPie - 14, { grosor: 0.4, gris: true });
  pag.texto(MARGEN, yPie, `Factura emitida por ${f.local.nombre}. Conserve este documento como justificante.`, {
    tam: 8.5,
    gris: true,
  });

  return ensamblarPdf(paginas);
}

// Nombre de fichero seguro: "factura-2026-0001.pdf".
export function nombrePdfFactura(numero: string): string {
  return `factura-${numero.replaceAll("/", "-")}.pdf`;
}
