"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, max } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { getAjustes } from "@/lib/db/queries";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";

type Resultado = { ok: boolean; error?: string; id?: string; numero?: string };

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

// Emite una factura de venta a partir de un ticket ya cobrado. Numeración
// correlativa sin huecos por serie=año (como Dogterra): el correlativo se
// asigna dentro de una transacción y hay índice único (serie, correlativo).
export async function emitirFactura(datos: {
  ticketId: string;
  nombre: string;
  cif: string;
  direccion?: string;
  guardarEnCliente?: boolean; // volcar los datos fiscales a la ficha del cliente
}): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const nombre = datos.nombre?.trim();
  const cif = datos.cif?.trim();
  const direccion = datos.direccion?.trim() || null;
  if (!nombre) return { ok: false, error: "Falta el nombre o razón social del cliente" };
  if (!cif) return { ok: false, error: "Falta el NIF/CIF del cliente (obligatorio en una factura)" };

  try {
    // El ticket debe estar cobrado y no tener ya una factura emitida.
    const [ticket] = await conPlazo(
      db.select().from(schema.tickets).where(eq(schema.tickets.id, datos.ticketId)).limit(1),
    );
    if (!ticket) return { ok: false, error: "El ticket no existe" };
    if (ticket.estado !== "cobrado") return { ok: false, error: "Solo se factura un ticket ya cobrado" };

    const [yaFactura] = await conPlazo(
      db
        .select({ id: schema.facturasVenta.id, numero: schema.facturasVenta.numero })
        .from(schema.facturasVenta)
        .where(and(eq(schema.facturasVenta.ticketId, datos.ticketId), eq(schema.facturasVenta.estado, "emitida")))
        .limit(1),
    );
    if (yaFactura) return { ok: false, error: `Este ticket ya tiene la factura ${yaFactura.numero}` };

    // Líneas del ticket → snapshot inmutable de la factura.
    const lineasTicket = await conPlazo(
      db
        .select()
        .from(schema.ticketLineas)
        .where(eq(schema.ticketLineas.ticketId, datos.ticketId))
        .orderBy(schema.ticketLineas.createdAt),
    );
    if (lineasTicket.length === 0) return { ok: false, error: "El ticket no tiene líneas" };

    const ajustes = await getAjustes();
    const total = Number(ticket.total ?? lineasTicket.reduce((a, l) => a + Number(l.total), 0));
    const ivaPct = ajustes.ivaVentasPct;
    const base = Math.round((total / (1 + ivaPct / 100)) * 100) / 100;
    const iva = Math.round((total - base) * 100) / 100;

    const lineas = lineasTicket.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: Number(l.precioUnitario),
      total: Number(l.total),
    }));

    const fecha = hoyMadrid();
    const serie = fecha.slice(0, 4);

    // Quién emite (nombre de la sesión).
    let emitidaPor: string | null = null;
    const secreto = process.env.AUTH_SECRET;
    if (secreto) {
      const almacen = await cookies();
      const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
      if (sesion.ok) emitidaPor = sesion.nombre;
    }

    // Correlativo + inserción en una transacción; reintenta si dos cobros
    // simultáneos pillan el mismo número (choca con el índice único).
    let creada: { id: string; numero: string } | null = null;
    for (let intento = 0; intento < 3 && !creada; intento++) {
      try {
        creada = await conPlazo(
          db.transaction(async (tx) => {
            const [{ maxc }] = await tx
              .select({ maxc: max(schema.facturasVenta.correlativo) })
              .from(schema.facturasVenta)
              .where(eq(schema.facturasVenta.serie, serie));
            const correlativo = (maxc ?? 0) + 1;
            const numero = `${serie}/${String(correlativo).padStart(4, "0")}`;

            const [ins] = await tx
              .insert(schema.facturasVenta)
              .values({
                serie,
                correlativo,
                numero,
                fecha,
                ticketId: datos.ticketId,
                clienteId: ticket.clienteId,
                clienteNombre: nombre,
                clienteCif: cif,
                clienteDireccion: direccion,
                lineas,
                base: base.toFixed(2),
                iva: iva.toFixed(2),
                ivaPct: ivaPct.toFixed(2),
                total: total.toFixed(2),
                emitidaPor,
              })
              .returning({ id: schema.facturasVenta.id, numero: schema.facturasVenta.numero });

            // Guardar los datos fiscales en la ficha del cliente (si procede).
            if (datos.guardarEnCliente && ticket.clienteId) {
              await tx
                .update(schema.clientes)
                .set({ cif, razonSocial: nombre, direccionFiscal: direccion, updatedAt: new Date() })
                .where(eq(schema.clientes.id, ticket.clienteId));
            }
            return { id: ins.id, numero: ins.numero };
          }),
          15_000,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate key|unique/i.test(msg) || intento === 2) throw e;
        // colisión de correlativo: reintenta con el siguiente número
      }
    }

    if (!creada) return { ok: false, error: "No se pudo asignar el número de factura" };

    revalidatePath("/facturacion");
    revalidatePath(`/tpv/recibo/${datos.ticketId}`);
    return { ok: true, id: creada.id, numero: creada.numero };
  } catch (e) {
    console.error("[facturacion] emitirFactura falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Anula una factura (no se borra: la numeración no puede tener huecos). Queda
// registrada como anulada y deja de sumar en el registro para declarar.
export async function anularFactura(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [f] = await conPlazo(
      db.select({ ticketId: schema.facturasVenta.ticketId }).from(schema.facturasVenta).where(eq(schema.facturasVenta.id, id)).limit(1),
    );
    await conPlazo(
      db
        .update(schema.facturasVenta)
        .set({ estado: "anulada", updatedAt: new Date() })
        .where(eq(schema.facturasVenta.id, id)),
    );
    revalidatePath("/facturacion");
    if (f?.ticketId) revalidatePath(`/tpv/recibo/${f.ticketId}`);
    return { ok: true };
  } catch (e) {
    console.error("[facturacion] anularFactura falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
