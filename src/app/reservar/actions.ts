"use server";

// Reserva desde la web PÚBLICA (sin login). Reutiliza el mismo motor que el
// CRM: mandos (doblaje/turnos/cupo), parrilla de disponibilidad, asignador de
// mesa y confirmación por email/SMS. Las reservas entran con origen='web' y se
// vinculan al cliente. Validación estricta porque esto está expuesto a
// internet (honeypot + límites de tamaño + turnos y disponibilidad reales).
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { duracionPorComensales } from "@/lib/reservas/config";
import { horaAMinutos, sugerirMesa, type MesaAsignable, type Ocupacion } from "@/lib/reservas/asignador";
import { calcularDisponibilidad, minutosAHora, type SlotDisponibilidad } from "@/lib/reservas/disponibilidad";
import { enviarEmailConfirmacion, enviarSmsConfirmacion } from "@/lib/notificaciones/reserva";
import { buscarCoincidencia, normalizarEmail } from "@/lib/clientes/identidad";

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

async function ocupacionesDelDia(db: Db, fecha: string): Promise<Ocupacion[]> {
  const filas = await conPlazo(
    db
      .select()
      .from(schema.reservas)
      .where(
        and(
          eq(schema.reservas.fecha, fecha),
          inArray(schema.reservas.estado, ["confirmada", "sentada"]),
          isNotNull(schema.reservas.mesaId),
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

// Sin exponer la ocupación exacta al público: solo el estado del tramo.
export async function disponibilidadPublica(
  fecha: string,
  comensales: number,
): Promise<{ ok: boolean; slots?: SlotDisponibilidad[]; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Las reservas online no están disponibles ahora mismo" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida" };
  const pax = Math.round(comensales);
  if (!Number.isFinite(pax) || pax < 1 || pax > 20) return { ok: false, error: "Grupo no válido" };

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
            and(eq(schema.reservas.fecha, fecha), inArray(schema.reservas.estado, ["confirmada", "sentada"])),
          ),
      ),
    ]);
    const entradas = reservasDia.map((r) => ({ inicioMin: horaAMinutos(r.hora), comensales: r.comensales }));
    // El público no puede forzar fuera de turno: solo tramos dentro de servicio.
    const slots = calcularDisponibilidad(pax, mesas, ocupaciones, entradas, mandos);
    return { ok: true, slots };
  } catch (e) {
    console.error("[reservar] disponibilidadPublica falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "No se pudo cargar la disponibilidad. Inténtalo de nuevo." };
  }
}

// Cuando el día pedido está COMPLETO: busca las próximas fechas con al menos
// un hueco para ese grupo, para no perder la reserva (cross-selling de días).
// Devuelve hasta `max` fechas con su hora libre más temprana. Es puro cálculo
// en memoria tras UNA sola consulta al rango, así que explorar ~3 semanas sale
// barato.
export async function proximasFechasLibres(
  desde: string,
  comensales: number,
  max = 3,
): Promise<{ ok: boolean; fechas?: { fecha: string; hora: string }[]; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "no disponible" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { ok: false, error: "Fecha no válida" };
  const pax = Math.round(comensales);
  if (!Number.isFinite(pax) || pax < 1 || pax > 20) return { ok: false, error: "Grupo no válido" };

  const VENTANA = 21; // días a explorar tras la fecha llena
  const base = new Date(`${desde}T00:00:00`);
  const dias = Array.from({ length: VENTANA }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  try {
    const mandos = await cargarMandos();
    const [mesas, reservasRango] = await Promise.all([
      mesasAsignables(db),
      conPlazo(
        db
          .select({
            fecha: schema.reservas.fecha,
            hora: schema.reservas.hora,
            comensales: schema.reservas.comensales,
            duracionMin: schema.reservas.duracionMin,
            mesaId: schema.reservas.mesaId,
            mesa2Id: schema.reservas.mesa2Id,
          })
          .from(schema.reservas)
          .where(
            and(
              gte(schema.reservas.fecha, dias[0]),
              lte(schema.reservas.fecha, dias[dias.length - 1]),
              inArray(schema.reservas.estado, ["confirmada", "sentada"]),
            ),
          ),
      ),
    ]);

    // Bucketea las reservas por día → ocupaciones (mesas) + entradas (cupo).
    const porDia = new Map<string, { ocupaciones: Ocupacion[]; entradas: { inicioMin: number; comensales: number }[] }>();
    for (const r of reservasRango) {
      let b = porDia.get(r.fecha);
      if (!b) {
        b = { ocupaciones: [], entradas: [] };
        porDia.set(r.fecha, b);
      }
      const inicio = horaAMinutos(r.hora);
      b.entradas.push({ inicioMin: inicio, comensales: r.comensales });
      if (r.mesaId) {
        const fin = inicio + r.duracionMin;
        b.ocupaciones.push({ mesaId: r.mesaId, inicioMin: inicio, finMin: fin });
        if (r.mesa2Id) b.ocupaciones.push({ mesaId: r.mesa2Id, inicioMin: inicio, finMin: fin });
      }
    }

    const esLibre = (s: SlotDisponibilidad) => s.estado === "libre" || s.estado === "pocas";
    const fechas: { fecha: string; hora: string }[] = [];
    for (const dia of dias) {
      const b = porDia.get(dia) ?? { ocupaciones: [], entradas: [] };
      const slots = calcularDisponibilidad(pax, mesas, b.ocupaciones, b.entradas, mandos);
      const primera = slots.find(esLibre); // slots vienen en orden cronológico
      if (primera) {
        fechas.push({ fecha: dia, hora: primera.hora });
        if (fechas.length >= max) break;
      }
    }
    return { ok: true, fechas };
  } catch (e) {
    console.error("[reservar] proximasFechasLibres falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "No se pudo buscar disponibilidad." };
  }
}

export type ResultadoReservaWeb = {
  ok: boolean;
  error?: string;
  mesa?: string | null;
  hastaHora?: string;
  fecha?: string;
  hora?: string;
  comensales?: number;
  emailEnviado?: boolean; // solo true si la confirmación salió de verdad
  smsEnviado?: boolean;
};

export async function reservarPublica(datos: {
  nombre: string;
  telefono?: string;
  email?: string;
  fecha: string;
  hora: string;
  comensales: number;
  notas?: string;
  companyia?: string; // honeypot: debe llegar vacío
  origen?: "web" | "telefono"; // 'telefono' = agente de voz (/api/voz)
}): Promise<ResultadoReservaWeb> {
  const db = getDb();
  if (!db) return { ok: false, error: "Las reservas online no están disponibles ahora mismo" };

  // Honeypot anti-bots: un campo oculto que un humano nunca rellena.
  if (datos.companyia && datos.companyia.trim() !== "") return { ok: true, mesa: null };

  const nombre = (datos.nombre ?? "").trim();
  const telefono = (datos.telefono ?? "").trim();
  const email = (datos.email ?? "").trim();
  const notas = (datos.notas ?? "").trim();

  if (nombre.length < 2 || nombre.length > 80) return { ok: false, error: "Escribe tu nombre y apellido" };
  if (!telefono && !email) return { ok: false, error: "Déjanos un teléfono o un email para confirmarte" };
  if (email && !normalizarEmail(email)) return { ok: false, error: "El email no es válido" };
  if (telefono && telefono.replace(/\D/g, "").length < 9) return { ok: false, error: "El teléfono no es válido" };
  if (notas.length > 300) return { ok: false, error: "Las notas son demasiado largas" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { ok: false, error: "Fecha no válida" };
  if (!/^\d{2}:\d{2}$/.test(datos.hora)) return { ok: false, error: "Hora no válida" };
  const pax = Math.round(datos.comensales);
  if (!Number.isFinite(pax) || pax < 1 || pax > 20) return { ok: false, error: "Grupo entre 1 y 20 comensales" };

  // No permitir reservar en el pasado (mismo día se acepta cualquier hora).
  const hoy = new Date().toISOString().slice(0, 10);
  if (datos.fecha < hoy) return { ok: false, error: "Esa fecha ya ha pasado" };

  try {
    const mandos = await cargarMandos();

    // La hora debe caer dentro de un turno de servicio (el público no fuerza).
    const enServicio = mandos.servicios.some((s) => datos.hora >= s.inicio && datos.hora <= s.fin);
    if (!enServicio) return { ok: false, error: "Esa hora está fuera de nuestro horario de reservas" };

    const inicioMin = horaAMinutos(datos.hora);
    const duracionMin = duracionPorComensales(pax, mandos);
    const [mesas, ocupaciones] = await Promise.all([mesasAsignables(db), ocupacionesDelDia(db, datos.fecha)]);

    const sugerencia = sugerirMesa(
      { comensales: pax, inicioMin, duracionMin, zonaPreferida: null },
      mesas,
      ocupaciones,
      mandos.margenLimpiezaMin,
    );
    // Si entre que cargó la parrilla y confirmó se llenó, avisamos con honestidad.
    if (!sugerencia) {
      return { ok: false, error: "Justo se ha ocupado esa hora. Elige otra, por favor." };
    }

    // Vincular (o crear) el cliente por teléfono > email > nombre completo.
    const candidatos = await conPlazo(
      db
        .select({
          id: schema.clientes.id,
          nombre: schema.clientes.nombre,
          telefono: schema.clientes.telefono,
          email: schema.clientes.email,
        })
        .from(schema.clientes),
    );
    const coincidencia = buscarCoincidencia({ nombre, telefono, email }, candidatos);
    let clienteId: string;
    if (coincidencia) {
      clienteId = coincidencia.id;
      const set: Record<string, unknown> = {};
      if (!coincidencia.telefono && telefono) set.telefono = telefono;
      if (!coincidencia.email && normalizarEmail(email)) set.email = normalizarEmail(email);
      if (Object.keys(set).length) {
        set.updatedAt = new Date();
        await conPlazo(db.update(schema.clientes).set(set).where(eq(schema.clientes.id, clienteId)));
      }
    } else {
      const [nuevo] = await conPlazo(
        db
          .insert(schema.clientes)
          .values({ nombre, telefono: telefono || null, email: normalizarEmail(email) })
          .returning({ id: schema.clientes.id }),
      );
      clienteId = nuevo.id;
    }

    const hastaHora = minutosAHora(inicioMin + duracionMin);
    const mesaNombre = sugerencia.mesa2Nombre
      ? `${sugerencia.mesaNombre} + ${sugerencia.mesa2Nombre}`
      : sugerencia.mesaNombre;

    // Confirmación al cliente por los canales que haya dejado.
    const confirmacion = {
      nombre,
      email: email || null,
      telefono: telefono || null,
      fecha: datos.fecha,
      hora: datos.hora,
      comensales: pax,
      hastaHora,
      mesa: mesaNombre,
    };
    const [resEmail, resSms] = await Promise.all([
      email ? enviarEmailConfirmacion(confirmacion, mandos) : Promise.resolve(null),
      telefono ? enviarSmsConfirmacion(confirmacion, mandos) : Promise.resolve(null),
    ]);

    await conPlazo(
      db.insert(schema.reservas).values({
        nombre,
        telefono: telefono || null,
        email: email || null,
        clienteId,
        fecha: datos.fecha,
        hora: datos.hora,
        comensales: pax,
        duracionMin,
        mesaId: sugerencia.mesaId,
        mesa2Id: sugerencia.mesa2Id,
        notas: notas || null,
        origen: datos.origen === "telefono" ? "telefono" : "web",
        notifEmailAt: resEmail?.enviado ? new Date() : null,
        notifSmsAt: resSms?.enviado ? new Date() : null,
      }),
    );

    return {
      ok: true,
      mesa: mesaNombre,
      hastaHora,
      fecha: datos.fecha,
      hora: datos.hora,
      comensales: pax,
      emailEnviado: Boolean(resEmail?.enviado),
      smsEnviado: Boolean(resSms?.enviado),
    };
  } catch (e) {
    console.error("[reservar] reservarPublica falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "No se pudo completar la reserva. Inténtalo en un momento." };
  }
}
