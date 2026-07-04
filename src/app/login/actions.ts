"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { COOKIE_SESION, crearToken, hashContrasena, type RolUsuario } from "@/lib/auth";
import { conPlazo, getDb, schema } from "@/lib/db";

// Login con usuario + contraseña: se busca el usuario por nombre (sin
// distinguir mayúsculas ni acentos) y se comprueba su contraseña. La
// contraseña maestra (AUTH_PASSWORD) sigue entrando como admin sea cual
// sea el usuario tecleado — es la llave del propietario.
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export async function iniciarSesion(
  _anterior: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const usuarioTxt = String(formData.get("usuario") ?? "");
  const contrasena = String(formData.get("contrasena") ?? "");
  const esperada = process.env.AUTH_PASSWORD;
  const secreto = process.env.AUTH_SECRET;
  if (!esperada || !secreto) {
    return { error: "El login no está configurado en el servidor (AUTH_PASSWORD / AUTH_SECRET)" };
  }

  let usuario: { nombre: string; rol: RolUsuario } | null = null;

  // 1) Usuario de la tabla: nombre + su contraseña.
  const db = getDb();
  if (db && usuarioTxt.trim() && contrasena) {
    try {
      const hash = await hashContrasena(contrasena, secreto);
      const filas = await conPlazo(
        db
          .select({ nombre: schema.usuarios.nombre, rol: schema.usuarios.rol, contrasena: schema.usuarios.contrasena })
          .from(schema.usuarios)
          .where(eq(schema.usuarios.activo, true)),
      );
      const buscado = normalizarNombre(usuarioTxt);
      const fila = filas.find((f) => normalizarNombre(f.nombre) === buscado && f.contrasena === hash);
      if (fila) usuario = { nombre: fila.nombre, rol: fila.rol };
    } catch (e) {
      console.error("[login] consulta de usuarios falló:", e instanceof Error ? e.message : e);
    }
  }

  // 2) Contraseña maestra del propietario: admin con el nombre que teclee.
  if (!usuario && contrasena === esperada) {
    usuario = { nombre: usuarioTxt.trim() || "Propietario", rol: "admin" };
  }

  if (!usuario) {
    await new Promise((r) => setTimeout(r, 500)); // frenar fuerza bruta
    return { error: "Usuario o contraseña incorrectos" };
  }

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, await crearToken(secreto, usuario), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  // Cada rol aterriza en su pantalla (la tablet, directa al TPV a cobrar).
  const INICIO: Record<typeof usuario.rol, string> = {
    admin: "/",
    gestor: "/dashboard",
    documentos: "/documentos",
    chef: "/escandallos",
    tpv: "/tpv",
  };
  redirect(INICIO[usuario.rol]);
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  almacen.delete(COOKIE_SESION);
  redirect("/login");
}
