"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { apuntarMermaProducto, recontarProducto } from "@/lib/stock/motor";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

type Resultado = { ok: boolean; error?: string; desviacion?: number };

async function nombreSesion(): Promise<string | null> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return null;
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok ? sesion.nombre : null;
}

// Recuento físico de un producto: iguala el stock teórico a lo contado y
// apunta la desviación (contado − teórico) para el control de mermas/pérdidas.
export async function recontarStock(productoId: string, contado: number): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!Number.isFinite(contado) || contado < 0 || contado > 1_000_000) {
    return { ok: false, error: "Cantidad no válida" };
  }

  try {
    const res = await recontarProducto(db, productoId, contado, await nombreSesion());
    if (!res.ok) return { ok: false, error: res.error };

    revalidatePath("/inventario");
    revalidatePath("/productos");
    return { ok: true, desviacion: res.desviacion };
  } catch (e) {
    console.error("[inventario] recontarStock falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Merma manual ("se cayó una caja", "caducado"): movimiento negativo directo
// con su motivo — no hace falta esperar al recuento para apuntarla.
export async function apuntarMerma(productoId: string, cantidad: number, motivo: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1_000_000) {
    return { ok: false, error: "Cantidad no válida" };
  }
  try {
    const res = await apuntarMermaProducto(db, productoId, cantidad, motivo?.trim() || null, await nombreSesion());
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath("/inventario");
    return { ok: true };
  } catch (e) {
    console.error("[inventario] apuntarMerma falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

export type RecuentoHistorial = {
  fecha: string; // "4 jul, 13:05"
  teorico: number;
  contado: number;
  desviacion: number;
  contadoPor: string | null;
};

// Últimos recuentos de un producto (para el desplegable de la fila).
export async function historialRecuentos(
  productoId: string,
): Promise<{ ok: boolean; recuentos?: RecuentoHistorial[]; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const filas = await conPlazo(
      db
        .select()
        .from(schema.stockRecuentos)
        .where(eq(schema.stockRecuentos.productoId, productoId))
        .orderBy(desc(schema.stockRecuentos.createdAt))
        .limit(12),
    );
    const fmt = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      ok: true,
      recuentos: filas.map((r) => ({
        fecha: fmt.format(r.createdAt),
        teorico: Number(r.teorico),
        contado: Number(r.contado),
        desviacion: Number(r.desviacion),
        contadoPor: r.contadoPor,
      })),
    };
  } catch (e) {
    console.error("[inventario] historialRecuentos falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
