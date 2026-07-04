"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, desc, eq, gte, lt, inArray } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

type Resultado = { ok: boolean; error?: string };

// ── Retiradas de efectivo del cajón durante el día ──────────────────────

export async function crearRetirada(datos: {
  fecha: string;
  importe: number;
  motivo?: string;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { ok: false, error: "Fecha no válida" };
  if (!Number.isFinite(datos.importe) || datos.importe <= 0) return { ok: false, error: "Importe no válido" };
  try {
    await conPlazo(
      db.insert(schema.retiradasCaja).values({
        fecha: datos.fecha,
        importe: datos.importe.toFixed(2),
        motivo: datos.motivo?.trim().slice(0, 120) || null,
      }),
    );
    revalidatePath("/ventas");
    revalidatePath("/tpv/cierre");
    return { ok: true };
  } catch (e) {
    console.error("[cierre] crearRetirada falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

export async function eliminarRetirada(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    await conPlazo(db.delete(schema.retiradasCaja).where(eq(schema.retiradasCaja.id, id)));
    revalidatePath("/ventas");
    revalidatePath("/tpv/cierre");
    return { ok: true };
  } catch (e) {
    console.error("[cierre] eliminarRetirada falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Cierra (o rehace) la caja del día: exige que no queden mesas abiertas y
// guarda el cuadre con el snapshot de lo esperado en ese momento.
export async function cerrarCaja(datos: {
  fecha: string;
  efectivoContado: number;
  datafono: number;
  fondoSiguiente: number;
  notas?: string;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { ok: false, error: "Fecha no válida" };
  for (const [campo, v] of [
    ["efectivo contado", datos.efectivoContado],
    ["total del datáfono", datos.datafono],
    ["fondo para mañana", datos.fondoSiguiente],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `Revisa el ${campo}` };
  }

  try {
    // Sin mesas abiertas: todo cobrado o anulado antes de cerrar (como Dogterra).
    const abiertos = await conPlazo(
      db.select({ id: schema.tickets.id }).from(schema.tickets).where(eq(schema.tickets.estado, "abierto")),
    );
    if (abiertos.length > 0) {
      return { ok: false, error: `Hay ${abiertos.length} mesa(s) con ticket abierto: cóbralas o anúlalas antes de cerrar` };
    }

    // Esperado en este momento (snapshot para el histórico).
    const desde = new Date(datos.fecha + "T00:00:00Z");
    const hasta = new Date(desde.getTime() + 86_400_000);
    const cobrados = await conPlazo(
      db
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .where(
          and(
            eq(schema.tickets.estado, "cobrado"),
            gte(schema.tickets.cobradoAt, desde),
            lt(schema.tickets.cobradoAt, hasta),
          ),
        ),
    );
    let efectivoEsperado = 0;
    let tarjetaEsperada = 0;
    if (cobrados.length) {
      const pagos = await conPlazo(
        db
          .select()
          .from(schema.ticketPagos)
          .where(inArray(schema.ticketPagos.ticketId, cobrados.map((c) => c.id))),
      );
      for (const p of pagos) {
        if (p.metodo === "efectivo") efectivoEsperado += Number(p.importe);
        else tarjetaEsperada += Number(p.importe);
      }
    }

    const [previo] = await conPlazo(
      db
        .select()
        .from(schema.cierresCaja)
        .where(lt(schema.cierresCaja.fecha, datos.fecha))
        .orderBy(desc(schema.cierresCaja.fecha))
        .limit(1),
    );
    const fondoAnterior = previo ? Number(previo.fondoSiguiente) : 0;

    // Retiradas de efectivo del día → bajan el efectivo esperado en el cajón.
    const retiradasDia = await conPlazo(
      db.select().from(schema.retiradasCaja).where(eq(schema.retiradasCaja.fecha, datos.fecha)),
    );
    const retiradas = retiradasDia.reduce((acc, r) => acc + Number(r.importe), 0);

    // Quién cierra (nombre de la sesión).
    let cerradoPor: string | null = null;
    const secreto = process.env.AUTH_SECRET;
    if (secreto) {
      const almacen = await cookies();
      const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
      if (sesion.ok) cerradoPor = sesion.nombre;
    }

    await conPlazo(
      db
        .insert(schema.cierresCaja)
        .values({
          fecha: datos.fecha,
          efectivoContado: datos.efectivoContado.toFixed(2),
          datafono: datos.datafono.toFixed(2),
          fondoSiguiente: datos.fondoSiguiente.toFixed(2),
          efectivoEsperado: efectivoEsperado.toFixed(2),
          tarjetaEsperada: tarjetaEsperada.toFixed(2),
          fondoAnterior: fondoAnterior.toFixed(2),
          retiradas: retiradas.toFixed(2),
          notas: datos.notas?.trim() || null,
          cerradoPor,
        })
        .onConflictDoUpdate({
          target: schema.cierresCaja.fecha,
          set: {
            efectivoContado: datos.efectivoContado.toFixed(2),
            datafono: datos.datafono.toFixed(2),
            fondoSiguiente: datos.fondoSiguiente.toFixed(2),
            efectivoEsperado: efectivoEsperado.toFixed(2),
            tarjetaEsperada: tarjetaEsperada.toFixed(2),
            fondoAnterior: fondoAnterior.toFixed(2),
            retiradas: retiradas.toFixed(2),
            notas: datos.notas?.trim() || null,
            cerradoPor,
            updatedAt: new Date(),
          },
        }),
    );

    revalidatePath("/tpv/cierre");
    revalidatePath("/ventas");
    return { ok: true };
  } catch (e) {
    console.error("[cierre] cerrarCaja falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
