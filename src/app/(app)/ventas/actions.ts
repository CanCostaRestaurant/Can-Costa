"use server";

import { revalidatePath } from "next/cache";
import { conPlazo, getDb, schema } from "@/lib/db";

// Alta/edición de las ventas de un día (hasta que llegue el import del TPV).
export async function guardarVentaDia(
  fecha: string,
  total: number,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida" };
  if (!Number.isFinite(total) || total < 0) return { ok: false, error: "Importe no válido" };
  if (fecha > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "No se pueden apuntar ventas de un día futuro" };
  }

  try {
    await conPlazo(
      db
        .insert(schema.ventasDia)
        .values({ fecha, total: total.toFixed(2), origen: "manual" })
        .onConflictDoUpdate({
          target: schema.ventasDia.fecha,
          set: { total: total.toFixed(2), origen: "manual" },
        }),
    );
  } catch (e) {
    console.error("[guardarVentaDia] falló:", e instanceof Error ? e.message : e);
    return { ok: false, error: "La base de datos no responde ahora mismo — vuelve a intentarlo en unos minutos" };
  }

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true };
}
