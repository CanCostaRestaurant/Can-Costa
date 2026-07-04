"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lt, sql, sum } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string; id?: string };

const SIN_BD: Resultado = { ok: false, error: "Base de datos no configurada" };

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[tpv] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return { ok: false, error: "La base de datos no responde ahora mismo — reintenta" };
}

function revalidarTpv(): void {
  revalidatePath("/tpv");
}

async function ticketAbierto(db: NonNullable<ReturnType<typeof getDb>>, ticketId: string) {
  const [t] = await conPlazo(db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)));
  return t?.estado === "abierto" ? t : null;
}

// Abre (o recupera) el ticket de una mesa. mesaId null = para llevar.
export async function abrirTicket(mesaId: string | null): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    if (mesaId) {
      const [existente] = await conPlazo(
        db
          .select()
          .from(schema.tickets)
          .where(and(eq(schema.tickets.mesaId, mesaId), eq(schema.tickets.estado, "abierto"))),
      );
      if (existente) return { ok: true, id: existente.id };
    }
    const [nuevo] = await conPlazo(
      db.insert(schema.tickets).values({ mesaId }).returning({ id: schema.tickets.id }),
    );
    revalidarTpv();
    return { ok: true, id: nuevo.id };
  } catch (e) {
    return fallo("abrirTicket", e);
  }
}

export async function agregarLineaTicket(
  ticketId: string,
  datos: { platoId?: string; descripcion?: string; precio?: number; cantidad?: number },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket no está abierto" };

    let descripcion: string;
    let precio: number;
    let platoId: string | null = null;

    if (datos.platoId) {
      const [plato] = await conPlazo(db.select().from(schema.platos).where(eq(schema.platos.id, datos.platoId)));
      if (!plato) return { ok: false, error: "Plato no encontrado" };
      if (plato.pvp === null) return { ok: false, error: `"${plato.nombre}" no tiene PVP — ponlo en Escandallos` };
      descripcion = plato.nombre;
      precio = Number(plato.pvp);
      platoId = plato.id;
    } else {
      if (!datos.descripcion?.trim()) return { ok: false, error: "Indica la descripción" };
      if (datos.precio === undefined || !Number.isFinite(datos.precio) || datos.precio < 0) {
        return { ok: false, error: "Precio no válido" };
      }
      descripcion = datos.descripcion.trim();
      precio = datos.precio;
    }

    const cantidad = datos.cantidad && datos.cantidad > 0 ? Math.round(datos.cantidad) : 1;

    // Si ya hay una línea igual, incrementa cantidad en vez de duplicar.
    const lineas = await conPlazo(
      db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId)),
    );
    const igual = lineas.find((l) =>
      platoId ? l.platoId === platoId : l.platoId === null && l.descripcion === descripcion && Number(l.precioUnitario) === precio,
    );

    if (igual) {
      const nuevaCantidad = igual.cantidad + cantidad;
      await conPlazo(
        db
          .update(schema.ticketLineas)
          .set({ cantidad: nuevaCantidad, total: (nuevaCantidad * Number(igual.precioUnitario)).toFixed(2) })
          .where(eq(schema.ticketLineas.id, igual.id)),
      );
    } else {
      await conPlazo(
        db.insert(schema.ticketLineas).values({
          ticketId,
          platoId,
          descripcion,
          cantidad,
          precioUnitario: precio.toFixed(2),
          total: (cantidad * precio).toFixed(2),
        }),
      );
    }
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("agregarLineaTicket", e);
  }
}

export async function cambiarCantidadLinea(
  lineaId: string,
  ticketId: string,
  delta: number,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket no está abierto" };
    const [linea] = await conPlazo(db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.id, lineaId)));
    if (!linea || linea.ticketId !== ticketId) return { ok: false, error: "Línea no encontrada" };

    const nueva = linea.cantidad + Math.round(delta);
    if (nueva <= 0) {
      await conPlazo(db.delete(schema.ticketLineas).where(eq(schema.ticketLineas.id, lineaId)));
    } else {
      await conPlazo(
        db
          .update(schema.ticketLineas)
          .set({ cantidad: nueva, total: (nueva * Number(linea.precioUnitario)).toFixed(2) })
          .where(eq(schema.ticketLineas.id, lineaId)),
      );
    }
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("cambiarCantidadLinea", e);
  }
}

export async function cambiarComensales(ticketId: string, comensales: number): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!Number.isFinite(comensales) || comensales < 1 || comensales > 99) {
    return { ok: false, error: "Comensales no válidos" };
  }
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket no está abierto" };
    await conPlazo(
      db.update(schema.tickets).set({ comensales: Math.round(comensales) }).where(eq(schema.tickets.id, ticketId)),
    );
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("cambiarComensales", e);
  }
}

// Registra un pago (parcial o total) de un ticket. Cuando la suma de pagos
// llega al total, el ticket se cierra solo: nº correlativo, método (o
// 'mixto' si mezclaron) y recálculo de las ventas del día.
export async function registrarPago(
  ticketId: string,
  datos: { metodo: "efectivo" | "tarjeta"; importe: number; entregado?: number },
): Promise<Resultado & { restante?: number; cerrado?: boolean }> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!Number.isFinite(datos.importe) || datos.importe <= 0) {
    return { ok: false, error: "Importe no válido" };
  }
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket no está abierto" };
    const [lineas, pagosPrevios] = await Promise.all([
      conPlazo(db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId))),
      conPlazo(db.select().from(schema.ticketPagos).where(eq(schema.ticketPagos.ticketId, ticketId))),
    ]);
    if (lineas.length === 0) return { ok: false, error: "El ticket está vacío" };

    const total = lineas.reduce((acc, l) => acc + Number(l.total), 0);
    const pagado = pagosPrevios.reduce((acc, p) => acc + Number(p.importe), 0);
    const pendiente = Math.round((total - pagado) * 100) / 100;
    const importe = Math.round(datos.importe * 100) / 100;

    if (importe > pendiente + 0.001) {
      return { ok: false, error: `Quedan ${pendiente.toFixed(2).replace(".", ",")} € por cobrar — el pago no puede ser mayor` };
    }
    if (datos.metodo === "efectivo" && datos.entregado !== undefined && datos.entregado > 0 && datos.entregado < importe - 0.001) {
      return { ok: false, error: "El efectivo entregado es menor que el importe a cobrar" };
    }

    await conPlazo(
      db.insert(schema.ticketPagos).values({
        ticketId,
        metodo: datos.metodo,
        importe: importe.toFixed(2),
        entregado: datos.metodo === "efectivo" && datos.entregado ? datos.entregado.toFixed(2) : null,
      }),
    );

    const restante = Math.round((pendiente - importe) * 100) / 100;
    if (restante > 0.001) {
      revalidarTpv();
      return { ok: true, id: ticketId, restante, cerrado: false };
    }

    // ── Pagado del todo: cerrar el ticket ──
    const metodos = new Set([...pagosPrevios.map((p) => p.metodo), datos.metodo]);
    const metodoFinal = metodos.size > 1 ? ("mixto" as const) : datos.metodo;
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10);
    const desde = new Date(fecha + "T00:00:00Z");
    const hasta = new Date(desde.getTime() + 86_400_000);

    // Nº de ticket correlativo del año (a partir del máximo existente).
    const inicioAnyo = new Date(`${ahora.getUTCFullYear()}-01-01T00:00:00Z`);
    const [ult] = await conPlazo(
      db
        .select({ maximo: sql<number>`coalesce(max(${schema.tickets.numero}), 0)` })
        .from(schema.tickets)
        .where(and(eq(schema.tickets.estado, "cobrado"), gte(schema.tickets.cobradoAt, inicioAnyo))),
    );
    const numero = Number(ult?.maximo ?? 0) + 1;

    await conPlazo(
      db
        .update(schema.tickets)
        .set({
          estado: "cobrado",
          metodoPago: metodoFinal,
          numero,
          entregado: null, // el entregado vive en cada pago
          total: total.toFixed(2),
          cobradoAt: ahora,
        })
        .where(eq(schema.tickets.id, ticketId)),
    );

    // Ventas del día = suma de todos los tickets cobrados hoy (origen tpv).
    const [suma] = await conPlazo(
      db
        .select({ total: sum(schema.tickets.total) })
        .from(schema.tickets)
        .where(
          and(
            eq(schema.tickets.estado, "cobrado"),
            gte(schema.tickets.cobradoAt, desde),
            lt(schema.tickets.cobradoAt, hasta),
          ),
        ),
    );
    const totalDia = suma?.total ? Number(suma.total) : total;
    await conPlazo(
      db
        .insert(schema.ventasDia)
        .values({ fecha, total: totalDia.toFixed(2), origen: "tpv" })
        .onConflictDoUpdate({
          target: schema.ventasDia.fecha,
          set: { total: totalDia.toFixed(2), origen: "tpv" },
        }),
    );

    revalidarTpv();
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/");
    return { ok: true, id: ticketId, restante: 0, cerrado: true };
  } catch (e) {
    return fallo("registrarPago", e);
  }
}

// Cobro de un toque (todo el ticket de una vez) — envoltorio de registrarPago.
export async function cobrarTicket(
  ticketId: string,
  metodo: "efectivo" | "tarjeta",
  entregado?: number,
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [lineas, pagos] = await Promise.all([
      conPlazo(db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId))),
      conPlazo(db.select().from(schema.ticketPagos).where(eq(schema.ticketPagos.ticketId, ticketId))),
    ]);
    const total = lineas.reduce((acc, l) => acc + Number(l.total), 0);
    const pagado = pagos.reduce((acc, p) => acc + Number(p.importe), 0);
    const pendiente = Math.round((total - pagado) * 100) / 100;
    if (pendiente <= 0) return { ok: false, error: "El ticket ya está pagado" };
    return await registrarPago(ticketId, { metodo, importe: pendiente, entregado });
  } catch (e) {
    return fallo("cobrarTicket", e);
  }
}

// Deshacer un pago parcial (equivocación) mientras el ticket siga abierto.
export async function eliminarPago(pagoId: string, ticketId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket ya está cerrado" };
    const [pago] = await conPlazo(db.select().from(schema.ticketPagos).where(eq(schema.ticketPagos.id, pagoId)));
    if (!pago || pago.ticketId !== ticketId) return { ok: false, error: "Pago no encontrado" };
    await conPlazo(db.delete(schema.ticketPagos).where(eq(schema.ticketPagos.id, pagoId)));
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("eliminarPago", e);
  }
}

export async function anularTicket(ticketId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    if (!(await ticketAbierto(db, ticketId))) return { ok: false, error: "El ticket no está abierto" };
    const pagos = await conPlazo(db.select().from(schema.ticketPagos).where(eq(schema.ticketPagos.ticketId, ticketId)));
    if (pagos.length > 0) {
      return { ok: false, error: "Este ticket tiene pagos registrados: deshazlos antes de anular (y devuelve el dinero)" };
    }
    await conPlazo(db.update(schema.tickets).set({ estado: "anulado" }).where(eq(schema.tickets.id, ticketId)));
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("anularTicket", e);
  }
}

// ── Distribución de mesas (preparada para el futuro módulo de reservas) ──

export async function crearMesa(datos: {
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!datos.nombre.trim()) return { ok: false, error: "Ponle nombre a la mesa" };
  if (!Number.isFinite(datos.capacidad) || datos.capacidad < 1 || datos.capacidad > 30) {
    return { ok: false, error: "Capacidad entre 1 y 30" };
  }
  try {
    await conPlazo(
      db.insert(schema.mesas).values({
        nombre: datos.nombre.trim(),
        zona: datos.zona,
        capacidad: Math.round(datos.capacidad),
        orden: 999,
      }),
    );
    revalidatePath("/tpv/mesas");
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("crearMesa", e);
  }
}

// Coloca una mesa en el plano del local (x/y en % del lienzo).
export async function moverMesa(id: string, posX: number, posY: number): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  if (!Number.isFinite(posX) || !Number.isFinite(posY)) return { ok: false, error: "Posición no válida" };
  try {
    await conPlazo(
      db
        .update(schema.mesas)
        .set({
          posX: Math.round(Math.min(98, Math.max(2, posX))),
          posY: Math.round(Math.min(96, Math.max(4, posY))),
        })
        .where(eq(schema.mesas.id, id)),
    );
    revalidatePath("/tpv/mesas");
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("moverMesa", e);
  }
}

export async function actualizarMesa(
  id: string,
  datos: {
    nombre?: string;
    zona?: "sala" | "terraza" | "barra";
    capacidad?: number;
    activo?: boolean;
    forma?: "cuadrada" | "redonda" | "alargada";
    combinable?: boolean;
  },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;

  const set: Record<string, unknown> = {};
  if (datos.nombre !== undefined) {
    if (!datos.nombre.trim()) return { ok: false, error: "El nombre no puede estar vacío" };
    set.nombre = datos.nombre.trim();
  }
  if (datos.zona !== undefined) set.zona = datos.zona;
  if (datos.forma !== undefined) set.forma = datos.forma;
  if (datos.combinable !== undefined) set.combinable = datos.combinable;
  if (datos.capacidad !== undefined) {
    if (!Number.isFinite(datos.capacidad) || datos.capacidad < 1 || datos.capacidad > 30) {
      return { ok: false, error: "Capacidad entre 1 y 30" };
    }
    set.capacidad = Math.round(datos.capacidad);
  }
  if (datos.activo !== undefined) set.activo = datos.activo;
  if (Object.keys(set).length === 0) return { ok: true };

  try {
    await conPlazo(db.update(schema.mesas).set(set).where(eq(schema.mesas.id, id)));
    revalidatePath("/tpv/mesas");
    revalidarTpv();
    return { ok: true };
  } catch (e) {
    return fallo("actualizarMesa", e);
  }
}
