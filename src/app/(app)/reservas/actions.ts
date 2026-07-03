"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import {
  horaAMinutos,
  reoptimizarAsignaciones,
  sugerirMesa,
  type MesaAsignable,
  type Ocupacion,
} from "@/lib/reservas/asignador";
import { CONFIG_RESERVAS } from "@/lib/reservas/config";
import { abrirTicket } from "../tpv/actions";

type Resultado = { ok: boolean; error?: string; mesaNombre?: string | null; motivo?: string; ticketId?: string };

const SIN_BD: Resultado = { ok: false, error: "Base de datos no configurada" };

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[reservas] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
}

type Db = NonNullable<ReturnType<typeof getDb>>;

async function mesasAsignables(db: Db): Promise<MesaAsignable[]> {
  const filas = await conPlazo(db.select().from(schema.mesas).where(eq(schema.mesas.activo, true)));
  return filas.map((m) => ({ id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad }));
}

async function ocupacionesDelDia(db: Db, fecha: string, excluirId?: string): Promise<Ocupacion[]> {
  const filas = await conPlazo(
    db
      .select()
      .from(schema.reservas)
      .where(
        and(
          eq(schema.reservas.fecha, fecha),
          inArray(schema.reservas.estado, ["confirmada", "sentada"]),
          isNotNull(schema.reservas.mesaId),
          excluirId ? ne(schema.reservas.id, excluirId) : undefined,
        ),
      ),
  );
  return filas.map((f) => {
    const inicio = horaAMinutos(f.hora);
    return { mesaId: f.mesaId!, inicioMin: inicio, finMin: inicio + f.duracionMin };
  });
}

export async function crearReserva(datos: {
  nombre: string;
  telefono?: string;
  fecha: string;
  hora: string; // "HH:MM"
  comensales: number;
  zonaPreferida?: "sala" | "terraza" | "barra" | null;
  notas?: string;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!datos.nombre.trim()) return { ok: false, error: "Pon el nombre de la reserva" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { ok: false, error: "Fecha no válida" };
  if (!/^\d{2}:\d{2}$/.test(datos.hora)) return { ok: false, error: "Hora no válida" };
  if (!Number.isFinite(datos.comensales) || datos.comensales < 1 || datos.comensales > 40) {
    return { ok: false, error: "Comensales entre 1 y 40" };
  }

  try {
    const duracionMin = CONFIG_RESERVAS.duracionPorComensales(datos.comensales);
    const [mesas, ocupaciones] = await Promise.all([mesasAsignables(db), ocupacionesDelDia(db, datos.fecha)]);

    const sugerencia = sugerirMesa(
      {
        comensales: datos.comensales,
        inicioMin: horaAMinutos(datos.hora),
        duracionMin,
        zonaPreferida: datos.zonaPreferida ?? null,
      },
      mesas,
      ocupaciones,
    );

    await conPlazo(
      db.insert(schema.reservas).values({
        nombre: datos.nombre.trim(),
        telefono: datos.telefono?.trim() || null,
        fecha: datos.fecha,
        hora: datos.hora,
        comensales: Math.round(datos.comensales),
        duracionMin,
        zonaPreferida: datos.zonaPreferida ?? null,
        mesaId: sugerencia?.mesaId ?? null,
        notas: datos.notas?.trim() || null,
      }),
    );

    revalidatePath("/reservas");
    return {
      ok: true,
      mesaNombre: sugerencia?.mesaNombre ?? null,
      motivo: sugerencia?.motivo ?? "sin mesa libre para esa hora — revisa o reoptimiza",
    };
  } catch (e) {
    return fallo("crearReserva", e);
  }
}

export async function reasignarMesa(reservaId: string, mesaId: string | "auto" | null): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [reserva] = await conPlazo(db.select().from(schema.reservas).where(eq(schema.reservas.id, reservaId)));
    if (!reserva) return { ok: false, error: "Reserva no encontrada" };

    let nuevaMesa: string | null = null;
    let motivo = "sin mesa";
    if (mesaId === "auto") {
      const [mesas, ocupaciones] = await Promise.all([
        mesasAsignables(db),
        ocupacionesDelDia(db, reserva.fecha, reservaId),
      ]);
      const sugerencia = sugerirMesa(
        {
          comensales: reserva.comensales,
          inicioMin: horaAMinutos(reserva.hora),
          duracionMin: reserva.duracionMin,
          zonaPreferida: reserva.zonaPreferida,
        },
        mesas,
        ocupaciones,
      );
      if (!sugerencia) return { ok: false, error: "No hay mesa libre que encaje a esa hora" };
      nuevaMesa = sugerencia.mesaId;
      motivo = sugerencia.motivo;
    } else if (mesaId) {
      // Asignación manual: validar solape en esa mesa.
      const ocupaciones = await ocupacionesDelDia(db, reserva.fecha, reservaId);
      const inicio = horaAMinutos(reserva.hora);
      const fin = inicio + reserva.duracionMin + CONFIG_RESERVAS.margenLimpiezaMin;
      const choca = ocupaciones.some(
        (o) => o.mesaId === mesaId && o.inicioMin < fin && inicio < o.finMin + CONFIG_RESERVAS.margenLimpiezaMin,
      );
      if (choca) return { ok: false, error: "Esa mesa ya tiene una reserva que se solapa" };
      nuevaMesa = mesaId;
      motivo = "asignación manual";
    }

    await conPlazo(
      db.update(schema.reservas).set({ mesaId: nuevaMesa, updatedAt: new Date() }).where(eq(schema.reservas.id, reservaId)),
    );
    revalidatePath("/reservas");
    return { ok: true, motivo };
  } catch (e) {
    return fallo("reasignarMesa", e);
  }
}

export async function cambiarEstadoReserva(
  reservaId: string,
  estado: "confirmada" | "no_show" | "cancelada",
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    await conPlazo(
      db.update(schema.reservas).set({ estado, updatedAt: new Date() }).where(eq(schema.reservas.id, reservaId)),
    );
    revalidatePath("/reservas");
    return { ok: true };
  } catch (e) {
    return fallo("cambiarEstadoReserva", e);
  }
}

// Sentar: marca la reserva y abre la comanda de su mesa en el TPV.
export async function sentarReserva(reservaId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [reserva] = await conPlazo(db.select().from(schema.reservas).where(eq(schema.reservas.id, reservaId)));
    if (!reserva) return { ok: false, error: "Reserva no encontrada" };
    if (!reserva.mesaId) return { ok: false, error: "Asigna una mesa antes de sentar" };

    const ticket = await abrirTicket(reserva.mesaId);
    if (!ticket.ok || !ticket.id) return { ok: false, error: ticket.error ?? "No se pudo abrir el ticket" };

    await Promise.all([
      conPlazo(
        db
          .update(schema.reservas)
          .set({ estado: "sentada", updatedAt: new Date() })
          .where(eq(schema.reservas.id, reservaId)),
      ),
      conPlazo(
        db.update(schema.tickets).set({ comensales: reserva.comensales }).where(eq(schema.tickets.id, ticket.id)),
      ),
    ]);

    revalidatePath("/reservas");
    revalidatePath("/tpv");
    return { ok: true, ticketId: ticket.id };
  } catch (e) {
    return fallo("sentarReserva", e);
  }
}

// Reoptimización del día: reparte todas las reservas pendientes de mayor a
// menor grupo (first-fit decreasing). Las ya sentadas no se mueven.
export async function reoptimizarDia(fecha: string): Promise<Resultado & { asignadas?: number; sinMesa?: number }> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [mesas, pendientes, sentadas] = await Promise.all([
      mesasAsignables(db),
      conPlazo(
        db
          .select()
          .from(schema.reservas)
          .where(and(eq(schema.reservas.fecha, fecha), eq(schema.reservas.estado, "confirmada"))),
      ),
      conPlazo(
        db
          .select()
          .from(schema.reservas)
          .where(
            and(
              eq(schema.reservas.fecha, fecha),
              eq(schema.reservas.estado, "sentada"),
              isNotNull(schema.reservas.mesaId),
            ),
          ),
      ),
    ]);

    const fijas: Ocupacion[] = sentadas.map((f) => {
      const inicio = horaAMinutos(f.hora);
      return { mesaId: f.mesaId!, inicioMin: inicio, finMin: inicio + f.duracionMin };
    });

    const resultado = reoptimizarAsignaciones(
      pendientes.map((r) => ({
        id: r.id,
        comensales: r.comensales,
        inicioMin: horaAMinutos(r.hora),
        duracionMin: r.duracionMin,
        zonaPreferida: r.zonaPreferida,
      })),
      mesas,
      fijas,
    );

    let asignadas = 0;
    let sinMesa = 0;
    for (const [reservaId, sugerencia] of resultado) {
      if (sugerencia) asignadas += 1;
      else sinMesa += 1;
      await conPlazo(
        db
          .update(schema.reservas)
          .set({ mesaId: sugerencia?.mesaId ?? null, updatedAt: new Date() })
          .where(eq(schema.reservas.id, reservaId)),
      );
    }

    revalidatePath("/reservas");
    return { ok: true, asignadas, sinMesa };
  } catch (e) {
    return fallo("reoptimizarDia", e);
  }
}
