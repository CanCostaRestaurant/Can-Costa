"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { ETIQUETA_CATEGORIA, type CategoriaGasto } from "@/lib/mock";

// Configuración por proveedor (reglas haddock): categoría del gasto (solo
// las de compra alimentan Productos) y de dónde salen sus productos
// (albaranes por defecto, o facturas si sus albaranes vienen sin importes).
export async function configurarProveedor(
  proveedorId: string,
  datos: { categoria?: CategoriaGasto; fuenteProductos?: "albaranes" | "facturas" },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.categoria !== undefined) {
    if (!(datos.categoria in ETIQUETA_CATEGORIA)) return { ok: false, error: "Categoría no válida" };
    set.categoria = datos.categoria;
  }
  if (datos.fuenteProductos !== undefined) {
    if (datos.fuenteProductos !== "albaranes" && datos.fuenteProductos !== "facturas") {
      return { ok: false, error: "Fuente no válida" };
    }
    set.fuenteProductos = datos.fuenteProductos;
  }

  try {
    await conPlazo(db.update(schema.proveedores).set(set).where(eq(schema.proveedores.id, proveedorId)));
    revalidatePath("/proveedores");
    revalidatePath("/productos");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    console.error("[configurarProveedor] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
