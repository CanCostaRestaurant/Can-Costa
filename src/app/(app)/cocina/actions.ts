"use server";

import { and, desc, asc, eq, gt } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import type { ComandaItem } from "@/lib/db/schema";

// Shape serializable que consume la pantalla (el tiempo lo pinta el cliente
// con su reloj a partir de creadaAt, para que el semáforo corra en vivo).
export type ComandaCocina = {
  id: string;
  mesa: string;
  pase: number;
  items: ComandaItem[];
  nota: string | null;
  creadaAt: string; // ISO
  listaAt: string | null;
};

export type EstadoCocina = {
  ok: boolean;
  error?: string;
  pendientes: ComandaCocina[];
  listas: ComandaCocina[]; // recién bumpeadas (para "recuperar")
};

const aComanda = (c: typeof schema.comandas.$inferSelect): ComandaCocina => ({
  id: c.id,
  mesa: c.mesaNombre,
  pase: c.pase,
  items: c.items,
  nota: c.nota,
  creadaAt: c.createdAt.toISOString(),
  listaAt: c.listaAt ? c.listaAt.toISOString() : null,
});

// La cola viva: pendientes (viejas primero) + las listas de la última media
// hora (por si un dedo se equivoca, se recuperan de un toque).
export async function estadoCocina(): Promise<EstadoCocina> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada", pendientes: [], listas: [] };
  try {
    const hace30min = new Date(Date.now() - 30 * 60 * 1000);
    const [pendientes, listas] = await Promise.all([
      conPlazo(
        db
          .select()
          .from(schema.comandas)
          .where(eq(schema.comandas.estado, "pendiente"))
          .orderBy(asc(schema.comandas.createdAt)),
      ),
      conPlazo(
        db
          .select()
          .from(schema.comandas)
          .where(and(eq(schema.comandas.estado, "lista"), gt(schema.comandas.listaAt, hace30min)))
          .orderBy(desc(schema.comandas.listaAt))
          .limit(6),
      ),
    ]);
    return { ok: true, pendientes: pendientes.map(aComanda), listas: listas.map(aComanda) };
  } catch (e) {
    console.error("[cocina] estadoCocina falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde", pendientes: [], listas: [] };
  }
}

// Bump: la comanda está emplatada y sale al pase.
export async function marcarLista(comandaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(
      db
        .update(schema.comandas)
        .set({ estado: "lista", listaAt: new Date() })
        .where(eq(schema.comandas.id, comandaId)),
    );
    return { ok: true };
  } catch (e) {
    console.error("[cocina] marcarLista falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde — reintenta" };
  }
}

// Recall: deshacer un bump (vuelve a pendiente conservando su antigüedad).
export async function recuperarComanda(comandaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(
      db.update(schema.comandas).set({ estado: "pendiente", listaAt: null }).where(eq(schema.comandas.id, comandaId)),
    );
    return { ok: true };
  } catch (e) {
    console.error("[cocina] recuperarComanda falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde — reintenta" };
  }
}
