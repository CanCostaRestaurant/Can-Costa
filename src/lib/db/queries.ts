// Capa de consultas de Can Costa.
// - Sin DATABASE_URL configurada → datos mock (arranque/desarrollo).
// - Con BD pero caída o colgada (p. ej. incidencia de Supabase) → plazo duro
//   de 8s por consulta (conPlazo) + estados VACÍOS y console.error: la app
//   degrada con elegancia en vez de devolver un 500 o colgarse minutos.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, max, sum } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "./index";
import {
  COMPRAS_SEMANA,
  FACTURAS,
  KPIS,
  PLATOS,
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

function num(cantidad: string): string {
  return Number(cantidad).toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function logFallo(contexto: string, e: unknown): void {
  console.error(`[queries] ${contexto} falló:`, e instanceof Error ? e.message : e);
  // El fallo puede venir de un socket zombi cacheado: reciclar para que la
  // siguiente petición reconecte de cero.
  resetDb();
}

// ---------------------------------------------------------------------
// Productos con histórico de precios
// ---------------------------------------------------------------------

export async function getProductosConHistorico(): Promise<Producto[]> {
  const db = getDb();
  if (!db) return PRODUCTOS; // sin BD configurada → datos de ejemplo

  try {
    return await conPlazo(
      (async (): Promise<Producto[]> => {
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
      })(),
    );
  } catch (e) {
    logFallo("getProductosConHistorico", e);
    return [];
  }
}

// ---------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------

export async function getFacturas(): Promise<Factura[]> {
  const db = getDb();
  if (!db) return FACTURAS;

  try {
    return await conPlazo(
      (async (): Promise<Factura[]> => {
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
              precioUd:
                precio !== null
                  ? `${precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/${l.unidad ?? "ud"}`
                  : "—",
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
      })(),
    );
  } catch (e) {
    logFallo("getFacturas", e);
    return [];
  }
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
  const semanasVacias: SemanaCompraVenta[] = lunes.map((l) => ({
    etiqueta: `${l.getDate()} ${MESES_CORTOS[l.getMonth()]}`,
    compras: 0,
    ventas: 0,
  }));

  try {
    return await conPlazo(
      (async (): Promise<DashboardData> => {
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

        const semanas = semanasVacias.map((s) => ({ ...s }));
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
        const alertas = productos
          .filter((p) => p.variacion >= 5)
          .sort((a, b) => b.variacion - a.variacion);

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
      })(),
      12_000, // engloba varias queries encadenadas
    );
  } catch (e) {
    logFallo("getDashboardData", e);
    return {
      comprasPeriodo: 0,
      foodCost: null,
      margenBruto: null,
      alertas: [],
      ultimas: [],
      semanas: semanasVacias,
    };
  }
}

// ---------------------------------------------------------------------
// Ventas diarias
// ---------------------------------------------------------------------

export type VentaDia = {
  id: string;
  fecha: string; // ISO
  fechaLegible: string;
  diaSemana: string;
  total: number;
  origen: string;
};

export async function getVentas(dias = 35): Promise<VentaDia[]> {
  const db = getDb();
  if (!db) return [];

  try {
    return await conPlazo(
      (async (): Promise<VentaDia[]> => {
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);

        const filas = await db
          .select()
          .from(schema.ventasDia)
          .where(gte(schema.ventasDia.fecha, isoFecha(desde)))
          .orderBy(desc(schema.ventasDia.fecha));

        const diaSemana = new Intl.DateTimeFormat("es-ES", { weekday: "long" });
        return filas.map((v) => ({
          id: v.id,
          fecha: v.fecha,
          fechaLegible: fechaLegible(v.fecha),
          diaSemana: diaSemana.format(new Date(v.fecha)),
          total: Number(v.total),
          origen: v.origen,
        }));
      })(),
    );
  } catch (e) {
    logFallo("getVentas", e);
    return [];
  }
}

// ---------------------------------------------------------------------
// Proveedores (resumen con gasto acumulado)
// ---------------------------------------------------------------------

export type ProveedorResumen = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  numFacturas: number;
  gastoTotal: number;
  ultimaCompra: string;
};

export async function getProveedoresResumen(): Promise<ProveedorResumen[]> {
  const db = getDb();
  if (!db) return [];

  try {
    return await conPlazo(
      (async (): Promise<ProveedorResumen[]> => {
        const [provs, agregados] = await Promise.all([
          db
            .select()
            .from(schema.proveedores)
            .where(eq(schema.proveedores.activo, true))
            .orderBy(asc(schema.proveedores.nombre)),
          db
            .select({
              proveedorId: schema.facturas.proveedorId,
              n: count(),
              suma: sum(schema.facturas.total),
              ultima: max(schema.facturas.fecha),
            })
            .from(schema.facturas)
            .where(isNotNull(schema.facturas.total))
            .groupBy(schema.facturas.proveedorId),
        ]);

        const porProveedor = new Map(agregados.map((a) => [a.proveedorId, a]));
        return provs
          .map((p) => {
            const agg = porProveedor.get(p.id);
            return {
              id: p.id,
              nombre: p.nombre,
              email: p.email,
              telefono: p.telefono,
              numFacturas: agg ? Number(agg.n) : 0,
              gastoTotal: agg?.suma ? Number(agg.suma) : 0,
              ultimaCompra: fechaLegible(agg?.ultima ?? null),
            };
          })
          .sort((a, b) => b.gastoTotal - a.gastoTotal);
      })(),
    );
  } catch (e) {
    logFallo("getProveedoresResumen", e);
    return [];
  }
}

// ---------------------------------------------------------------------
// Escandallos (platos): coste vivo = Σ ingredientes × último precio + merma
// ---------------------------------------------------------------------

export type IngredientePlato = {
  id: string;
  productoId: string | null;
  nombre: string; // nombre del producto o descripción libre
  cantidad: number | null; // en la unidad del producto
  unidad: string | null;
  precioUnitario: number | null; // último precio de compra
  coste: number;
  variacion: number; // % del producto (0 para líneas fijas)
  esFijo: boolean;
};

export type PlatoResumen = {
  id: string;
  nombre: string;
  emoji: string;
  coste: number;
  pvp: number | null;
  foodCost: number | null;
  aviso: string | null; // "▲ subió la merluza fresca"
};

export type PlatoDetalle = PlatoResumen & {
  mermaPct: number;
  subtotal: number;
  ingredientes: IngredientePlato[];
};

function costeLinea(l: { cantidad: number | null; precioUnitario: number | null; costeFijo: number | null }): number {
  if (l.costeFijo !== null) return l.costeFijo;
  if (l.cantidad !== null && l.precioUnitario !== null) return l.cantidad * l.precioUnitario;
  return 0;
}

function mockPlatoResumen(): PlatoResumen[] {
  return PLATOS.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    emoji: p.emoji,
    coste: p.coste,
    pvp: p.pvp,
    foodCost: (p.coste / p.pvp) * 100,
    aviso: p.aviso ?? null,
  }));
}

export async function getPlatosResumen(): Promise<PlatoResumen[]> {
  const db = getDb();
  if (!db) return mockPlatoResumen();

  try {
    return await conPlazo(
      (async (): Promise<PlatoResumen[]> => {
        const [filas, lineas, historico] = await Promise.all([
          db.select().from(schema.platos).where(eq(schema.platos.activo, true)).orderBy(asc(schema.platos.nombre)),
          db
            .select({
              platoId: schema.platoIngredientes.platoId,
              cantidad: schema.platoIngredientes.cantidad,
              costeFijo: schema.platoIngredientes.costeFijo,
              precio: schema.productos.ultimoPrecio,
              productoNombre: schema.productos.nombre,
              productoId: schema.platoIngredientes.productoId,
            })
            .from(schema.platoIngredientes)
            .leftJoin(schema.productos, eq(schema.platoIngredientes.productoId, schema.productos.id)),
          getProductosConHistorico(),
        ]);

        const variacionPorProducto = new Map(historico.map((p) => [p.id, p.variacion]));
        const porPlato = new Map<string, { subtotal: number; aviso: string | null }>();
        for (const l of lineas) {
          const acc = porPlato.get(l.platoId) ?? { subtotal: 0, aviso: null };
          acc.subtotal += costeLinea({
            cantidad: l.cantidad ? Number(l.cantidad) : null,
            precioUnitario: l.precio ? Number(l.precio) : null,
            costeFijo: l.costeFijo ? Number(l.costeFijo) : null,
          });
          if (!acc.aviso && l.productoId && (variacionPorProducto.get(l.productoId) ?? 0) >= 5) {
            acc.aviso = `▲ subió ${(l.productoNombre ?? "un ingrediente").toLowerCase()}`;
          }
          porPlato.set(l.platoId, acc);
        }

        return filas.map((p) => {
          const acc = porPlato.get(p.id) ?? { subtotal: 0, aviso: null };
          const coste = acc.subtotal * (1 + Number(p.mermaPct) / 100);
          const pvp = p.pvp !== null ? Number(p.pvp) : null;
          return {
            id: p.id,
            nombre: p.nombre,
            emoji: p.emoji,
            coste,
            pvp,
            foodCost: pvp && pvp > 0 ? (coste / pvp) * 100 : null,
            aviso: acc.aviso,
          };
        });
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getPlatosResumen", e);
    return [];
  }
}

export async function getPlatoDetalle(id: string): Promise<PlatoDetalle | null> {
  const db = getDb();
  if (!db) {
    const p = PLATOS.find((x) => x.id === id);
    if (!p) return null;
    return {
      id: p.id,
      nombre: p.nombre,
      emoji: p.emoji,
      coste: p.coste,
      pvp: p.pvp,
      foodCost: (p.coste / p.pvp) * 100,
      aviso: p.aviso ?? null,
      mermaPct: 0,
      subtotal: p.coste,
      ingredientes: p.ingredientes.map((ing, i) => ({
        id: String(i),
        productoId: null,
        nombre: ing.nombre,
        cantidad: null,
        unidad: null,
        precioUnitario: null,
        coste: ing.coste,
        variacion: 0,
        esFijo: true,
      })),
    };
  }

  try {
    return await conPlazo(
      (async (): Promise<PlatoDetalle | null> => {
        const [plato] = await db.select().from(schema.platos).where(eq(schema.platos.id, id));
        if (!plato) return null;

        const [lineas, historico] = await Promise.all([
          db
            .select({
              id: schema.platoIngredientes.id,
              productoId: schema.platoIngredientes.productoId,
              descripcion: schema.platoIngredientes.descripcion,
              cantidad: schema.platoIngredientes.cantidad,
              costeFijo: schema.platoIngredientes.costeFijo,
              orden: schema.platoIngredientes.orden,
              productoNombre: schema.productos.nombre,
              unidad: schema.productos.unidad,
              precio: schema.productos.ultimoPrecio,
            })
            .from(schema.platoIngredientes)
            .leftJoin(schema.productos, eq(schema.platoIngredientes.productoId, schema.productos.id))
            .where(eq(schema.platoIngredientes.platoId, id))
            .orderBy(asc(schema.platoIngredientes.orden), asc(schema.platoIngredientes.createdAt)),
          getProductosConHistorico(),
        ]);

        const variacionPorProducto = new Map(historico.map((p) => [p.id, p.variacion]));
        const ingredientes: IngredientePlato[] = lineas.map((l) => {
          const cantidad = l.cantidad ? Number(l.cantidad) : null;
          const precioUnitario = l.precio ? Number(l.precio) : null;
          const costeFijo = l.costeFijo ? Number(l.costeFijo) : null;
          return {
            id: l.id,
            productoId: l.productoId,
            nombre: l.productoNombre ?? l.descripcion ?? "—",
            cantidad,
            unidad: l.productoId ? (l.unidad ?? "ud") : null,
            precioUnitario,
            coste: costeLinea({ cantidad, precioUnitario, costeFijo }),
            variacion: l.productoId ? (variacionPorProducto.get(l.productoId) ?? 0) : 0,
            esFijo: l.productoId === null,
          };
        });

        const subtotal = ingredientes.reduce((acc, i) => acc + i.coste, 0);
        const mermaPct = Number(plato.mermaPct);
        const coste = subtotal * (1 + mermaPct / 100);
        const pvp = plato.pvp !== null ? Number(plato.pvp) : null;
        const conSubida = ingredientes.find((i) => i.variacion >= 5);

        return {
          id: plato.id,
          nombre: plato.nombre,
          emoji: plato.emoji,
          coste,
          pvp,
          foodCost: pvp && pvp > 0 ? (coste / pvp) * 100 : null,
          aviso: conSubida ? `▲ subió ${conSubida.nombre.toLowerCase()}` : null,
          mermaPct,
          subtotal,
          ingredientes,
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getPlatoDetalle", e);
    return null;
  }
}
