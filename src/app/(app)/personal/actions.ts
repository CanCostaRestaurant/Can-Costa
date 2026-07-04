"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string };

const TIPOS = ["nomina", "seguridad_social", "otro"] as const;
type TipoPersonal = (typeof TIPOS)[number];

function revalidar(): void {
  revalidatePath("/personal");
  revalidatePath("/dashboard");
}

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[personal] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo" };
}

// ── Roster de trabajadores ──────────────────────────────────────────────

export async function crearTrabajador(datos: {
  nombre: string;
  puesto?: string;
  salario?: number | null;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!datos.nombre.trim()) return { ok: false, error: "Pon el nombre del trabajador" };
  if (datos.salario != null && (!Number.isFinite(datos.salario) || datos.salario < 0)) {
    return { ok: false, error: "Salario no válido" };
  }
  try {
    await conPlazo(
      db.insert(schema.personalTrabajadores).values({
        nombre: datos.nombre.trim().slice(0, 80),
        puesto: datos.puesto?.trim().slice(0, 60) || null,
        salario: datos.salario != null ? datos.salario.toFixed(2) : null,
      }),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("crearTrabajador", e);
  }
}

export async function actualizarTrabajador(
  id: string,
  datos: { nombre?: string; puesto?: string; salario?: number | null; activo?: boolean },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.nombre !== undefined) {
    if (!datos.nombre.trim()) return { ok: false, error: "El nombre no puede estar vacío" };
    set.nombre = datos.nombre.trim().slice(0, 80);
  }
  if (datos.puesto !== undefined) set.puesto = datos.puesto.trim().slice(0, 60) || null;
  if (datos.salario !== undefined) {
    if (datos.salario != null && (!Number.isFinite(datos.salario) || datos.salario < 0)) {
      return { ok: false, error: "Salario no válido" };
    }
    set.salario = datos.salario != null ? datos.salario.toFixed(2) : null;
  }
  if (datos.activo !== undefined) set.activo = datos.activo;
  try {
    await conPlazo(db.update(schema.personalTrabajadores).set(set).where(eq(schema.personalTrabajadores.id, id)));
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("actualizarTrabajador", e);
  }
}

export async function eliminarTrabajador(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    // Sus nóminas ya cobradas se conservan (trabajador_id → null por la FK).
    await conPlazo(db.delete(schema.personalTrabajadores).where(eq(schema.personalTrabajadores.id, id)));
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("eliminarTrabajador", e);
  }
}

// ── Nóminas / gastos del mes ────────────────────────────────────────────

export async function agregarNomina(datos: {
  mes: string;
  concepto: string;
  importe: number;
  tipo?: TipoPersonal;
  trabajadorId?: string | null;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}$/.test(datos.mes)) return { ok: false, error: "Mes no válido" };
  if (!datos.concepto.trim()) return { ok: false, error: "Pon el concepto (Nómina, Seguridad Social…)" };
  if (!Number.isFinite(datos.importe) || datos.importe <= 0) return { ok: false, error: "Importe no válido" };
  const tipo: TipoPersonal = TIPOS.includes(datos.tipo as TipoPersonal) ? (datos.tipo as TipoPersonal) : "nomina";

  try {
    await conPlazo(
      db.insert(schema.personalGastos).values({
        mes: datos.mes,
        concepto: datos.concepto.trim().slice(0, 120),
        importe: datos.importe.toFixed(2),
        tipo,
        trabajadorId: datos.trabajadorId || null,
      }),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("agregarNomina", e);
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
    return fallo("eliminarGastoPersonal", e);
  }
}

// Genera una nómina por cada trabajador activo que aún no la tenga este mes,
// con su salario de referencia (como el "generar nóminas" de JOMA).
export async function generarNominasDelMes(
  mes: string,
): Promise<Resultado & { creadas?: number; sinSalario?: number }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, error: "Mes no válido" };

  try {
    const [activos, delMes] = await Promise.all([
      conPlazo(db.select().from(schema.personalTrabajadores).where(eq(schema.personalTrabajadores.activo, true))),
      conPlazo(db.select().from(schema.personalGastos).where(eq(schema.personalGastos.mes, mes))),
    ]);
    if (activos.length === 0) return { ok: false, error: "No hay trabajadores activos. Añade tu plantilla primero." };

    const yaTienen = new Set(delMes.filter((g) => g.trabajadorId).map((g) => g.trabajadorId));
    const pendientes = activos.filter((t) => !yaTienen.has(t.id) && t.salario != null);
    const sinSalario = activos.filter((t) => !yaTienen.has(t.id) && t.salario == null).length;
    if (pendientes.length === 0) {
      return { ok: false, error: "Todos los trabajadores con salario ya tienen su nómina este mes" };
    }

    await conPlazo(
      db.insert(schema.personalGastos).values(
        pendientes.map((t) => ({
          mes,
          concepto: `Nómina ${t.nombre}`,
          importe: t.salario!,
          tipo: "nomina" as const,
          trabajadorId: t.id,
        })),
      ),
    );
    revalidar();
    return { ok: true, creadas: pendientes.length, sinSalario };
  } catch (e) {
    return fallo("generarNominasDelMes", e);
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
    // Se copia importe/tipo/trabajador; el PDF NO (es específico de cada mes).
    await conPlazo(
      db.insert(schema.personalGastos).values(
        nuevos.map((a) => ({
          mes,
          concepto: a.concepto,
          importe: a.importe,
          tipo: a.tipo,
          trabajadorId: a.trabajadorId,
        })),
      ),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("copiarMesAnterior", e);
  }
}

// ── Documento (PDF de la nómina) ────────────────────────────────────────

// Llega como data URL (application/pdf o imagen) desde el cliente. Tope 4 MB
// porque va en base64 en la BD (sin Storage todavía).
export async function subirDocumentoNomina(
  id: string,
  dataUrl: string,
  nombre: string,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(dataUrl)) {
    return { ok: false, error: "Sube un PDF o una imagen de la nómina" };
  }
  if (dataUrl.length > 5_600_000) {
    // ~4 MB de fichero → ~5,6 MB en base64
    return { ok: false, error: "El documento es demasiado grande (máx. 4 MB)" };
  }
  try {
    await conPlazo(
      db
        .update(schema.personalGastos)
        .set({ documento: dataUrl, documentoNombre: nombre.slice(0, 160) })
        .where(eq(schema.personalGastos.id, id)),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("subirDocumentoNomina", e);
  }
}

export async function quitarDocumentoNomina(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(
      db
        .update(schema.personalGastos)
        .set({ documento: null, documentoNombre: null })
        .where(eq(schema.personalGastos.id, id)),
    );
    revalidar();
    return { ok: true };
  } catch (e) {
    return fallo("quitarDocumentoNomina", e);
  }
}

// Devuelve el PDF (base64) bajo demanda para verlo/descargarlo, para no
// arrastrarlo en el listado del mes.
export async function getDocumentoNomina(
  id: string,
): Promise<{ ok: boolean; dataUrl?: string; nombre?: string | null; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [fila] = await conPlazo(
      db
        .select({ documento: schema.personalGastos.documento, nombre: schema.personalGastos.documentoNombre })
        .from(schema.personalGastos)
        .where(eq(schema.personalGastos.id, id)),
    );
    if (!fila?.documento) return { ok: false, error: "Sin documento" };
    return { ok: true, dataUrl: fila.documento, nombre: fila.nombre };
  } catch (e) {
    return fallo("getDocumentoNomina", e);
  }
}
