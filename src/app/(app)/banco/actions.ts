"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { extraerExtracto } from "@/lib/ia/extraer-extracto";

export type MovimientoPago = { fecha: string | null; importe: number; concepto: string };
export type FacturaSugerida = {
  id: string;
  proveedor: string;
  numero: string | null;
  fecha: string | null;
  total: number;
};
export type Sugerencia = { movimiento: MovimientoPago; factura: FacturaSugerida | null };
export type ResultadoAnalisis =
  | { ok: true; sugerencias: Sugerencia[]; ingresos: number }
  | { ok: false; error: string };

// El banco paga el importe exacto de la factura; damos un pequeño margen por si
// hay céntimos de redondeo.
const TOLERANCIA = 0.5;

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export async function analizarExtracto(base64: string, mediaType: string): Promise<ResultadoAnalisis> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Falta la clave de IA (ANTHROPIC_API_KEY)" };
  try {
    // Proveedores (para que la IA reconozca a quién se paga) + facturas de
    // proveedor pendientes de pago (validadas o por revisar, no rechazadas).
    const [proveedores, facturasFilas] = await Promise.all([
      conPlazo(db.select({ id: schema.proveedores.id, nombre: schema.proveedores.nombre }).from(schema.proveedores)),
      conPlazo(
        db
          .select({
            id: schema.facturas.id,
            proveedorId: schema.facturas.proveedorId,
            proveedorTexto: schema.facturas.proveedorTexto,
            proveedorNombre: schema.proveedores.nombre,
            numero: schema.facturas.numero,
            fecha: schema.facturas.fecha,
            total: schema.facturas.total,
          })
          .from(schema.facturas)
          .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
          .where(
            and(
              eq(schema.facturas.pagada, false),
              eq(schema.facturas.tipo, "factura"),
              inArray(schema.facturas.estado, ["validada", "revisar"]),
            ),
          ),
      ),
    ]);

    let movimientos;
    try {
      movimientos = await extraerExtracto({ base64, mediaType, proveedores });
    } catch (e) {
      console.error("[banco] IA extracto falló:", e instanceof Error ? e.message : e);
      return { ok: false, error: "La IA no pudo leer el extracto — prueba con otra foto o PDF más nítido" };
    }

    const pool = facturasFilas.map((f) => ({
      id: f.id,
      proveedorId: f.proveedorId,
      proveedor: f.proveedorNombre ?? f.proveedorTexto ?? "Proveedor",
      numero: f.numero,
      fecha: f.fecha,
      total: f.total !== null ? Number(f.total) : 0,
    }));

    const pagos = movimientos.filter((m) => m.importe < 0);
    const ingresos = movimientos.filter((m) => m.importe > 0).length;

    // Emparejado determinista: por importe (± tolerancia) y desempate por
    // proveedor (id de la IA o nombre en el concepto). Cada factura se asigna
    // como mucho a un pago.
    const usadas = new Set<string>();
    const sugerencias: Sugerencia[] = pagos.map((m) => {
      const monto = Math.abs(m.importe);
      const concepto = normaliza(m.concepto);
      const candidata = pool
        .filter((f) => !usadas.has(f.id) && Math.abs(f.total - monto) <= TOLERANCIA)
        .map((f) => {
          const provPorId = m.proveedor_id && f.proveedorId === m.proveedor_id ? 2 : 0;
          const provPorNombre = f.proveedor && concepto.includes(normaliza(f.proveedor)) ? 1 : 0;
          return { f, score: provPorId + provPorNombre - Math.abs(f.total - monto) };
        })
        .sort((a, b) => b.score - a.score)[0]?.f;

      if (candidata) usadas.add(candidata.id);
      return {
        movimiento: { fecha: m.fecha, importe: m.importe, concepto: m.concepto },
        factura: candidata
          ? {
              id: candidata.id,
              proveedor: candidata.proveedor,
              numero: candidata.numero,
              fecha: candidata.fecha,
              total: candidata.total,
            }
          : null,
      };
    });

    return { ok: true, sugerencias, ingresos };
  } catch (e) {
    console.error("[banco] analizarExtracto falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}

export async function confirmarPagos(
  facturaIds: string[],
): Promise<{ ok: boolean; error?: string; marcadas?: number }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const ids = [...new Set(facturaIds)].filter(Boolean);
  if (ids.length === 0) return { ok: true, marcadas: 0 };
  try {
    await conPlazo(
      db
        .update(schema.facturas)
        .set({ pagada: true, updatedAt: new Date() })
        .where(inArray(schema.facturas.id, ids)),
    );
    revalidatePath("/documentos");
    revalidatePath("/banco");
    return { ok: true, marcadas: ids.length };
  } catch (e) {
    console.error("[banco] confirmarPagos falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}
