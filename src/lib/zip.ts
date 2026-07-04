// Escritor de ZIP mínimo y sin dependencias (método STORE, sin compresión):
// cabecera local + datos por fichero, directorio central y fin de directorio.
// Suficiente para el export de la gestoría (PDFs pequeños + CSVs); nombres en
// UTF-8 (flag 0x0800).

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) crc = TABLA_CRC[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Fecha/hora en el formato MS-DOS que pide el ZIP (hora local de Madrid).
function fechaDos(): { fecha: number; hora: number } {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()); // "2026-07-04 18:30:12"
  const [f, h] = partes.split(" ");
  const [anio, mes, dia] = f.split("-").map(Number);
  const [hh, mm, ss] = h.split(":").map(Number);
  return {
    fecha: ((anio - 1980) << 9) | (mes << 5) | dia,
    hora: (hh << 11) | (mm << 5) | (ss >> 1),
  };
}

export type EntradaZip = { nombre: string; datos: Buffer };

export function crearZip(entradas: EntradaZip[]): Buffer {
  const { fecha, hora } = fechaDos();
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, "utf8");
    const crc = crc32(e.datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma cabecera local
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // flags: nombres UTF-8
    local.writeUInt16LE(0, 8); // método STORE
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.datos.length, 18); // comprimido = original (STORE)
    local.writeUInt32LE(e.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28); // extra

    locales.push(local, nombre, e.datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // firma directorio central
    central.writeUInt16LE(20, 4); // versión creadora
    central.writeUInt16LE(20, 6); // versión necesaria
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(fecha, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.datos.length, 20);
    central.writeUInt32LE(e.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    // extra(30)=0, comentario(32)=0, disco(34)=0, attrs int(36)=0, attrs ext(38)=0
    central.writeUInt32LE(offset, 42); // offset de la cabecera local

    centrales.push(central, nombre);
    offset += 30 + nombre.length + e.datos.length;
  }

  const cuerpoCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); // firma fin de directorio central
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cuerpoCentral.length, 12);
  fin.writeUInt32LE(offset, 16);
  // comentario (20) = 0

  return Buffer.concat([...locales, cuerpoCentral, fin]);
}
