"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, max } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { getAjustes, getFacturaVenta } from "@/lib/db/queries";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";
import { enviarCorreo } from "@/lib/correo/enviar";
import { generarPdfFactura, nombrePdfFactura } from "@/lib/pdf/factura-pdf";

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

// Envía la factura por correo con el PDF adjunto, desde la misma cuenta Gmail
// del buzón (SMTP con IMAP_USER/IMAP_PASSWORD): sin abrir el correo ni nada.
export async function enviarFacturaPorCorreo(datos: { id: string; email: string }): Promise<Resultado> {
  const email = datos.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "Revisa el correo: no parece una dirección válida" };
  }

  const factura = await getFacturaVenta(datos.id);
  if (!factura) return { ok: false, error: "La factura no existe" };
  if (factura.estado === "anulada") return { ok: false, error: "Esta factura está anulada: no se puede enviar" };

  const pdf = generarPdfFactura(factura);
  const primerNombre = factura.cliente.nombre.split(" ")[0];
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#F7F3EC;border-radius:16px;padding:28px">
    <h2 style="margin:0 0 4px;color:#1c1917">Tu factura de ${factura.local.nombre}</h2>
    <p style="margin:0 0 20px;color:#57534e">Hola${primerNombre ? ` ${primerNombre}` : ""}, te adjuntamos la factura en PDF. ¡Gracias por tu visita!</p>
    <div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:20px">
      <p style="margin:0 0 6px">Factura <b>${factura.numero}</b> · ${factura.fechaLegible}</p>
      <p style="margin:0 0 6px;color:#57534e">${factura.cliente.nombre}${factura.cliente.cif ? ` · NIF ${factura.cliente.cif}` : ""}</p>
      <p style="margin:0;font-size:18px"><b>Total: ${factura.total.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b> <span style="color:#57534e;font-size:13px">(IVA incluido)</span></p>
    </div>
    <p style="margin:0;color:#78716c;font-size:13px">
      ${[factura.local.direccion, factura.local.telefono ? `Tel ${factura.local.telefono}` : null].filter(Boolean).join(" · ")}
    </p>
  </div>`;

  const res = await enviarCorreo({
    para: email,
    asunto: `Factura ${factura.numero} — ${factura.local.nombre}`,
    html,
    nombreRemitente: factura.local.nombre,
    adjuntos: [{ nombre: nombrePdfFactura(factura.numero), contenido: pdf, tipo: "application/pdf" }],
  });
  if (!res.enviado) return { ok: false, error: res.motivo ?? "No se pudo enviar el correo" };

  // Registrar a quién y cuándo se envió (best-effort: el correo ya salió).
  const db = getDb();
  if (db) {
    try {
      await conPlazo(
        db
          .update(schema.facturasVenta)
          .set({ enviadaA: email, enviadaAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.facturasVenta.id, datos.id)),
      );
    } catch (e) {
      console.error("[facturacion] no se pudo registrar el envío:", e instanceof Error ? e.message : e);
      resetDb();
    }
  }

  revalidatePath(`/facturacion/${datos.id}`);
  revalidatePath("/facturacion");
  return { ok: true };
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
