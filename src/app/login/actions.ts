"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION, crearToken } from "@/lib/auth";

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
  if (contrasena !== esperada) {
    await new Promise((r) => setTimeout(r, 500)); // frenar fuerza bruta
    return { error: "Contraseña incorrecta" };
  }

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, await crearToken(secreto), {
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
