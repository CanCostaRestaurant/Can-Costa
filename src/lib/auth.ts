// Sesión con cookie firmada (HMAC-SHA256 vía Web Crypto: funciona en Edge y
// Node). El token lleva el usuario y su rol; los tokens antiguos (solo
// expiración) siguen valiendo como admin para no cerrar sesiones abiertas.

const encoder = new TextEncoder();

const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export type RolUsuario = "admin" | "documentos" | "gestor" | "chef" | "tpv";

export type Sesion = { ok: true; nombre: string; rol: RolUsuario } | { ok: false };

const ROLES: RolUsuario[] = ["admin", "documentos", "gestor", "chef", "tpv"];

function aBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textoABase64Url(texto: string): string {
  return aBase64Url(encoder.encode(texto).buffer as ArrayBuffer);
}

function base64UrlATexto(b64: string): string | null {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
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

// Hash de contraseñas de usuarios (HMAC con el secreto del servidor como sal).
export async function hashContrasena(contrasena: string, secreto: string): Promise<string> {
  return firmar(`pwd:${contrasena}`, secreto);
}

export async function crearToken(
  secreto: string,
  usuario: { nombre: string; rol: RolUsuario } = { nombre: "Propietario", rol: "admin" },
): Promise<string> {
  const expira = String(Date.now() + DURACION_SESION_MS);
  const datos = `${expira}.${textoABase64Url(usuario.nombre)}.${usuario.rol}`;
  return `${datos}.${await firmar(datos, secreto)}`;
}

export async function verificarSesion(token: string | undefined, secreto: string): Promise<Sesion> {
  if (!token) return { ok: false };
  const partes = token.split(".");

  // Formato antiguo (expira.firma): sesión de admin previa al sistema de roles.
  if (partes.length === 2) {
    const [expira, firma] = partes;
    if (!/^\d+$/.test(expira) || Number(expira) < Date.now()) return { ok: false };
    if ((await firmar(expira, secreto)) !== firma) return { ok: false };
    return { ok: true, nombre: "Propietario", rol: "admin" };
  }

  if (partes.length !== 4) return { ok: false };
  const [expira, nombreB64, rol, firma] = partes;
  if (!/^\d+$/.test(expira) || Number(expira) < Date.now()) return { ok: false };
  if (!ROLES.includes(rol as RolUsuario)) return { ok: false };
  const datos = `${expira}.${nombreB64}.${rol}`;
  if ((await firmar(datos, secreto)) !== firma) return { ok: false };
  const nombre = base64UrlATexto(nombreB64);
  if (nombre === null) return { ok: false };
  return { ok: true, nombre, rol: rol as RolUsuario };
}

export async function verificarToken(token: string | undefined, secreto: string): Promise<boolean> {
  return (await verificarSesion(token, secreto)).ok;
}

export const COOKIE_SESION = "cc_sesion";
