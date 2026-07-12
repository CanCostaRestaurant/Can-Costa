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
import { duracionPorComensales, type MandosReservas } from "@/lib/reservas/config";
import { cargarMandos, guardarMandos } from "@/lib/reservas/mandos-db";
import {
  calcularDisponibilidad,
  minutosAHora,
  type SlotDisponibilidad,
} from "@/lib/reservas/disponibilidad";
import {
  enviarEmailConfirmacion,
  enviarSmsConfirmacion,
  etiquetaZona,
  type DatosConfirmacion,
} from "@/lib/notificaciones/reserva";
import { buscarCoincidencia, normalizarEmail } from "@/lib/clientes/identidad";
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
  return filas.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    zona: m.zona,
    capacidad: m.capacidad,
    combinable: m.combinable,
    posX: m.posX,
    posY: m.posY,
  }));
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
  return filas.flatMap((f) => {
    const inicio = horaAMinutos(f.hora);
    const fin = inicio + f.duracionMin;
    const bloques: Ocupacion[] = [{ mesaId: f.mesaId!, inicioMin: inicio, finMin: fin }];
    if (f.mesa2Id) bloques.push({ mesaId: f.mesa2Id, inicioMin: inicio, finMin: fin });
    return bloques;
  });
}

// Encuentra (o crea) el cliente detrás de una reserva: teléfono > email >
// nombre+apellido. Completa datos que le falten al cliente existente.
async function vincularCliente(
  db: Db,
  datos: { nombre: string; telefono?: string | null; email?: string | null },
): Promise<{ id: string; reservasPrevias: number; avisos: string[] }> {
  const candidatos = await conPlazo(
    db
      .select({
        id: schema.clientes.id,
        nombre: schema.clientes.nombre,
        telefono: schema.clientes.telefono,
        email: schema.clientes.email,
        etiquetas: schema.clientes.etiquetas,
        restricciones: schema.clientes.restricciones,
      })
      .from(schema.clientes),
  );
  const coincidencia = buscarCoincidencia(datos, candidatos);

  if (coincidencia) {
    const set: Record<string, unknown> = {};
    if (!coincidencia.telefono && datos.telefono?.trim()) set.telefono = datos.telefono.trim();
    if (!coincidencia.email && normalizarEmail(datos.email)) set.email = datos.email!.trim().toLowerCase();
    if (Object.keys(set).length) {
      set.updatedAt = new Date();
      await conPlazo(db.update(schema.clientes).set(set).where(eq(schema.clientes.id, coincidencia.id)));
    }
    const previas = await conPlazo(
      db.select().from(schema.reservas).where(eq(schema.reservas.clienteId, coincidencia.id)),
    );
    // Lo que quien coge el teléfono debe saber al vuelo: etiquetas y alergias.
    const ficha = candidatos.find((c) => c.id === coincidencia.id);
    const avisos = [...(ficha?.etiquetas ?? [])];
    if (ficha?.restricciones) avisos.push(`⚠️ ${ficha.restricciones}`);
    return { id: coincidencia.id, reservasPrevias: previas.length, avisos };
  }

  const [nuevo] = await conPlazo(
    db
      .insert(schema.clientes)
      .values({
        nombre: datos.nombre.trim(),
        telefono: datos.telefono?.trim() || null,
        email: normalizarEmail(datos.email) ? datos.email!.trim().toLowerCase() : null,
      })
      .returning({ id: schema.clientes.id }),
  );
  return { id: nuevo.id, reservasPrevias: 0, avisos: [] };
}

export async function crearReserva(datos: {
  nombre: string;
  telefono?: string;
  email?: string;
  fecha: string;
  hora: string; // "HH:MM"
  comensales: number;
  zonaPreferida?: "sala" | "terraza" | "barra" | null;
  notas?: string;
  notificar?: { email: boolean; sms: boolean }; // confirmación automática al cliente
}): Promise<Resultado & { cliente?: string | null; notificacion?: string | null }> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!datos.nombre.trim()) return { ok: false, error: "Pon el nombre de la reserva" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { ok: false, error: "Fecha no válida" };
  if (!/^\d{2}:\d{2}$/.test(datos.hora)) return { ok: false, error: "Hora no válida" };
  if (!Number.isFinite(datos.comensales) || datos.comensales < 1 || datos.comensales > 40) {
    return { ok: false, error: "Comensales entre 1 y 40" };
  }

  try {
    const mandos = await cargarMandos();
    const duracionMin = duracionPorComensales(datos.comensales, mandos);
    const [mesas, ocupaciones] = await Promise.all([mesasAsignables(db), ocupacionesDelDia(db, datos.fecha)]);

    const inicioMin = horaAMinutos(datos.hora);
    const sugerencia = sugerirMesa(
      {
        comensales: datos.comensales,
        inicioMin,
        duracionMin,
        zonaPreferida: datos.zonaPreferida ?? null,
      },
      mesas,
      ocupaciones,
      mandos.margenLimpiezaMin,
    );

    // Aviso (no bloqueo) si la hora cae fuera de los turnos de servicio:
    // el personal puede forzarla, como el "Horas no disponibles (asignar)"
    // de CoverManager.
    const enServicio = mandos.servicios.some(
      (s) => datos.hora >= s.inicio && datos.hora <= s.fin,
    );

    const cliente = await vincularCliente(db, datos);

    // Confirmación al cliente ANTES de insertar los timestamps: se apuntan
    // solo los envíos que realmente salieron.
    const hastaHora = minutosAHora(inicioMin + duracionMin);
    // El personal SÍ ve la mesa concreta (se devuelve al CRM); al cliente solo
    // la ZONA (terraza/interior), porque el nº puede cambiar el día del servicio.
    const mesaNombre = sugerencia
      ? sugerencia.mesa2Nombre
        ? `${sugerencia.mesaNombre} + ${sugerencia.mesa2Nombre}`
        : sugerencia.mesaNombre
      : null;
    const zonaCliente = sugerencia
      ? etiquetaZona(mesas.find((m) => m.id === sugerencia.mesaId)?.zona ?? null)
      : null;

    const confirmacion: DatosConfirmacion = {
      nombre: datos.nombre.trim(),
      email: datos.email?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      fecha: datos.fecha,
      hora: datos.hora,
      comensales: Math.round(datos.comensales),
      hastaHora,
      zona: zonaCliente,
    };
    const [resEmail, resSms] = await Promise.all([
      datos.notificar?.email ? enviarEmailConfirmacion(confirmacion, mandos) : Promise.resolve(null),
      datos.notificar?.sms ? enviarSmsConfirmacion(confirmacion, mandos) : Promise.resolve(null),
    ]);

    await conPlazo(
      db.insert(schema.reservas).values({
        nombre: datos.nombre.trim(),
        telefono: datos.telefono?.trim() || null,
        email: datos.email?.trim() || null,
        clienteId: cliente.id,
        fecha: datos.fecha,
        hora: datos.hora,
        comensales: Math.round(datos.comensales),
        duracionMin,
        zonaPreferida: datos.zonaPreferida ?? null,
        mesaId: sugerencia?.mesaId ?? null,
        mesa2Id: sugerencia?.mesa2Id ?? null,
        notas: datos.notas?.trim() || null,
        notifEmailAt: resEmail?.enviado ? new Date() : null,
        notifSmsAt: resSms?.enviado ? new Date() : null,
      }),
    );

    const notifPartes: string[] = [];
    if (resEmail) notifPartes.push(resEmail.enviado ? "✉ email enviado" : `✉ email NO enviado: ${resEmail.motivo}`);
    if (resSms) notifPartes.push(resSms.enviado ? "📱 SMS enviado" : `📱 SMS NO enviado: ${resSms.motivo}`);

    revalidatePath("/reservas");
    revalidatePath("/clientes");
    return {
      ok: true,
      mesaNombre,
      motivo: [
        sugerencia?.motivo ?? "sin mesa libre para esa hora — revisa o reoptimiza",
        !enServicio ? "⚠ hora fuera de los turnos de servicio" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      cliente:
        cliente.reservasPrevias > 0
          ? [`⭐ cliente habitual — ${cliente.reservasPrevias + 1}ª reserva`, ...cliente.avisos].join(" · ")
          : cliente.avisos.join(" · ") || null,
      notificacion: notifPartes.join(" · ") || null,
    };
  } catch (e) {
    return fallo("crearReserva", e);
  }
}

// Parrilla de horas estilo CoverManager: estado de cada tramo para una
// fecha y tamaño de grupo (la pinta el formulario de nueva reserva).
export async function disponibilidadDia(
  fecha: string,
  comensales: number,
): Promise<{ ok: boolean; slots?: SlotDisponibilidad[]; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida" };
  const pax = Math.round(comensales);
  if (!Number.isFinite(pax) || pax < 1 || pax > 40) return { ok: false, error: "Comensales no válidos" };

  try {
    const mandos = await cargarMandos();
    const [mesas, ocupaciones, reservasDia] = await Promise.all([
      mesasAsignables(db),
      ocupacionesDelDia(db, fecha),
      conPlazo(
        db
          .select({ hora: schema.reservas.hora, comensales: schema.reservas.comensales })
          .from(schema.reservas)
          .where(
            and(
              eq(schema.reservas.fecha, fecha),
              inArray(schema.reservas.estado, ["confirmada", "sentada"]),
            ),
          ),
      ),
    ]);

    const entradas = reservasDia.map((r) => ({
      inicioMin: horaAMinutos(r.hora),
      comensales: r.comensales,
    }));

    return { ok: true, slots: calcularDisponibilidad(pax, mesas, ocupaciones, entradas, mandos) };
  } catch (e) {
    const f = fallo("disponibilidadDia", e);
    return { ok: false, error: f.error };
  }
}

// Mandos del cover manager (los edita /reservas/ajustes).
export async function obtenerMandos(): Promise<MandosReservas> {
  return cargarMandos();
}

export async function guardarMandosReservas(mandos: MandosReservas): Promise<Resultado> {
  try {
    await guardarMandos(mandos);
    revalidatePath("/reservas");
    revalidatePath("/reservas/ajustes");
    return { ok: true };
  } catch (e) {
    return fallo("guardarMandosReservas", e);
  }
}

export async function reasignarMesa(reservaId: string, mesaId: string | "auto" | null): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [reserva] = await conPlazo(db.select().from(schema.reservas).where(eq(schema.reservas.id, reservaId)));
    if (!reserva) return { ok: false, error: "Reserva no encontrada" };

    let nuevaMesa: string | null = null;
    let nuevaMesa2: string | null = null;
    let motivo = "sin mesa";
    const mandos = await cargarMandos();
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
        mandos.margenLimpiezaMin,
      );
      if (!sugerencia) return { ok: false, error: "No hay mesa libre que encaje a esa hora" };
      nuevaMesa = sugerencia.mesaId;
      nuevaMesa2 = sugerencia.mesa2Id;
      motivo = sugerencia.motivo;
    } else if (mesaId) {
      // Asignación manual: validar solape en esa mesa.
      const ocupaciones = await ocupacionesDelDia(db, reserva.fecha, reservaId);
      const inicio = horaAMinutos(reserva.hora);
      const margen = mandos.margenLimpiezaMin;
      const fin = inicio + reserva.duracionMin + margen;
      const choca = ocupaciones.some(
        (o) => o.mesaId === mesaId && o.inicioMin < fin && inicio < o.finMin + margen,
      );
      if (choca) return { ok: false, error: "Esa mesa ya tiene una reserva que se solapa" };
      nuevaMesa = mesaId;
      motivo = "asignación manual";
    }

    await conPlazo(
      db
        .update(schema.reservas)
        .set({ mesaId: nuevaMesa, mesa2Id: nuevaMesa2, updatedAt: new Date() })
        .where(eq(schema.reservas.id, reservaId)),
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

// Confirmación del cliente (verde). Normalmente la pone el webhook de WhatsApp
// cuando el cliente responde SÍ, pero el personal también puede marcarla o
// quitarla a mano (útil antes de tener WhatsApp, o si confirman por teléfono).
export async function marcarConfirmadaCliente(reservaId: string, confirmada: boolean): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    await conPlazo(
      db
        .update(schema.reservas)
        .set({ confirmadaClienteAt: confirmada ? new Date() : null, updatedAt: new Date() })
        .where(eq(schema.reservas.id, reservaId)),
    );
    revalidatePath("/reservas");
    return { ok: true };
  } catch (e) {
    return fallo("marcarConfirmadaCliente", e);
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
        db
          .update(schema.tickets)
          .set({ comensales: reserva.comensales, reservaId: reserva.id, clienteId: reserva.clienteId })
          .where(eq(schema.tickets.id, ticket.id)),
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

    const mandos = await cargarMandos();
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
      mandos.margenLimpiezaMin,
    );

    let asignadas = 0;
    let sinMesa = 0;
    for (const [reservaId, sugerencia] of resultado) {
      if (sugerencia) asignadas += 1;
      else sinMesa += 1;
      await conPlazo(
        db
          .update(schema.reservas)
          .set({
            mesaId: sugerencia?.mesaId ?? null,
            mesa2Id: sugerencia?.mesa2Id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.reservas.id, reservaId)),
      );
    }

    revalidatePath("/reservas");
    return { ok: true, asignadas, sinMesa };
  } catch (e) {
    return fallo("reoptimizarDia", e);
  }
}
