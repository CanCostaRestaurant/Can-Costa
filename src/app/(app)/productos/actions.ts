"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

const FAMILIAS = ["pescado", "carne", "fruta-verdura", "seco", "bebida", "otros"] as const;
type Familia = (typeof FAMILIAS)[number];

// Alta manual de un producto (p. ej. Coca-Cola): normalmente los productos
// entran solos al validar facturas, pero a veces quieres crearlos a mano.
// Si das un precio inicial, siembra el histórico para que ya tenga referencia.
export async function crearProducto(datos: {
  nombre: string;
  familia: Familia;
  unidad: string;
  precioInicial?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const nombre = datos.nombre.trim();
  if (nombre.length < 2) return { ok: false, error: "Pon el nombre del producto" };
  if (!FAMILIAS.includes(datos.familia)) return { ok: false, error: "Familia no válida" };
  const unidad = (datos.unidad || "ud").trim().slice(0, 10);
  const precio = datos.precioInicial;
  if (precio != null && (!Number.isFinite(precio) || precio < 0)) {
    return { ok: false, error: "Precio inicial no válido" };
  }

  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const [nuevo] = await conPlazo(
      db
        .insert(schema.productos)
        .values({
          nombre,
          familia: datos.familia,
          unidad,
          ultimoPrecio: precio != null ? precio.toFixed(4) : null,
          ultimaCompra: precio != null ? hoy : null,
        })
        .returning({ id: schema.productos.id }),
    );
    // Precio inicial → primer punto del histórico (referencia desde ya).
    if (precio != null) {
      await conPlazo(
        db.insert(schema.precios).values({ productoId: nuevo.id, precio: precio.toFixed(4), fecha: hoy }),
      );
    }
    revalidatePath("/productos");
    revalidatePath("/escandallos"); // que aparezca ya en el buscador del escandallo
    return { ok: true };
  } catch (e) {
    console.error("[crearProducto] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

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
