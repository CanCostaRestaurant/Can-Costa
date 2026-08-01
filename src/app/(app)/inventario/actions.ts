"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getDb, resetDb } from "@/lib/db";
import { recontarProducto } from "@/lib/stock/motor";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

type Resultado = { ok: boolean; error?: string; desviacion?: number };

// Recuento físico de un producto: iguala el stock teórico a lo contado y
// apunta la desviación (contado − teórico) para el control de mermas/pérdidas.
export async function recontarStock(productoId: string, contado: number): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!Number.isFinite(contado) || contado < 0 || contado > 1_000_000) {
    return { ok: false, error: "Cantidad no válida" };
  }

  try {
    // Quién cuenta (nombre de la sesión), para el histórico.
    let contadoPor: string | null = null;
    const secreto = process.env.AUTH_SECRET;
    if (secreto) {
      const almacen = await cookies();
      const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
      if (sesion.ok) contadoPor = sesion.nombre;
    }

    const res = await recontarProducto(db, productoId, contado, contadoPor);
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
