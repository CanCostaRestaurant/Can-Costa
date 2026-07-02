// Capa de consultas de Can Costa. Cada función intenta leer de la BD real
// (Drizzle) y, si aún no hay DATABASE_URL configurada, cae a los datos mock
// para que la app siga funcionando durante el arranque.
import { asc, count, desc, eq, gte, inArray, isNotNull, and } from "drizzle-orm";
import { getDb, schema } from "./index";
import {
  COMPRAS_SEMANA,
  FACTURAS,
  KPIS,
  PRODUCTOS,
  type Factura,
  type LineaFactura,
  type Producto,
} from "@/lib/mock";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mesCorto(fechaISO: string): string {
  const mes = Number(fechaISO.slice(5, 7)) - 1;
  return MESES_CORTOS[mes] ?? "";
}

function fechaLegible(fechaISO: string | null): string {
  if (!fechaISO) return "—";
  const dia = Number(fechaISO.slice(8, 10));
  return `${dia} ${mesCorto(fechaISO)}`;
}

function precioTexto(valor: number, unidad: string): string {
  const n = valor.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  });
  return `${n} €/${unidad}`;
}

function generarNota(variacion: number, primerMes: string, ultimaCompra: string): string {
  const abs = Math.abs(variacion);
  if (variacion > 0) {
    return `Ha subido un <b>+${variacion}%</b> desde ${primerMes}. Última compra el ${ultimaCompra}.`;
  }
  if (variacion < 0) {
    return `Ha bajado un <b>${abs}%</b> desde ${primerMes}. Última compra el ${ultimaCompra}.`;
  }
  return `Precio estable. Última compra el ${ultimaCompra}.`;
}

export async function getProductosConHistorico(): Promise<Producto[]> {
  const db = getDb();
  if (!db) return PRODUCTOS; // sin BD configurada → datos de ejemplo

  const filas = await db
    .select({
      id: schema.productos.id,
      nombre: schema.productos.nombre,
      familia: schema.productos.familia,
      unidad: schema.productos.unidad,
      ultimaCompra: schema.productos.ultimaCompra,
      proveedor: schema.proveedores.nombre,
    })
    .from(schema.productos)
    .leftJoin(schema.proveedores, eq(schema.productos.proveedorId, schema.proveedores.id))
    .where(eq(schema.productos.activo, true))
    .orderBy(asc(schema.productos.nombre));

  if (filas.length === 0) return [];

  const ids = filas.map((f) => f.id);
  const puntos = await db
    .select({
      productoId: schema.precios.productoId,
      precio: schema.precios.precio,
      fecha: schema.precios.fecha,
    })
    .from(schema.precios)
    .where(inArray(schema.precios.productoId, ids))
    .orderBy(asc(schema.precios.fecha));

  // Agrupar el histórico por producto (Map, sin N+1).
  const porProducto = new Map<string, { precio: number; fecha: string }[]>();
  for (const p of puntos) {
    const arr = porProducto.get(p.productoId) ?? [];
    arr.push({ precio: Number(p.precio), fecha: p.fecha });
    porProducto.set(p.productoId, arr);
  }

  return filas.map((f): Producto => {
    const serie = (porProducto.get(f.id) ?? []).slice(-6);
    const hist = serie.map((s) => s.precio);
    const meses = serie.map((s) => mesCorto(s.fecha));
    const ultimo = hist.at(-1) ?? 0;
    const previo = hist.at(-2) ?? ultimo;
    const variacion = previo > 0 ? Math.round(((ultimo - previo) / previo) * 100) : 0;
    const ultimaCompra = fechaLegible(f.ultimaCompra ?? serie.at(-1)?.fecha ?? null);

    return {
      id: f.id,
      nombre: f.nombre,
      proveedor: f.proveedor ?? "—",
      precio: precioTexto(ultimo, f.unidad),
      ultimaCompra,
      variacion,
      familia: f.familia,
      hist: hist.length ? hist : [ultimo],
      meses: meses.length ? meses : [""],
      nota: generarNota(variacion, meses[0] ?? "", ultimaCompra),
    };
  });
}

// ---------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------

function num(cantidad: string): string {
  return Number(cantidad).toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

export async function getFacturas(): Promise<Factura[]> {
  const db = getDb();
  if (!db) return FACTURAS;

  const filas = await db
    .select({
      id: schema.facturas.id,
      numero: schema.facturas.numero,
      fecha: schema.facturas.fecha,
      total: schema.facturas.total,
      estado: schema.facturas.estado,
      origen: schema.facturas.origen,
      proveedor: schema.proveedores.nombre,
      proveedorTexto: schema.facturas.proveedorTexto,
    })
    .from(schema.facturas)
    .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
    .orderBy(desc(schema.facturas.fecha), desc(schema.facturas.createdAt));

  const conteos = await db
    .select({ facturaId: schema.facturaLineas.facturaId, n: count() })
    .from(schema.facturaLineas)
    .groupBy(schema.facturaLineas.facturaId);
  const lineasPorFactura = new Map(conteos.map((c) => [c.facturaId, Number(c.n)]));

  // Líneas completas solo para las facturas en bandeja (revisar).
  const idsRevisar = filas.filter((f) => f.estado === "revisar").map((f) => f.id);
  const detalles = new Map<string, LineaFactura[]>();
  if (idsRevisar.length) {
    const lineas = await db
      .select({
        facturaId: schema.facturaLineas.facturaId,
        descripcion: schema.facturaLineas.descripcion,
        cantidad: schema.facturaLineas.cantidad,
        unidad: schema.facturaLineas.unidad,
        precioUnitario: schema.facturaLineas.precioUnitario,
        total: schema.facturaLineas.total,
        ultimoPrecio: schema.productos.ultimoPrecio,
      })
      .from(schema.facturaLineas)
      .leftJoin(schema.productos, eq(schema.facturaLineas.productoId, schema.productos.id))
      .where(inArray(schema.facturaLineas.facturaId, idsRevisar))
      .orderBy(asc(schema.facturaLineas.orden));

    for (const l of lineas) {
      const arr = detalles.get(l.facturaId) ?? [];
      const precio = l.precioUnitario ? Number(l.precioUnitario) : null;
      const previo = l.ultimoPrecio ? Number(l.ultimoPrecio) : null;
      const variacion =
        precio !== null && previo !== null && previo > 0
          ? Math.round(((precio - previo) / previo) * 100)
          : undefined;
      arr.push({
        producto: l.descripcion,
        cantidad: l.cantidad ? `${num(l.cantidad)} ${l.unidad ?? "ud"}` : "—",
        precioUd: precio !== null ? `${precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/${l.unidad ?? "ud"}` : "—",
        total: l.total ? Number(l.total) : 0,
        variacion: variacion !== undefined && variacion !== 0 ? variacion : undefined,
      });
      detalles.set(l.facturaId, arr);
    }
  }

  return filas.map((f): Factura => ({
    id: f.id,
    proveedor: f.proveedor ?? f.proveedorTexto ?? "Proveedor sin identificar",
    detalle:
      f.estado === "procesando"
        ? "leyendo el documento…"
        : f.numero
          ? (f.origen === "foto" ? "albarán " : "factura ") + f.numero.replace(/^ALB-/, "")
          : "sin número",
    fecha: fechaLegible(f.fecha),
    lineas: lineasPorFactura.get(f.id) ?? 0,
    total: f.total !== null ? Number(f.total) : null,
    estado: f.estado,
    lineasDetalle: detalles.get(f.id),
  }));
}

// ---------------------------------------------------------------------
// Dashboard (Inicio): compras y ventas por semana + KPIs
// ---------------------------------------------------------------------

export type SemanaCompraVenta = { etiqueta: string; compras: number; ventas: number };

export type UltimaFactura = { id: string; proveedor: string; estado: string; total: number };

export type DashboardData = {
  comprasPeriodo: number;
  foodCost: number | null;
  margenBruto: number | null;
  alertas: Producto[]; // productos con subida relevante (>=5%)
  ultimas: UltimaFactura[];
  semanas: SemanaCompraVenta[];
};

function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = getDb();
  if (!db) {
    return {
      comprasPeriodo: KPIS.comprasMes,
      foodCost: KPIS.foodCost,
      margenBruto: KPIS.margenMedio,
      alertas: PRODUCTOS.filter((p) => p.variacion >= 5).sort((a, b) => b.variacion - a.variacion),
      ultimas: FACTURAS.filter((f) => f.total !== null)
        .slice(0, 3)
        .map((f) => ({ id: f.id, proveedor: f.proveedor, estado: f.estado, total: f.total! })),
      semanas: COMPRAS_SEMANA.map((s) => ({
        etiqueta: s.semana,
        compras: s.total,
        ventas: Math.round(s.total / 0.31),
      })),
    };
  }

  // Ventana: las 4 semanas (lunes a domingo) que terminan en la actual.
  const hoy = new Date();
  const lunesActual = new Date(hoy);
  lunesActual.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  // A medianoche exacta: si arrastra la hora, el primer lunes queda fuera del bucket.
  lunesActual.setHours(0, 0, 0, 0);
  const lunes: Date[] = [3, 2, 1, 0].map((n) => {
    const d = new Date(lunesActual);
    d.setDate(lunesActual.getDate() - n * 7);
    return d;
  });
  const desde = isoFecha(lunes[0]);

  const [filasCompras, filasVentas] = await Promise.all([
    db
      .select({ fecha: schema.facturas.fecha, total: schema.facturas.total })
      .from(schema.facturas)
      .where(and(gte(schema.facturas.fecha, desde), isNotNull(schema.facturas.total))),
    db
      .select({ fecha: schema.ventasDia.fecha, total: schema.ventasDia.total })
      .from(schema.ventasDia)
      .where(gte(schema.ventasDia.fecha, desde)),
  ]);

  const semanas: SemanaCompraVenta[] = lunes.map((l) => ({
    etiqueta: `${l.getDate()} ${MESES_CORTOS[l.getMonth()]}`,
    compras: 0,
    ventas: 0,
  }));
  const indice = (fecha: string | null): number | null => {
    if (!fecha) return null;
    const dias = Math.floor((new Date(fecha).getTime() - lunes[0].getTime()) / 86_400_000);
    const i = Math.floor(dias / 7);
    return i >= 0 && i < 4 ? i : null;
  };
  for (const f of filasCompras) {
    const i = indice(f.fecha);
    if (i !== null) semanas[i].compras += Number(f.total);
  }
  for (const v of filasVentas) {
    const i = indice(v.fecha);
    if (i !== null) semanas[i].ventas += Number(v.total);
  }

  const comprasPeriodo = semanas.reduce((acc, s) => acc + s.compras, 0);
  const ventasPeriodo = semanas.reduce((acc, s) => acc + s.ventas, 0);
  const foodCost = ventasPeriodo > 0 ? (comprasPeriodo / ventasPeriodo) * 100 : null;

  const productos = await getProductosConHistorico();
  const alertas = productos.filter((p) => p.variacion >= 5).sort((a, b) => b.variacion - a.variacion);

  const ultimas = await db
    .select({
      id: schema.facturas.id,
      proveedor: schema.proveedores.nombre,
      estado: schema.facturas.estado,
      total: schema.facturas.total,
    })
    .from(schema.facturas)
    .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
    .where(isNotNull(schema.facturas.total))
    .orderBy(desc(schema.facturas.fecha), desc(schema.facturas.createdAt))
    .limit(3);

  return {
    comprasPeriodo,
    foodCost,
    margenBruto: foodCost !== null ? 100 - foodCost : null,
    alertas,
    ultimas: ultimas.map((u) => ({
      id: u.id,
      proveedor: u.proveedor ?? "—",
      estado: u.estado,
      total: Number(u.total),
    })),
    semanas,
  };
}
