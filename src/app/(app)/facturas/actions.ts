"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Valida una factura en bandeja: vuelca sus líneas al histórico de precios,
// actualiza el último precio de cada producto y deja la variación calculada.
export async function validarFactura(facturaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const [factura] = await db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId));
  if (!factura) return { ok: false, error: "Factura no encontrada" };
  if (factura.estado !== "revisar") return { ok: false, error: "La factura no está pendiente de revisar" };

  const lineas = await db
    .select()
    .from(schema.facturaLineas)
    .where(eq(schema.facturaLineas.facturaId, facturaId));

  const fecha = factura.fecha ?? new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    for (const linea of lineas) {
      if (!linea.productoId || !linea.precioUnitario) continue;

      const [producto] = await tx
        .select()
        .from(schema.productos)
        .where(eq(schema.productos.id, linea.productoId));
      if (!producto) continue;

      const precio = Number(linea.precioUnitario);
      const previo = producto.ultimoPrecio ? Number(producto.ultimoPrecio) : null;
      const variacion = previo && previo > 0 ? ((precio - previo) / previo) * 100 : null;

      await tx.insert(schema.precios).values({
        productoId: linea.productoId,
        precio: linea.precioUnitario,
        unidad: linea.unidad ?? producto.unidad,
        fecha,
        proveedorId: factura.proveedorId,
        facturaId: factura.id,
        lineaId: linea.id,
      });

      await tx
        .update(schema.productos)
        .set({ ultimoPrecio: linea.precioUnitario, ultimaCompra: fecha, updatedAt: new Date() })
        .where(eq(schema.productos.id, linea.productoId));

      if (variacion !== null) {
        await tx
          .update(schema.facturaLineas)
          .set({ variacionPct: variacion.toFixed(2) })
          .where(eq(schema.facturaLineas.id, linea.id));
      }
    }

    await tx
      .update(schema.facturas)
      .set({ estado: "validada", updatedAt: new Date() })
      .where(eq(schema.facturas.id, facturaId));
  });

  revalidatePath("/");
  revalidatePath("/facturas");
  revalidatePath("/precios");
  return { ok: true };
}
