"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[clientes] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo" };
}

export async function actualizarCliente(
  id: string,
  datos: {
    nombre?: string;
    telefono?: string;
    email?: string;
    notas?: string;
    etiquetas?: string[];
    restricciones?: string;
    preferencias?: string;
    preferenciaMesa?: string;
    idioma?: string;
  },
): Promise<Resultado> {
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
  if (datos.restricciones !== undefined) set.restricciones = datos.restricciones.trim() || null;
  if (datos.preferencias !== undefined) set.preferencias = datos.preferencias.trim() || null;
  if (datos.preferenciaMesa !== undefined) set.preferenciaMesa = datos.preferenciaMesa.trim() || null;
  if (datos.idioma !== undefined) set.idioma = datos.idioma.trim() || null;
  if (datos.etiquetas !== undefined) {
    set.etiquetas = [...new Set(datos.etiquetas.map((e) => e.trim()).filter(Boolean))].slice(0, 12);
  }

  try {
    await conPlazo(db.update(schema.clientes).set(set).where(eq(schema.clientes.id, id)));
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return { ok: true };
  } catch (e) {
    return fallo("actualizar", e);
  }
}

// Unificar: mueve reservas y tickets del duplicado al principal, completa los
// datos que le falten al principal y borra el duplicado.
export async function unificarClientes(principalId: string, duplicadoId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (principalId === duplicadoId) return { ok: false, error: "Elige un cliente distinto" };

  try {
    const [principal] = await conPlazo(db.select().from(schema.clientes).where(eq(schema.clientes.id, principalId)));
    const [duplicado] = await conPlazo(db.select().from(schema.clientes).where(eq(schema.clientes.id, duplicadoId)));
    if (!principal || !duplicado) return { ok: false, error: "Cliente no encontrado" };

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (!principal.telefono && duplicado.telefono) set.telefono = duplicado.telefono;
    if (!principal.email && duplicado.email) set.email = duplicado.email;
    if (!principal.restricciones && duplicado.restricciones) set.restricciones = duplicado.restricciones;
    if (!principal.preferencias && duplicado.preferencias) set.preferencias = duplicado.preferencias;
    if (!principal.preferenciaMesa && duplicado.preferenciaMesa) set.preferenciaMesa = duplicado.preferenciaMesa;
    if (!principal.idioma && duplicado.idioma) set.idioma = duplicado.idioma;
    if (duplicado.notas) set.notas = principal.notas ? `${principal.notas} · ${duplicado.notas}` : duplicado.notas;
    const etiquetas = [...new Set([...(principal.etiquetas ?? []), ...(duplicado.etiquetas ?? [])])];
    if (etiquetas.length !== (principal.etiquetas ?? []).length) set.etiquetas = etiquetas;

    await conPlazo(
      db
        .update(schema.reservas)
        .set({ clienteId: principalId, updatedAt: new Date() })
        .where(eq(schema.reservas.clienteId, duplicadoId)),
    );
    await conPlazo(
      db.update(schema.tickets).set({ clienteId: principalId }).where(eq(schema.tickets.clienteId, duplicadoId)),
    );
    await conPlazo(db.update(schema.clientes).set(set).where(eq(schema.clientes.id, principalId)));
    await conPlazo(db.delete(schema.clientes).where(eq(schema.clientes.id, duplicadoId)));

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${principalId}`);
    return { ok: true };
  } catch (e) {
    return fallo("unificar", e);
  }
}

// Eliminar: sus reservas y tickets quedan sin cliente (FK set null), no se borran.
export async function eliminarCliente(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(db.delete(schema.clientes).where(eq(schema.clientes.id, id)));
    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    return fallo("eliminar", e);
  }
}
