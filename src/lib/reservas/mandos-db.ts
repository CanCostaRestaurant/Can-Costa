// Carga y guarda los mandos del cover manager (tabla reservas_config, una
// fila jsonb). Server-only: lo usan las actions y las páginas de /reservas.
import { eq } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import { MANDOS_POR_DEFECTO, normalizarMandos, type MandosReservas } from "./config";

export async function cargarMandos(): Promise<MandosReservas> {
  const db = getDb();
  if (!db) return MANDOS_POR_DEFECTO;
  try {
    const [fila] = await conPlazo(
      db.select().from(schema.reservasConfig).where(eq(schema.reservasConfig.id, 1)),
    );
    return normalizarMandos(fila?.config);
  } catch (e) {
    console.error("[reservas] cargarMandos falló:", e instanceof Error ? e.message : e);
    return MANDOS_POR_DEFECTO;
  }
}

export async function guardarMandos(mandos: MandosReservas): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Base de datos no configurada");
  const config = normalizarMandos(mandos);
  await conPlazo(
    db
      .insert(schema.reservasConfig)
      .values({ id: 1, config, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.reservasConfig.id,
        set: { config, updatedAt: new Date() },
      }),
  );
}
