"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

function revalidar(): void {
  revalidatePath("/personal");
  revalidatePath("/dashboard");
}

export async function agregarGastoPersonal(datos: {
  mes: string;
  concepto: string;
  importe: number;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}$/.test(datos.mes)) return { ok: false, error: "Mes no válido" };
  if (!datos.concepto.trim()) return { ok: false, error: "Pon el concepto (Nómina Marc, Seguridad Social…)" };
  if (!Number.isFinite(datos.importe) || datos.importe <= 0) return { ok: false, error: "Importe no válido" };

  try {
    await conPlazo(
      db.insert(schema.personalGastos).values({
        mes: datos.mes,
        concepto: datos.concepto.trim().slice(0, 120),
        importe: datos.importe.toFixed(2),
      }),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error("[personal] agregar falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

export async function eliminarGastoPersonal(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(db.delete(schema.personalGastos).where(eq(schema.personalGastos.id, id)));
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error("[personal] eliminar falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Copia los conceptos de un mes al siguiente (las nóminas suelen repetirse).
export async function copiarMesAnterior(mes: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, error: "Mes no válido" };

  const [anyo, m] = mes.split("-").map(Number);
  const previo = new Date(anyo, m - 2, 1);
  const mesPrevio = `${previo.getFullYear()}-${String(previo.getMonth() + 1).padStart(2, "0")}`;

  try {
    const [anteriores, actuales] = await Promise.all([
      conPlazo(db.select().from(schema.personalGastos).where(eq(schema.personalGastos.mes, mesPrevio))),
      conPlazo(db.select().from(schema.personalGastos).where(eq(schema.personalGastos.mes, mes))),
    ]);
    if (anteriores.length === 0) return { ok: false, error: `No hay gastos en ${mesPrevio} que copiar` };
    const yaExisten = new Set(actuales.map((a) => a.concepto));
    const nuevos = anteriores.filter((a) => !yaExisten.has(a.concepto));
    if (nuevos.length === 0) return { ok: false, error: "Todos los conceptos del mes anterior ya están en este mes" };
    await conPlazo(
      db.insert(schema.personalGastos).values(nuevos.map((a) => ({ mes, concepto: a.concepto, importe: a.importe }))),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    console.error("[personal] copiar falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
