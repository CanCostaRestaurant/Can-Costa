"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

// Hace vendible un producto de compra en el TPV: crea (o actualiza) una BEBIDA
// (plato tipo "bebida") con el nombre del producto y el PVP indicado, y enlaza
// el propio producto como coste (1 unidad) para calcular margen/food cost. Es
// idempotente: si ya existe la bebida de ese producto, solo actualiza el precio.
export async function venderProductoEnTpv(
  productoId: string,
  datos: { pvp: number; emoji?: string },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!Number.isFinite(datos.pvp) || datos.pvp <= 0) {
    return { ok: false, error: "Pon un precio de venta válido" };
  }
  try {
    const [prod] = await conPlazo(
      db.select().from(schema.productos).where(eq(schema.productos.id, productoId)),
    );
    if (!prod) return { ok: false, error: "Producto no encontrado" };

    // ¿Ya hay una bebida creada a partir de este producto? → solo el precio.
    const [existente] = await conPlazo(
      db
        .select({ platoId: schema.platos.id })
        .from(schema.platoIngredientes)
        .innerJoin(schema.platos, eq(schema.platos.id, schema.platoIngredientes.platoId))
        .where(
          and(
            eq(schema.platoIngredientes.productoId, productoId),
            eq(schema.platos.tipoPlato, "bebida"),
          ),
        ),
    );

    const emoji = datos.emoji?.trim() || "🥤";
    const pvp = datos.pvp.toFixed(2);

    if (existente) {
      await conPlazo(
        db
          .update(schema.platos)
          .set({ pvp, activo: true, updatedAt: new Date() })
          .where(eq(schema.platos.id, existente.platoId)),
      );
    } else {
      const [plato] = await conPlazo(
        db
          .insert(schema.platos)
          .values({ nombre: prod.nombre, emoji, tipoPlato: "bebida", pvp })
          .returning({ id: schema.platos.id }),
      );
      await conPlazo(
        db.insert(schema.platoIngredientes).values({
          platoId: plato.id,
          productoId: prod.id,
          cantidad: "1",
        }),
      );
    }

    revalidatePath("/tpv");
    revalidatePath("/escandallos");
    return { ok: true };
  } catch (e) {
    console.error("[productos] venderProductoEnTpv falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
  }
}
