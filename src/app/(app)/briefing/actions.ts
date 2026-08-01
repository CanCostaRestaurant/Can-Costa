"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { normalizarBriefing } from "@/lib/briefing/tipos";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

// Guarda (upsert por fecha) las secciones editables del briefing del día.
export async function guardarBriefing(fecha: string, datos: unknown): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida" };

  try {
    // Quién guarda + el rol tablet no edita (misma regla que la página).
    let actualizadoPor: string | null = null;
    const secreto = process.env.AUTH_SECRET;
    if (secreto) {
      const almacen = await cookies();
      const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
      // Cerrado por defecto: sin sesión válida no se guarda (el proxy ya lo
      // impide, pero la action no debe fiarse solo de él).
      if (!sesion.ok) return { ok: false, error: "Sesión caducada: vuelve a entrar" };
      if (sesion.rol === "tpv") return { ok: false, error: "El modo tablet solo puede leer el briefing" };
      actualizadoPor = sesion.nombre;
    }

    // Normalizar al shape conocido: nada raro entra en el jsonb.
    const limpios = normalizarBriefing(datos);

    await conPlazo(
      db
        .insert(schema.briefings)
        .values({ fecha, datos: limpios, actualizadoPor })
        .onConflictDoUpdate({
          target: schema.briefings.fecha,
          set: { datos: limpios, actualizadoPor, updatedAt: new Date() },
        }),
    );
    revalidatePath("/briefing");
    return { ok: true };
  } catch (e) {
    console.error("[briefing] guardarBriefing falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
