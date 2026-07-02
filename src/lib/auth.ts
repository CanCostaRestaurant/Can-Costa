// Sesión con cookie firmada (HMAC-SHA256 vía Web Crypto: funciona en Edge y
// Node). Un solo usuario (el restaurante); si algún día hay varios, se migra
// a Supabase Auth sin tocar las pantallas.

const encoder = new TextEncoder();

const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function aBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firmar(datos: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return aBase64Url(await crypto.subtle.sign("HMAC", clave, encoder.encode(datos)));
}

export async function crearToken(secreto: string): Promise<string> {
  const expira = String(Date.now() + DURACION_SESION_MS);
  return `${expira}.${await firmar(expira, secreto)}`;
}

export async function verificarToken(token: string | undefined, secreto: string): Promise<boolean> {
  if (!token) return false;
  const [expira, firma] = token.split(".");
  if (!expira || !firma || !/^\d+$/.test(expira)) return false;
  if (Number(expira) < Date.now()) return false;
  return (await firmar(expira, secreto)) === firma;
}

export const COOKIE_SESION = "cc_sesion";
