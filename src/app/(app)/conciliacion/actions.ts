"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { getAjustes } from "@/lib/db/queries";

type Resultado = { ok: boolean; error?: string; aviso?: string };

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[conciliacion] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo" };
}

function revalidar(): void {
  revalidatePath("/conciliacion");
  revalidatePath("/documentos");
  revalidatePath("/dashboard");
  revalidatePath("/incidencias");
}

// Enlaza albaranes a su factura. Si el total no cuadra (más allá de la
// tolerancia de Preferencias), deja registrada una incidencia en la factura.
export async function conciliar(facturaId: string, albaranIds: string[]): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (albaranIds.length === 0) return { ok: false, error: "Selecciona al menos un albarán" };

  try {
    const [factura] = await conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)));
    if (!factura || factura.tipo !== "factura") return { ok: false, error: "Factura no encontrada" };

    const albaranes = await conPlazo(
      db.select().from(schema.facturas).where(inArray(schema.facturas.id, albaranIds)),
    );
    if (albaranes.some((a) => a.tipo !== "albaran")) {
      return { ok: false, error: "Solo se pueden conciliar albaranes" };
    }
    if (albaranes.some((a) => a.facturaPadreId && a.facturaPadreId !== facturaId)) {
      return { ok: false, error: "Algún albarán ya está conciliado con otra factura" };
    }
    if (albaranes.some((a) => a.proveedorId !== factura.proveedorId)) {
      return { ok: false, error: "Los albaranes deben ser del mismo proveedor que la factura" };
    }

    await conPlazo(
      db
        .update(schema.facturas)
        .set({ facturaPadreId: facturaId, updatedAt: new Date() })
        .where(inArray(schema.facturas.id, albaranIds)),
    );

    // ¿Cuadra? Suma de TODOS los albaranes enlazados (los nuevos y los previos).
    const [ajustes, enlazados] = await Promise.all([
      getAjustes(),
      conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.facturaPadreId, facturaId))),
    ]);
    const suma = enlazados.reduce((s, a) => s + Number(a.total ?? 0), 0);
    const diferencia = suma - Number(factura.total ?? 0);
    if (Math.abs(diferencia) > ajustes.toleranciaConciliacion) {
      const texto = `Descuadre de ${Math.abs(diferencia).toFixed(2).replace(".", ",")} € entre la factura y sus albaranes`;
      await conPlazo(
        db.update(schema.facturas).set({ incidencia: texto, updatedAt: new Date() }).where(eq(schema.facturas.id, facturaId)),
      );
      revalidar();
      return { ok: true, aviso: `Conciliada CON DESCUADRE: ${texto} — registrada como incidencia` };
    }

    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("conciliar", e);
  }
}

// Suelta todos los albaranes de una factura (deshacer la conciliación).
export async function desconciliarFactura(facturaId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(
      db
        .update(schema.facturas)
        .set({ facturaPadreId: null, updatedAt: new Date() })
        .where(eq(schema.facturas.facturaPadreId, facturaId)),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("desconciliarFactura", e);
  }
}
