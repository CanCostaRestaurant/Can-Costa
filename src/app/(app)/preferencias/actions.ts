"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { hashContrasena, type RolUsuario } from "@/lib/auth";

type Resultado = { ok: boolean; error?: string };

const MAX_USUARIOS = 7; // como haddock

const ROLES: RolUsuario[] = ["admin", "documentos", "gestor", "chef"];

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[preferencias] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo" };
}

export async function guardarAjustes(datos: {
  conIva?: boolean;
  ventasConTotal?: boolean;
  ivaVentasPct?: number;
  toleranciaConciliacion?: number;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.conIva !== undefined) set.conIva = datos.conIva;
  if (datos.ventasConTotal !== undefined) set.ventasConTotal = datos.ventasConTotal;
  if (datos.ivaVentasPct !== undefined) {
    if (!Number.isFinite(datos.ivaVentasPct) || datos.ivaVentasPct < 0 || datos.ivaVentasPct > 50) {
      return { ok: false, error: "El IVA debe estar entre 0 y 50%" };
    }
    set.ivaVentasPct = datos.ivaVentasPct.toFixed(2);
  }
  if (datos.toleranciaConciliacion !== undefined) {
    if (!Number.isFinite(datos.toleranciaConciliacion) || datos.toleranciaConciliacion < 0) {
      return { ok: false, error: "Tolerancia no válida" };
    }
    set.toleranciaConciliacion = datos.toleranciaConciliacion.toFixed(2);
  }

  try {
    await conPlazo(db.update(schema.ajustes).set(set).where(eq(schema.ajustes.id, 1)));
    revalidatePath("/preferencias");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fallo("guardarAjustes", e);
  }
}

export async function crearUsuario(datos: {
  nombre: string;
  rol: RolUsuario;
  contrasena: string;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return { ok: false, error: "Falta AUTH_SECRET en el servidor" };

  if (!datos.nombre.trim()) return { ok: false, error: "Pon el nombre del usuario" };
  if (!ROLES.includes(datos.rol)) return { ok: false, error: "Rol no válido" };
  if (datos.contrasena.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };
  if (datos.contrasena === process.env.AUTH_PASSWORD) {
    return { ok: false, error: "Esa contraseña ya la usa el propietario: elige otra" };
  }

  try {
    const existentes = await conPlazo(db.select().from(schema.usuarios));
    if (existentes.length >= MAX_USUARIOS) {
      return { ok: false, error: `Máximo ${MAX_USUARIOS} usuarios` };
    }
    // La contraseña identifica al usuario en el login: debe ser única.
    const hash = await hashContrasena(datos.contrasena, secreto);
    if (existentes.some((u) => u.contrasena === hash)) {
      return { ok: false, error: "Esa contraseña ya la usa otro usuario: elige otra" };
    }
    await conPlazo(
      db.insert(schema.usuarios).values({ nombre: datos.nombre.trim(), rol: datos.rol, contrasena: hash }),
    );
    revalidatePath("/preferencias");
    return { ok: true };
  } catch (e) {
    return fallo("crearUsuario", e);
  }
}

export async function actualizarUsuario(
  id: string,
  datos: { rol?: RolUsuario; activo?: boolean; contrasena?: string },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return { ok: false, error: "Falta AUTH_SECRET en el servidor" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.rol !== undefined) {
    if (!ROLES.includes(datos.rol)) return { ok: false, error: "Rol no válido" };
    set.rol = datos.rol;
  }
  if (datos.activo !== undefined) set.activo = datos.activo;
  if (datos.contrasena !== undefined) {
    if (datos.contrasena.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };
    if (datos.contrasena === process.env.AUTH_PASSWORD) {
      return { ok: false, error: "Esa contraseña ya la usa el propietario: elige otra" };
    }
    const hash = await hashContrasena(datos.contrasena, secreto);
    try {
      const [choque] = await conPlazo(
        db
          .select()
          .from(schema.usuarios)
          .where(and(eq(schema.usuarios.contrasena, hash), ne(schema.usuarios.id, id))),
      );
      if (choque) return { ok: false, error: "Esa contraseña ya la usa otro usuario: elige otra" };
    } catch (e) {
      return fallo("actualizarUsuario", e);
    }
    set.contrasena = hash;
  }

  try {
    await conPlazo(db.update(schema.usuarios).set(set).where(eq(schema.usuarios.id, id)));
    revalidatePath("/preferencias");
    return { ok: true };
  } catch (e) {
    return fallo("actualizarUsuario", e);
  }
}

export async function eliminarUsuario(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(db.delete(schema.usuarios).where(eq(schema.usuarios.id, id)));
    revalidatePath("/preferencias");
    return { ok: true };
  } catch (e) {
    return fallo("eliminarUsuario", e);
  }
}
