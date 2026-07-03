"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

// Precio pactado/tarifado con el proveedor: si está fijado, manda sobre el
// precio de referencia para decidir si la última compra va cara (rojo/verde).
export async function fijarPrecioPactado(
  productoId: string,
  valor: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return { ok: false, error: "Precio no válido" };
  }
  try {
    await conPlazo(
      db
        .update(schema.productos)
        .set({ precioPactado: valor !== null ? valor.toFixed(4) : null, updatedAt: new Date() })
        .where(eq(schema.productos.id, productoId)),
    );
    revalidatePath("/productos");
    return { ok: true };
  } catch (e) {
    console.error("[fijarPrecioPactado] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
