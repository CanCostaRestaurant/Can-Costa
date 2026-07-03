"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

export async function actualizarCliente(
  id: string,
  datos: { nombre?: string; telefono?: string; email?: string; notas?: string },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.nombre !== undefined) {
    if (!datos.nombre.trim()) return { ok: false, error: "El nombre no puede estar vacío" };
    set.nombre = datos.nombre.trim();
  }
  if (datos.telefono !== undefined) set.telefono = datos.telefono.trim() || null;
  if (datos.email !== undefined) set.email = datos.email.trim().toLowerCase() || null;
  if (datos.notas !== undefined) set.notas = datos.notas.trim() || null;

  try {
    await conPlazo(db.update(schema.clientes).set(set).where(eq(schema.clientes.id, id)));
    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    console.error("[clientes] actualizar falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
