"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

// Fija la cantidad ABSOLUTA de una línea del ticket, identificada por el
// producto (platoId, o descripción+precio en líneas libres). Es idempotente:
// crea, actualiza o borra según el objetivo. Pensada para que el TPV mantenga
// el estado local al instante y sincronice en segundo plano sin bloquear la UI;
// enviar la cantidad absoluta (no un delta) evita carreras al tocar deprisa.
export async function fijarLinea(
  ticketId: string,
  clave: { platoId?: string | null; descripcion?: string; precio?: number },
  cantidad: number,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [ticket] = await conPlazo(
      db.select({ estado: schema.tickets.estado }).from(schema.tickets).where(eq(schema.tickets.id, ticketId)),
    );
    if (ticket?.estado !== "abierto") return { ok: false, error: "El ticket no está abierto" };

    let descripcion: string;
    let precio: number;
    let platoId: string | null = null;

    if (clave.platoId) {
      const [plato] = await conPlazo(db.select().from(schema.platos).where(eq(schema.platos.id, clave.platoId)));
      if (!plato) return { ok: false, error: "Plato no encontrado" };
      if (plato.pvp === null) return { ok: false, error: `"${plato.nombre}" no tiene PVP — ponlo en Escandallos` };
      descripcion = plato.nombre;
      precio = Number(plato.pvp);
      platoId = plato.id;
    } else {
      if (!clave.descripcion?.trim()) return { ok: false, error: "Indica la descripción" };
      if (clave.precio === undefined || !Number.isFinite(clave.precio) || clave.precio < 0) {
        return { ok: false, error: "Precio no válido" };
      }
      descripcion = clave.descripcion.trim();
      precio = clave.precio;
    }

    const objetivo = Math.max(0, Math.round(cantidad));

    const lineas = await conPlazo(
      db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId)),
    );
    const existente = lineas.find((l) =>
      platoId
        ? l.platoId === platoId
        : l.platoId === null && l.descripcion === descripcion && Number(l.precioUnitario) === precio,
    );

    if (objetivo <= 0) {
      if (existente) await conPlazo(db.delete(schema.ticketLineas).where(eq(schema.ticketLineas.id, existente.id)));
    } else if (existente) {
      await conPlazo(
        db
          .update(schema.ticketLineas)
          .set({ cantidad: objetivo, total: (objetivo * Number(existente.precioUnitario)).toFixed(2) })
          .where(eq(schema.ticketLineas.id, existente.id)),
      );
    } else {
      await conPlazo(
        db.insert(schema.ticketLineas).values({
          ticketId,
          platoId,
          descripcion,
          cantidad: objetivo,
          precioUnitario: precio.toFixed(2),
          total: (objetivo * precio).toFixed(2),
        }),
      );
    }

    revalidatePath("/tpv");
    return { ok: true };
  } catch (e) {
    console.error("[tpv] fijarLinea falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}
