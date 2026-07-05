"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

function revalidar(): void {
  revalidatePath("/personal");
  revalidatePath("/dashboard");
}

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[personal] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo" };
}

// Guarda (o actualiza) la nómina del mes de un trabajador con el desglose
// estilo JOMA. Es un UPSERT por (mes, trabajadorId, tipo='nomina'): si el
// trabajador ya tiene su nómina en ese mes se actualiza; si no, se crea.
// importe = liquido (lo que le llega al trabajador); coste_empresa = suma.
export async function guardarNominaDesglose(
  mes: string,
  trabajadorId: string,
  datos: {
    liquido?: number | null;
    irpf?: number | null;
    ssTrabajador?: number | null;
    ssEmpresa?: number | null;
    cashB?: number | null;
  },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, error: "Mes no válido" };
  if (!trabajadorId) return { ok: false, error: "Falta el trabajador" };

  const valida = (n: number | null | undefined): number | null => {
    if (n == null) return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  };
  const liquido = valida(datos.liquido);
  const irpf = valida(datos.irpf);
  const ssTrab = valida(datos.ssTrabajador);
  const ssEmp = valida(datos.ssEmpresa);
  const cashB = valida(datos.cashB);
  // Al menos algo debe informarse; si todo está en null tratamos como error.
  if (liquido === null && irpf === null && ssTrab === null && ssEmp === null && cashB === null) {
    return { ok: false, error: "Rellena al menos un importe" };
  }
  const importe = liquido ?? 0;

  try {
    const [trab] = await conPlazo(
      db
        .select({ nombre: schema.personalTrabajadores.nombre })
        .from(schema.personalTrabajadores)
        .where(eq(schema.personalTrabajadores.id, trabajadorId)),
    );
    if (!trab) return { ok: false, error: "Trabajador no encontrado" };

    // ¿Ya hay nómina de este trabajador este mes?
    const [existente] = await conPlazo(
      db
        .select({ id: schema.personalGastos.id })
        .from(schema.personalGastos)
        .where(
          and(
            eq(schema.personalGastos.mes, mes),
            eq(schema.personalGastos.trabajadorId, trabajadorId),
            eq(schema.personalGastos.tipo, "nomina"),
          ),
        ),
    );

    const set = {
      importe: importe.toFixed(2),
      liquido: liquido !== null ? liquido.toFixed(2) : null,
      irpf: irpf !== null ? irpf.toFixed(2) : null,
      ssTrabajador: ssTrab !== null ? ssTrab.toFixed(2) : null,
      ssEmpresa: ssEmp !== null ? ssEmp.toFixed(2) : null,
      cashB: cashB !== null ? cashB.toFixed(2) : null,
    };

    if (existente) {
      await conPlazo(
        db.update(schema.personalGastos).set(set).where(eq(schema.personalGastos.id, existente.id)),
      );
    } else {
      await conPlazo(
        db.insert(schema.personalGastos).values({
          mes,
          concepto: `Nómina ${trab.nombre}`,
          tipo: "nomina",
          trabajadorId,
          ...set,
        }),
      );
    }
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("guardarNominaDesglose", e);
  }
}

// Actualiza la categoría del trabajador (Cocina, Sala, Dirección, Operarios…).
export async function actualizarCategoriaTrabajador(
  id: string,
  categoria: string | null,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const cat = categoria?.trim().slice(0, 60) || null;
  try {
    await conPlazo(
      db
        .update(schema.personalTrabajadores)
        .set({ categoria: cat, updatedAt: new Date() })
        .where(eq(schema.personalTrabajadores.id, id)),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("actualizarCategoriaTrabajador", e);
  }
}
