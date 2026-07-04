// Export del período (mes o trimestre) para la gestoría, en un ZIP:
//   facturas-emitidas/*.pdf      → PDF de cada factura emitida (se generan aquí)
//   facturas-emitidas.csv        → libro de facturas expedidas (una por línea)
//   facturas-recibidas.csv       → facturas de compra registradas (datos; los
//                                  originales están en el buzón de Gmail/papel)
//   ventas-diarias-tickets.csv   → asiento resumen DIARIO de los tickets
//                                  (factura simplificada): así se llevan al
//                                  libro registro, no ticket a ticket
//   LEEME.txt                    → qué es cada cosa
// La ruta cuelga de /facturacion → el proxy exige sesión (admin/gestor/tpv).
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import {
  etiquetaPeriodo,
  getAjustes,
  PERIODO_VALIDO,
  rangoPeriodo,
  type FacturaVenta,
} from "@/lib/db/queries";
import { generarPdfFactura, nombrePdfFactura } from "@/lib/pdf/factura-pdf";
import { crearZip, type EntradaZip } from "@/lib/zip";

export const dynamic = "force-dynamic";

const num = (v: number): string => v.toFixed(2).replace(".", ","); // decimal con coma (Excel es-ES)

// Campo CSV con separador ";": entrecomilla si hace falta.
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? num(v) : v;
  return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csv(cabecera: string[], filas: (string | number | null | undefined)[][]): Buffer {
  const lineas = [cabecera.join(";"), ...filas.map((f) => f.map(campo).join(";"))];
  return Buffer.from("﻿" + lineas.join("\r\n"), "utf8"); // BOM para Excel
}

function fechaLarga(fechaISO: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(fechaISO + "T12:00:00"),
  );
}

export async function GET(req: NextRequest) {
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "";
  if (!PERIODO_VALIDO.test(periodo)) {
    return NextResponse.json({ error: "Período no válido (usa YYYY-MM o YYYY-T1..T4)" }, { status: 400 });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });

  const { desde, hasta } = rangoPeriodo(periodo);

  try {
    const diaMadrid = sql<string>`(${schema.tickets.cobradoAt} at time zone 'Europe/Madrid')::date::text`;
    const [ajustes, emitidas, recibidas, ventasDias] = await conPlazo(
      Promise.all([
        getAjustes(),
        db
          .select()
          .from(schema.facturasVenta)
          .where(and(gte(schema.facturasVenta.fecha, desde), lt(schema.facturasVenta.fecha, hasta)))
          .orderBy(asc(schema.facturasVenta.serie), asc(schema.facturasVenta.correlativo)),
        db
          .select({ factura: schema.facturas, proveedor: schema.proveedores.nombre })
          .from(schema.facturas)
          .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
          .where(and(gte(schema.facturas.fecha, desde), lt(schema.facturas.fecha, hasta)))
          .orderBy(asc(schema.facturas.fecha)),
        db
          .select({
            dia: diaMadrid,
            tickets: sql<number>`count(*)::int`,
            total: sql<string>`coalesce(sum(${schema.tickets.total}), 0)`,
          })
          .from(schema.tickets)
          .where(
            and(
              eq(schema.tickets.estado, "cobrado"),
              sql`(${schema.tickets.cobradoAt} at time zone 'Europe/Madrid')::date >= ${desde}::date`,
              sql`(${schema.tickets.cobradoAt} at time zone 'Europe/Madrid')::date < ${hasta}::date`,
            ),
          )
          .groupBy(diaMadrid)
          .orderBy(diaMadrid),
      ]),
      20_000,
    );

    const local = {
      nombre: ajustes.nombreFiscal || "Can Costa",
      cif: ajustes.cif,
      direccion: ajustes.direccion,
      telefono: ajustes.telefono,
    };
    const entradas: EntradaZip[] = [];

    // ── Emitidas: un PDF por factura + CSV registro ──
    for (const f of emitidas) {
      const factura: FacturaVenta = {
        id: f.id,
        numero: f.numero,
        serie: f.serie,
        fecha: f.fecha,
        fechaLegible: fechaLarga(f.fecha),
        estado: f.estado,
        cliente: { id: f.clienteId, nombre: f.clienteNombre, cif: f.clienteCif, direccion: f.clienteDireccion },
        lineas: (f.lineas as FacturaVenta["lineas"]).map((l) => ({
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
          total: Number(l.total),
        })),
        base: Number(f.base),
        iva: Number(f.iva),
        ivaPct: Number(f.ivaPct),
        total: Number(f.total),
        ticketId: f.ticketId,
        emitidaPor: f.emitidaPor,
        clienteEmail: null,
        enviadaA: f.enviadaA,
        enviadaEl: null,
        local,
      };
      const sufijo = f.estado === "anulada" ? "-ANULADA" : "";
      entradas.push({
        nombre: `facturas-emitidas/${nombrePdfFactura(f.numero).replace(".pdf", `${sufijo}.pdf`)}`,
        datos: generarPdfFactura(factura),
      });
    }
    entradas.push({
      nombre: "facturas-emitidas.csv",
      datos: csv(
        ["Numero", "Fecha", "Cliente", "NIF", "Base", "IVA %", "Cuota IVA", "Total", "Estado", "Enviada a"],
        emitidas.map((f) => [
          f.numero,
          f.fecha,
          f.clienteNombre,
          f.clienteCif,
          Number(f.base),
          Number(f.ivaPct),
          Number(f.iva),
          Number(f.total),
          f.estado,
          f.enviadaA,
        ]),
      ),
    });

    // ── Recibidas: registro de facturas de compra (datos extraídos) ──
    entradas.push({
      nombre: "facturas-recibidas.csv",
      datos: csv(
        ["Fecha", "Proveedor", "Numero", "Tipo", "Categoria", "Base", "IVA", "Total", "Estado", "Pagada"],
        recibidas
          .filter((r) => r.factura.estado !== "error" && r.factura.estado !== "rechazada")
          .map((r) => [
            r.factura.fecha,
            r.proveedor ?? r.factura.proveedorTexto ?? "(sin identificar)",
            r.factura.numero,
            r.factura.tipo,
            r.factura.categoria,
            r.factura.base !== null ? Number(r.factura.base) : null,
            r.factura.iva !== null ? Number(r.factura.iva) : null,
            r.factura.total !== null ? Number(r.factura.total) : null,
            r.factura.estado,
            r.factura.pagada ? "si" : "no",
          ]),
      ),
    });

    // ── Ventas de tickets: asiento resumen diario (facturas simplificadas) ──
    const pct = ajustes.ivaVentasPct;
    entradas.push({
      nombre: "ventas-diarias-tickets.csv",
      datos: csv(
        ["Fecha", "Nº tickets", "Base", `Cuota IVA ${pct}%`, "Total (IVA incl.)"],
        ventasDias.map((v) => {
          const total = Number(v.total);
          const base = total / (1 + pct / 100);
          return [v.dia, v.tickets, Math.round(base * 100) / 100, Math.round((total - base) * 100) / 100, total];
        }),
      ),
    });

    entradas.push({
      nombre: "LEEME.txt",
      datos: Buffer.from(
        `Export para la gestoría — ${local.nombre}\r\n` +
          `Período: ${etiquetaPeriodo(periodo)} (${desde} a ${hasta}, este último excluido)\r\n\r\n` +
          `- facturas-emitidas/          PDF de cada factura emitida a clientes (las anuladas van marcadas y no computan)\r\n` +
          `- facturas-emitidas.csv       Libro registro de facturas expedidas (una por línea)\r\n` +
          `- facturas-recibidas.csv      Facturas y albaranes de compra registrados; los documentos originales están en el buzón de correo o en papel\r\n` +
          `- ventas-diarias-tickets.csv  Ventas por tickets (facturas simplificadas) como asiento resumen diario, con base y cuota de IVA\r\n\r\n` +
          `Los CSV usan ";" como separador y coma decimal (se abren directamente con Excel en español).\r\n`,
        "utf8",
      ),
    });

    const zip = crearZip(entradas);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="gestoria-${periodo}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[facturacion/exportar] falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el export (BD lenta); prueba de nuevo" }, { status: 503 });
  }
}
