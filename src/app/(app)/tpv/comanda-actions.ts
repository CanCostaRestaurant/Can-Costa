"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import type { ComandaItem } from "@/lib/db/schema";

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
      if (existente && existente.enviado > 0) {
        // Ya viajó a cocina: no borramos la fila, la dejamos a 0 para que el
        // próximo envío avise con un QUITAR (enviarACocina la limpia luego).
        await conPlazo(
          db
            .update(schema.ticketLineas)
            .set({ cantidad: 0, total: "0.00" })
            .where(eq(schema.ticketLineas.id, existente.id)),
        );
      } else if (existente) {
        await conPlazo(db.delete(schema.ticketLineas).where(eq(schema.ticketLineas.id, existente.id)));
      }
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

// Nota de cocina de una línea ("sin cebolla", "poco hecho"…). Se guarda en la
// fila y viaja con el plato en el próximo pase; en la pantalla sale en rojo.
export async function fijarNotaLinea(
  ticketId: string,
  clave: { platoId?: string | null; descripcion?: string; precio?: number },
  nota: string,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const lineas = await conPlazo(
      db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId)),
    );
    const existente = lineas.find((l) =>
      clave.platoId
        ? l.platoId === clave.platoId
        : l.platoId === null &&
          l.descripcion === (clave.descripcion ?? "").trim() &&
          Number(l.precioUnitario) === clave.precio,
    );
    if (!existente) return { ok: false, error: "La línea aún no está guardada — reintenta" };

    await conPlazo(
      db
        .update(schema.ticketLineas)
        .set({ nota: nota.trim() || null })
        .where(eq(schema.ticketLineas.id, existente.id)),
    );
    return { ok: true };
  } catch (e) {
    console.error("[tpv] fijarNotaLinea falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}

// ── Enviar a cocina ────────────────────────────────────────────────────────
// Crea un PASE (comanda) con el DELTA desde el envío anterior: por línea,
// cantidad-enviado. Positivo = platos nuevos; negativo = QUITAR (el camarero
// borró algo ya enviado). Las bebidas no viajan (son de barra). Tras el
// snapshot, cada línea queda con enviado=cantidad y las filas a 0 se limpian.
export async function enviarACocina(ticketId: string, notaPase?: string): Promise<Resultado & { pase?: number }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [fila] = await conPlazo(
      db
        .select({ ticket: schema.tickets, mesaNombre: schema.mesas.nombre })
        .from(schema.tickets)
        .leftJoin(schema.mesas, eq(schema.tickets.mesaId, schema.mesas.id))
        .where(eq(schema.tickets.id, ticketId)),
    );
    if (!fila) return { ok: false, error: "Ticket no encontrado" };
    if (fila.ticket.estado !== "abierto") return { ok: false, error: "El ticket no está abierto" };

    const lineas = await conPlazo(
      db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId)),
    );

    // Tipo de cada plato para dejar las bebidas en barra.
    const platoIds = [...new Set(lineas.map((l) => l.platoId).filter((x): x is string => x !== null))];
    const tipos = new Map<string, string>();
    if (platoIds.length > 0) {
      const filasPlatos = await conPlazo(
        db
          .select({ id: schema.platos.id, tipo: schema.platos.tipoPlato })
          .from(schema.platos)
          .where(inArray(schema.platos.id, platoIds)),
      );
      for (const p of filasPlatos) tipos.set(p.id, p.tipo);
    }

    const items: ComandaItem[] = [];
    for (const l of lineas) {
      if (l.platoId && tipos.get(l.platoId) === "bebida") continue; // barra
      const delta = l.cantidad - l.enviado;
      if (delta > 0) items.push({ descripcion: l.descripcion, cantidad: delta, nota: l.nota });
      else if (delta < 0) items.push({ descripcion: l.descripcion, cantidad: -delta, nota: l.nota, quitar: true });
    }
    if (items.length === 0) return { ok: false, error: "No hay nada nuevo que enviar" };

    // Nuevos primero, QUITAR al final (en rojo, que se vean igual).
    items.sort((a, b) => Number(Boolean(a.quitar)) - Number(Boolean(b.quitar)));

    const previas = await conPlazo(
      db.select({ id: schema.comandas.id }).from(schema.comandas).where(eq(schema.comandas.ticketId, ticketId)),
    );
    const pase = previas.length + 1;

    await conPlazo(
      db.insert(schema.comandas).values({
        ticketId,
        mesaNombre: fila.mesaNombre ?? "Para llevar",
        pase,
        items,
        nota: notaPase?.trim() || null,
      }),
    );

    // Consolidar: enviado=cantidad; las filas que quedaron a 0 ya avisaron.
    for (const l of lineas) {
      if (l.platoId && tipos.get(l.platoId) === "bebida") continue;
      if (l.cantidad === 0) {
        await conPlazo(db.delete(schema.ticketLineas).where(eq(schema.ticketLineas.id, l.id)));
      } else if (l.enviado !== l.cantidad) {
        await conPlazo(
          db.update(schema.ticketLineas).set({ enviado: l.cantidad }).where(eq(schema.ticketLineas.id, l.id)),
        );
      }
    }

    revalidatePath("/tpv");
    revalidatePath("/cocina");
    return { ok: true, pase };
  } catch (e) {
    console.error("[tpv] enviarACocina falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}
