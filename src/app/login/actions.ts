"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { COOKIE_SESION, crearToken, hashContrasena } from "@/lib/auth";
import { conPlazo, getDb, schema } from "@/lib/db";

// Cada usuario tiene su propia contraseña (como un PIN): con ella se sabe
// quién entra y con qué rol. La contraseña maestra (AUTH_PASSWORD) sigue
// siendo la del propietario (admin).
export async function iniciarSesion(
  _anterior: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const contrasena = String(formData.get("contrasena") ?? "");
  const esperada = process.env.AUTH_PASSWORD;
  const secreto = process.env.AUTH_SECRET;
  if (!esperada || !secreto) {
    return { error: "El login no está configurado en el servidor (AUTH_PASSWORD / AUTH_SECRET)" };
  }

  let usuario: { nombre: string; rol: "admin" | "documentos" | "gestor" | "chef" } | null = null;
  if (contrasena === esperada) {
    usuario = { nombre: "Propietario", rol: "admin" };
  } else {
    const db = getDb();
    if (db && contrasena) {
      try {
        const hash = await hashContrasena(contrasena, secreto);
        const [fila] = await conPlazo(
          db
            .select({ nombre: schema.usuarios.nombre, rol: schema.usuarios.rol })
            .from(schema.usuarios)
            .where(and(eq(schema.usuarios.contrasena, hash), eq(schema.usuarios.activo, true))),
        );
        if (fila) usuario = { nombre: fila.nombre, rol: fila.rol };
      } catch (e) {
        console.error("[login] consulta de usuarios falló:", e instanceof Error ? e.message : e);
      }
    }
  }

  if (!usuario) {
    await new Promise((r) => setTimeout(r, 500)); // frenar fuerza bruta
    return { error: "Contraseña incorrecta" };
  }

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, await crearToken(secreto, usuario), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  redirect("/");
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  almacen.delete(COOKIE_SESION);
  redirect("/login");
}
