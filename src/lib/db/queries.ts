// Capa de consultas de Can Costa. Cada función intenta leer de la BD real
// (Drizzle) y, si aún no hay DATABASE_URL configurada, cae a los datos mock
// para que la app siga funcionando durante el arranque.
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./index";
import { PRODUCTOS, type Producto } from "@/lib/mock";

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
