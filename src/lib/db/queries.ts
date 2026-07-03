// Capa de consultas de Can Costa.
// - Sin DATABASE_URL configurada → datos mock (arranque/desarrollo).
// - Con BD pero caída o colgada (p. ej. incidencia de Supabase) → plazo duro
//   de 8s por consulta (conPlazo) + estados VACÍOS y console.error: la app
//   degrada con elegancia en vez de devolver un 500 o colgarse minutos.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, max, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { conPlazo, getDb, resetDb, schema } from "./index";
import {
  CATEGORIAS_CON_PRODUCTOS,
  COMPRAS_SEMANA,
  ETIQUETA_CATEGORIA,
  FACTURAS,
  KPIS,
  PLATOS,
  PRODUCTOS,
  type CategoriaGasto,
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
            precioPactado: schema.productos.precioPactado,
            proveedor: schema.proveedores.nombre,
            categoriaProveedor: schema.proveedores.categoria,
            fuenteProductos: schema.proveedores.fuenteProductos,
          })
          .from(schema.productos)
          .leftJoin(schema.proveedores, eq(schema.productos.proveedorId, schema.proveedores.id))
          .where(eq(schema.productos.activo, true))
          .orderBy(asc(schema.productos.nombre));

        // Regla haddock nº 1: solo se muestran productos de proveedores cuya
        // categoría es de compra (materia prima, bebidas, limpieza,
        // consumibles). Los productos sin proveedor se conservan.
        const visibles = filas.filter(
          (f) => !f.categoriaProveedor || CATEGORIAS_CON_PRODUCTOS.includes(f.categoriaProveedor),
        );
        if (visibles.length === 0) return [];

        const ids = visibles.map((f) => f.id);
        const puntos = await db
          .select({
            productoId: schema.precios.productoId,
            precio: schema.precios.precio,
            fecha: schema.precios.fecha,
            tipoDoc: schema.facturas.tipo,
            cantidad: schema.facturaLineas.cantidad,
          })
          .from(schema.precios)
          .leftJoin(schema.facturas, eq(schema.precios.facturaId, schema.facturas.id))
          .leftJoin(schema.facturaLineas, eq(schema.precios.lineaId, schema.facturaLineas.id))
          .where(inArray(schema.precios.productoId, ids))
          .orderBy(asc(schema.precios.fecha));

        // Agrupar el histórico por producto (Map, sin N+1).
        type Punto = { precio: number; fecha: string; tipoDoc: string | null; peso: number };
        const porProducto = new Map<string, Punto[]>();
        for (const p of puntos) {
          const arr = porProducto.get(p.productoId) ?? [];
          arr.push({
            precio: Number(p.precio),
            fecha: p.fecha,
            tipoDoc: p.tipoDoc,
            peso: p.cantidad && Number(p.cantidad) > 0 ? Number(p.cantidad) : 1,
          });
          porProducto.set(p.productoId, arr);
        }

        return visibles.map((f): Producto => {
          // Regla haddock nº 2: por defecto los productos salen de los
          // ALBARANES (más a tiempo real); si el proveedor está configurado
          // como 'facturas', de las facturas. Si el filtro deja la serie
          // vacía, se usa todo para no dejar el producto ciego.
          const todos = porProducto.get(f.id) ?? [];
          const preferidos = todos.filter((p) =>
            f.fuenteProductos === "facturas" ? p.tipoDoc === "factura" : p.tipoDoc !== "factura",
          );
          const base = preferidos.length ? preferidos : todos;

          const serie = base.slice(-6);
          const hist = serie.map((s) => s.precio);
          const meses = serie.map((s) => mesCorto(s.fecha));
          const ultimo = hist.at(-1) ?? 0;
          const previo = hist.at(-2) ?? ultimo;
          const variacion = previo > 0 ? Math.round(((ultimo - previo) / previo) * 100) : 0;
          const ultimaCompra = fechaLegible(f.ultimaCompra ?? serie.at(-1)?.fecha ?? null);

          // Precio de referencia = media ponderada por cantidad comprada.
          const sumaPesos = base.reduce((a, p) => a + p.peso, 0);
          const referencia = sumaPesos > 0 ? base.reduce((a, p) => a + p.precio * p.peso, 0) / sumaPesos : null;
          const pactado = f.precioPactado !== null ? Number(f.precioPactado) : null;
          const liston = pactado ?? referencia;

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
            unidad: f.unidad,
            ultimoNum: base.length ? ultimo : null,
            referencia,
            maximo: base.length ? Math.max(...base.map((p) => p.precio)) : null,
            minimo: base.length ? Math.min(...base.map((p) => p.precio)) : null,
            nCompras: base.length,
            precioPactado: pactado,
            enAlza: liston !== null && base.length > 0 && ultimo > liston + 0.0001,
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
            tipo: schema.facturas.tipo,
            categoria: schema.facturas.categoria,
            pagada: schema.facturas.pagada,
            incidencia: schema.facturas.incidencia,
            motivoRechazo: schema.facturas.motivoRechazo,
            proveedor: schema.proveedores.nombre,
            proveedorTexto: schema.facturas.proveedorTexto,
            categoriaProveedor: schema.proveedores.categoria,
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
              id: schema.facturaLineas.id,
              facturaId: schema.facturaLineas.facturaId,
              productoId: schema.facturaLineas.productoId,
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
              id: l.id,
              productoId: l.productoId,
              cantidadNum: l.cantidad ? Number(l.cantidad) : null,
              precioNum: precio,
              unidad: l.unidad,
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
                ? `${f.tipo === "albaran" ? "albarán" : f.tipo} ${f.numero.replace(/^ALB-/, "")}`
                : "sin número",
          fecha: fechaLegible(f.fecha),
          fechaISO: f.fecha,
          lineas: lineasPorFactura.get(f.id) ?? 0,
          total: f.total !== null ? Number(f.total) : null,
          estado: f.estado,
          tipo: f.tipo,
          categoria: f.categoria,
          categoriaEfectiva: f.categoria ?? f.categoriaProveedor ?? "otros",
          pagada: f.pagada,
          incidencia: f.incidencia,
          motivoRechazo: f.motivoRechazo,
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
  categoria: CategoriaGasto;
  fuenteProductos: "albaranes" | "facturas";
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
              categoria: p.categoria,
              fuenteProductos: p.fuenteProductos,
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
  preparacionId: string | null; // sub-receta usada como ingrediente
  nombre: string; // nombre del producto, preparación o descripción libre
  cantidad: number | null; // en la unidad del producto (o raciones de la preparación)
  unidad: string | null;
  precioUnitario: number | null; // último precio de compra (o coste/ración de la preparación)
  coste: number;
  variacion: number; // % del producto (0 para líneas fijas)
  esFijo: boolean;
};

export type PlatoResumen = {
  id: string;
  nombre: string;
  emoji: string;
  fotoUrl: string | null;
  coste: number; // por ración, con merma
  pvp: number | null;
  foodCost: number | null;
  margen: number | null; // % de margen real sobre el PVP
  margenObjetivo: number | null; // % esperado (haddock: margen esperado)
  pvpRecomendado: number | null; // PVP para llegar al objetivo
  bajoObjetivo: boolean; // margen real por debajo del esperado → rojo
  esPreparacion: boolean;
  tipoPlato: "entrante" | "principal" | "postre" | "bebida" | "otro";
  raciones: number;
  aviso: string | null; // "▲ subió la merluza fresca"
};

export type PlatoDetalle = PlatoResumen & {
  mermaPct: number;
  subtotal: number;
  ingredientes: IngredientePlato[];
  preparacionesDisponibles: { id: string; nombre: string; costeRacion: number }[];
};

// Costes de todos los platos en dos pasadas: primero el subtotal directo
// (productos + líneas fijas), después se suman las preparaciones usadas
// (coste por ración de la sub-receta × raciones usadas). Solo un nivel.
type CostesPlatos = {
  filas: (typeof schema.platos.$inferSelect)[];
  subtotales: Map<string, number>;
  costeRacion: Map<string, number>; // coste con merma / raciones producidas
  avisos: Map<string, string | null>;
};

async function calcularCostesPlatos(db: NonNullable<ReturnType<typeof getDb>>): Promise<CostesPlatos> {
  const [filas, lineas, historico] = await Promise.all([
    db.select().from(schema.platos).where(eq(schema.platos.activo, true)).orderBy(asc(schema.platos.nombre)),
    db
      .select({
        platoId: schema.platoIngredientes.platoId,
        preparacionId: schema.platoIngredientes.preparacionId,
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
  const directos = new Map<string, number>();
  const avisos = new Map<string, string | null>();
  const lineasPrep: { platoId: string; preparacionId: string; cantidad: number }[] = [];

  for (const l of lineas) {
    if (l.preparacionId) {
      lineasPrep.push({ platoId: l.platoId, preparacionId: l.preparacionId, cantidad: l.cantidad ? Number(l.cantidad) : 0 });
      continue;
    }
    directos.set(
      l.platoId,
      (directos.get(l.platoId) ?? 0) +
        costeLinea({
          cantidad: l.cantidad ? Number(l.cantidad) : null,
          precioUnitario: l.precio ? Number(l.precio) : null,
          costeFijo: l.costeFijo ? Number(l.costeFijo) : null,
        }),
    );
    if (!avisos.get(l.platoId) && l.productoId && (variacionPorProducto.get(l.productoId) ?? 0) >= 5) {
      avisos.set(l.platoId, `▲ subió ${(l.productoNombre ?? "un ingrediente").toLowerCase()}`);
    }
  }

  const costeRacion = new Map(
    filas.map((p) => {
      const sub = directos.get(p.id) ?? 0;
      const raciones = Number(p.raciones) || 1;
      return [p.id, (sub * (1 + Number(p.mermaPct) / 100)) / raciones] as const;
    }),
  );

  const subtotales = new Map(filas.map((p) => [p.id, directos.get(p.id) ?? 0]));
  for (const lp of lineasPrep) {
    subtotales.set(lp.platoId, (subtotales.get(lp.platoId) ?? 0) + lp.cantidad * (costeRacion.get(lp.preparacionId) ?? 0));
  }

  return { filas, subtotales, costeRacion, avisos };
}

function aResumen(p: typeof schema.platos.$inferSelect, subtotal: number, aviso: string | null): PlatoResumen {
  const raciones = Number(p.raciones) || 1;
  const coste = (subtotal * (1 + Number(p.mermaPct) / 100)) / raciones;
  const pvp = p.pvp !== null ? Number(p.pvp) : null;
  const margen = pvp && pvp > 0 ? ((pvp - coste) / pvp) * 100 : null;
  const objetivo = p.margenObjetivo !== null ? Number(p.margenObjetivo) : null;
  return {
    id: p.id,
    nombre: p.nombre,
    emoji: p.emoji,
    fotoUrl: p.fotoUrl ?? null,
    coste,
    pvp,
    foodCost: pvp && pvp > 0 ? (coste / pvp) * 100 : null,
    margen,
    margenObjetivo: objetivo,
    pvpRecomendado: objetivo !== null && objetivo < 100 && coste > 0 ? coste / (1 - objetivo / 100) : null,
    bajoObjetivo: margen !== null && objetivo !== null && margen < objetivo - 0.05,
    esPreparacion: p.esPreparacion,
    tipoPlato: p.tipoPlato,
    raciones,
    aviso,
  };
}

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
    fotoUrl: null,
    coste: p.coste,
    pvp: p.pvp,
    foodCost: (p.coste / p.pvp) * 100,
    margen: ((p.pvp - p.coste) / p.pvp) * 100,
    margenObjetivo: null,
    pvpRecomendado: null,
    bajoObjetivo: false,
    esPreparacion: false,
    tipoPlato: "principal" as const,
    raciones: 1,
    aviso: p.aviso ?? null,
  }));
}

export async function getPlatosResumen(): Promise<PlatoResumen[]> {
  const db = getDb();
  if (!db) return mockPlatoResumen();

  try {
    return await conPlazo(
      (async (): Promise<PlatoResumen[]> => {
        const { filas, subtotales, avisos } = await calcularCostesPlatos(db);
        return filas.map((p) => aResumen(p, subtotales.get(p.id) ?? 0, avisos.get(p.id) ?? null));
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
      ...mockPlatoResumen().find((x) => x.id === id)!,
      mermaPct: 0,
      subtotal: p.coste,
      ingredientes: p.ingredientes.map((ing, i) => ({
        id: String(i),
        productoId: null,
        preparacionId: null,
        nombre: ing.nombre,
        cantidad: null,
        unidad: null,
        precioUnitario: null,
        coste: ing.coste,
        variacion: 0,
        esFijo: true,
      })),
      preparacionesDisponibles: [],
    };
  }

  try {
    return await conPlazo(
      (async (): Promise<PlatoDetalle | null> => {
        const preps = alias(schema.platos, "preps");
        const [[plato], lineas, historico, costes] = await Promise.all([
          db.select().from(schema.platos).where(eq(schema.platos.id, id)),
          db
            .select({
              id: schema.platoIngredientes.id,
              productoId: schema.platoIngredientes.productoId,
              preparacionId: schema.platoIngredientes.preparacionId,
              descripcion: schema.platoIngredientes.descripcion,
              cantidad: schema.platoIngredientes.cantidad,
              costeFijo: schema.platoIngredientes.costeFijo,
              orden: schema.platoIngredientes.orden,
              productoNombre: schema.productos.nombre,
              unidad: schema.productos.unidad,
              precio: schema.productos.ultimoPrecio,
              prepNombre: preps.nombre,
            })
            .from(schema.platoIngredientes)
            .leftJoin(schema.productos, eq(schema.platoIngredientes.productoId, schema.productos.id))
            .leftJoin(preps, eq(schema.platoIngredientes.preparacionId, preps.id))
            .where(eq(schema.platoIngredientes.platoId, id))
            .orderBy(asc(schema.platoIngredientes.orden), asc(schema.platoIngredientes.createdAt)),
          getProductosConHistorico(),
          calcularCostesPlatos(db),
        ]);
        if (!plato) return null;

        const variacionPorProducto = new Map(historico.map((p) => [p.id, p.variacion]));
        const ingredientes: IngredientePlato[] = lineas.map((l) => {
          const cantidad = l.cantidad ? Number(l.cantidad) : null;
          if (l.preparacionId) {
            const racion = costes.costeRacion.get(l.preparacionId) ?? 0;
            return {
              id: l.id,
              productoId: null,
              preparacionId: l.preparacionId,
              nombre: l.prepNombre ?? "Preparación",
              cantidad,
              unidad: "ración",
              precioUnitario: racion,
              coste: (cantidad ?? 0) * racion,
              variacion: 0,
              esFijo: false,
            };
          }
          const precioUnitario = l.precio ? Number(l.precio) : null;
          const costeFijo = l.costeFijo ? Number(l.costeFijo) : null;
          return {
            id: l.id,
            productoId: l.productoId,
            preparacionId: null,
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
        const resumen = aResumen(plato, subtotal, null);
        const conSubida = ingredientes.find((i) => i.variacion >= 5);

        return {
          ...resumen,
          aviso: conSubida ? `▲ subió ${conSubida.nombre.toLowerCase()}` : null,
          mermaPct: Number(plato.mermaPct),
          subtotal,
          ingredientes,
          preparacionesDisponibles: plato.esPreparacion
            ? []
            : costes.filas
                .filter((p) => p.esPreparacion && p.id !== id)
                .map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  costeRacion: costes.costeRacion.get(p.id) ?? 0,
                })),
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getPlatoDetalle", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// TPV: mapa de mesas, ticket y desglose de ventas del día
// ---------------------------------------------------------------------

export type MesaEstado = {
  id: string;
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
  forma: "cuadrada" | "redonda" | "alargada";
  posX: number | null;
  posY: number | null;
  activo: boolean;
  ticket: { id: string; total: number; comensales: number | null; minutos: number } | null;
};

export type MapaMesasTpv = {
  zonas: { zona: string; titulo: string; mesas: MesaEstado[] }[];
  paraLlevar: { id: string; total: number; minutos: number }[];
};

const TITULOS_ZONA: Record<string, string> = { sala: "Sala", terraza: "Terraza", barra: "Barra" };

function minutosDesde(fecha: Date): number {
  return Math.max(0, Math.round((Date.now() - fecha.getTime()) / 60_000));
}

export async function getMapaMesas(): Promise<MapaMesasTpv> {
  const db = getDb();
  const vacio: MapaMesasTpv = { zonas: [], paraLlevar: [] };
  if (!db) return vacio;

  try {
    return await conPlazo(
      (async (): Promise<MapaMesasTpv> => {
        const [filasMesas, abiertos, sumas] = await Promise.all([
          db.select().from(schema.mesas).where(eq(schema.mesas.activo, true)).orderBy(asc(schema.mesas.orden)),
          db.select().from(schema.tickets).where(eq(schema.tickets.estado, "abierto")),
          db
            .select({ ticketId: schema.ticketLineas.ticketId, suma: sum(schema.ticketLineas.total) })
            .from(schema.ticketLineas)
            .groupBy(schema.ticketLineas.ticketId),
        ]);

        const sumaPorTicket = new Map(sumas.map((s) => [s.ticketId, s.suma ? Number(s.suma) : 0]));
        const abiertoPorMesa = new Map(abiertos.filter((t) => t.mesaId).map((t) => [t.mesaId!, t]));

        const zonas = ["sala", "terraza", "barra"]
          .map((zona) => ({
            zona,
            titulo: TITULOS_ZONA[zona] ?? zona,
            mesas: filasMesas
              .filter((m) => m.zona === zona)
              .map((m): MesaEstado => {
                const t = abiertoPorMesa.get(m.id);
                return {
                  id: m.id,
                  nombre: m.nombre,
                  zona: m.zona,
                  capacidad: m.capacidad,
                  forma: m.forma,
                  posX: m.posX,
                  posY: m.posY,
                  activo: m.activo,
                  ticket: t
                    ? {
                        id: t.id,
                        total: sumaPorTicket.get(t.id) ?? 0,
                        comensales: t.comensales,
                        minutos: minutosDesde(t.abiertoAt),
                      }
                    : null,
                };
              }),
          }))
          .filter((z) => z.mesas.length > 0);

        const paraLlevar = abiertos
          .filter((t) => !t.mesaId)
          .map((t) => ({ id: t.id, total: sumaPorTicket.get(t.id) ?? 0, minutos: minutosDesde(t.abiertoAt) }));

        return { zonas, paraLlevar };
      })(),
    );
  } catch (e) {
    logFallo("getMapaMesas", e);
    return vacio;
  }
}

export type LineaTicket = {
  id: string;
  platoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
};

export type TicketDetalle = {
  id: string;
  mesaId: string | null;
  mesaNombre: string;
  estado: string;
  comensales: number | null;
  minutos: number;
  total: number;
  lineas: LineaTicket[];
};

export async function getTicketDetalle(id: string): Promise<TicketDetalle | null> {
  const db = getDb();
  if (!db) return null;

  try {
    return await conPlazo(
      (async (): Promise<TicketDetalle | null> => {
        const [fila] = await db
          .select({ ticket: schema.tickets, mesaNombre: schema.mesas.nombre })
          .from(schema.tickets)
          .leftJoin(schema.mesas, eq(schema.tickets.mesaId, schema.mesas.id))
          .where(eq(schema.tickets.id, id));
        if (!fila) return null;

        const lineas = await db
          .select()
          .from(schema.ticketLineas)
          .where(eq(schema.ticketLineas.ticketId, id))
          .orderBy(asc(schema.ticketLineas.createdAt));

        const lineasMap: LineaTicket[] = lineas.map((l) => ({
          id: l.id,
          platoId: l.platoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: Number(l.precioUnitario),
          total: Number(l.total),
        }));

        return {
          id: fila.ticket.id,
          mesaId: fila.ticket.mesaId,
          mesaNombre: fila.mesaNombre ?? "Para llevar",
          estado: fila.ticket.estado,
          comensales: fila.ticket.comensales,
          minutos: minutosDesde(fila.ticket.abiertoAt),
          total: lineasMap.reduce((acc, l) => acc + l.total, 0),
          lineas: lineasMap,
        };
      })(),
    );
  } catch (e) {
    logFallo("getTicketDetalle", e);
    return null;
  }
}

export type PlatoTpv = { id: string; nombre: string; emoji: string; pvp: number | null };

export async function getPlatosTpv(): Promise<PlatoTpv[]> {
  const db = getDb();
  if (!db) return [];
  try {
    return await conPlazo(
      (async (): Promise<PlatoTpv[]> => {
        const filas = await db
          .select()
          .from(schema.platos)
          .where(eq(schema.platos.activo, true))
          .orderBy(asc(schema.platos.nombre));
        return filas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          emoji: p.emoji,
          pvp: p.pvp !== null ? Number(p.pvp) : null,
        }));
      })(),
    );
  } catch (e) {
    logFallo("getPlatosTpv", e);
    return [];
  }
}

export type DesgloseDia = {
  fecha: string;
  totalDia: number;
  numTickets: number;
  ticketMedio: number | null;
  comensales: number;
  efectivo: number;
  tarjeta: number;
  tickets: {
    id: string;
    hora: string;
    mesa: string;
    comensales: number | null;
    metodo: string | null;
    total: number;
    numLineas: number;
  }[];
  platos: { nombre: string; emoji: string | null; unidades: number; importe: number; margen: number | null }[];
  extras: { descripcion: string; unidades: number; importe: number }[];
  ventaManual: number | null; // ventas_dia cuando no hay tickets (registro a mano)
};

export async function getDesgloseDia(fecha: string): Promise<DesgloseDia> {
  const vacio: DesgloseDia = {
    fecha,
    totalDia: 0,
    numTickets: 0,
    ticketMedio: null,
    comensales: 0,
    efectivo: 0,
    tarjeta: 0,
    tickets: [],
    platos: [],
    extras: [],
    ventaManual: null,
  };
  const db = getDb();
  if (!db) return vacio;

  try {
    return await conPlazo(
      (async (): Promise<DesgloseDia> => {
        const desde = new Date(fecha + "T00:00:00Z");
        const hasta = new Date(desde.getTime() + 86_400_000);

        const cobrados = await db
          .select({ ticket: schema.tickets, mesaNombre: schema.mesas.nombre })
          .from(schema.tickets)
          .leftJoin(schema.mesas, eq(schema.tickets.mesaId, schema.mesas.id))
          .where(
            and(
              eq(schema.tickets.estado, "cobrado"),
              gte(schema.tickets.cobradoAt, desde),
              lt(schema.tickets.cobradoAt, hasta),
            ),
          )
          .orderBy(asc(schema.tickets.cobradoAt));

        if (cobrados.length === 0) {
          const [venta] = await db.select().from(schema.ventasDia).where(eq(schema.ventasDia.fecha, fecha));
          return { ...vacio, ventaManual: venta ? Number(venta.total) : null };
        }

        const ids = cobrados.map((c) => c.ticket.id);
        const [lineas, costes] = await Promise.all([
          db
            .select({
              ticketId: schema.ticketLineas.ticketId,
              platoId: schema.ticketLineas.platoId,
              descripcion: schema.ticketLineas.descripcion,
              cantidad: schema.ticketLineas.cantidad,
              total: schema.ticketLineas.total,
              emoji: schema.platos.emoji,
            })
            .from(schema.ticketLineas)
            .leftJoin(schema.platos, eq(schema.ticketLineas.platoId, schema.platos.id))
            .where(inArray(schema.ticketLineas.ticketId, ids)),
          getPlatosResumen(),
        ]);

        const costePorPlato = new Map(costes.map((p) => [p.id, p.coste]));
        const lineasPorTicket = new Map<string, number>();
        const porPlato = new Map<
          string,
          { nombre: string; emoji: string | null; unidades: number; importe: number; margen: number | null }
        >();
        const porExtra = new Map<string, { descripcion: string; unidades: number; importe: number }>();

        for (const l of lineas) {
          lineasPorTicket.set(l.ticketId, (lineasPorTicket.get(l.ticketId) ?? 0) + l.cantidad);
          if (l.platoId) {
            const acc = porPlato.get(l.platoId) ?? {
              nombre: l.descripcion,
              emoji: l.emoji,
              unidades: 0,
              importe: 0,
              margen: null,
            };
            acc.unidades += l.cantidad;
            acc.importe += Number(l.total);
            const coste = costePorPlato.get(l.platoId);
            acc.margen = coste !== undefined ? acc.importe - coste * acc.unidades : null;
            porPlato.set(l.platoId, acc);
          } else {
            const clave = l.descripcion;
            const acc = porExtra.get(clave) ?? { descripcion: clave, unidades: 0, importe: 0 };
            acc.unidades += l.cantidad;
            acc.importe += Number(l.total);
            porExtra.set(clave, acc);
          }
        }

        const horaMadrid = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        });

        const ticketsDia = cobrados.map((c) => ({
          id: c.ticket.id,
          hora: horaMadrid.format(c.ticket.cobradoAt!),
          mesa: c.mesaNombre ?? "Para llevar",
          comensales: c.ticket.comensales,
          metodo: c.ticket.metodoPago,
          total: c.ticket.total ? Number(c.ticket.total) : 0,
          numLineas: lineasPorTicket.get(c.ticket.id) ?? 0,
        }));

        const totalDia = ticketsDia.reduce((acc, t) => acc + t.total, 0);
        const efectivo = ticketsDia.filter((t) => t.metodo === "efectivo").reduce((a, t) => a + t.total, 0);
        const comensales = ticketsDia.reduce((a, t) => a + (t.comensales ?? 0), 0);

        return {
          fecha,
          totalDia,
          numTickets: ticketsDia.length,
          ticketMedio: ticketsDia.length ? totalDia / ticketsDia.length : null,
          comensales,
          efectivo,
          tarjeta: totalDia - efectivo,
          tickets: ticketsDia,
          platos: [...porPlato.values()].sort((a, b) => b.importe - a.importe),
          extras: [...porExtra.values()].sort((a, b) => b.importe - a.importe),
          ventaManual: null,
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getDesgloseDia", e);
    return vacio;
  }
}

// ---------------------------------------------------------------------
// Reservas (cover manager)
// ---------------------------------------------------------------------

export type ReservaDia = {
  id: string;
  nombre: string;
  telefono: string | null;
  comensales: number;
  hora: string; // "HH:MM"
  duracionMin: number;
  zonaPreferida: "sala" | "terraza" | "barra" | null;
  mesaId: string | null;
  mesaNombre: string | null;
  mesa2Nombre: string | null; // segunda mesa cuando se juntan
  estado: string;
  notas: string | null;
};

export type DiaReservas = {
  fecha: string;
  reservas: ReservaDia[];
  totalComensales: number;
  sinMesa: number;
  plazasTotales: number;
  mesas: { id: string; nombre: string; zona: "sala" | "terraza" | "barra"; capacidad: number }[];
};

export async function getReservasDia(fecha: string): Promise<DiaReservas> {
  const vacio: DiaReservas = {
    fecha,
    reservas: [],
    totalComensales: 0,
    sinMesa: 0,
    plazasTotales: 0,
    mesas: [],
  };
  const db = getDb();
  if (!db) return vacio;

  try {
    return await conPlazo(
      (async (): Promise<DiaReservas> => {
        const mesas2 = alias(schema.mesas, "mesas2");
        const [filas, mesasActivas] = await Promise.all([
          db
            .select({
              reserva: schema.reservas,
              mesaNombre: schema.mesas.nombre,
              mesa2Nombre: mesas2.nombre,
            })
            .from(schema.reservas)
            .leftJoin(schema.mesas, eq(schema.reservas.mesaId, schema.mesas.id))
            .leftJoin(mesas2, eq(schema.reservas.mesa2Id, mesas2.id))
            .where(eq(schema.reservas.fecha, fecha))
            .orderBy(asc(schema.reservas.hora)),
          db.select().from(schema.mesas).where(eq(schema.mesas.activo, true)).orderBy(asc(schema.mesas.orden)),
        ]);

        const reservasDia: ReservaDia[] = filas.map((f) => ({
          id: f.reserva.id,
          nombre: f.reserva.nombre,
          telefono: f.reserva.telefono,
          comensales: f.reserva.comensales,
          hora: f.reserva.hora.slice(0, 5),
          duracionMin: f.reserva.duracionMin,
          zonaPreferida: f.reserva.zonaPreferida,
          mesaId: f.reserva.mesaId,
          mesaNombre: f.mesaNombre,
          mesa2Nombre: f.mesa2Nombre,
          estado: f.reserva.estado,
          notas: f.reserva.notas,
        }));

        const activas = reservasDia.filter((r) => r.estado === "confirmada" || r.estado === "sentada");
        return {
          fecha,
          reservas: reservasDia,
          totalComensales: activas.reduce((a, r) => a + r.comensales, 0),
          sinMesa: activas.filter((r) => !r.mesaId).length,
          plazasTotales: mesasActivas.reduce((a, m) => a + m.capacidad, 0),
          mesas: mesasActivas.map((m) => ({ id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad })),
        };
      })(),
    );
  } catch (e) {
    logFallo("getReservasDia", e);
    return vacio;
  }
}

// ---------------------------------------------------------------------
// Clientes (generados automáticamente desde las reservas)
// ---------------------------------------------------------------------

export type ClienteResumen = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  etiquetas: string[];
  numReservas: number;
  visitas: number; // reservas sentadas (vinieron de verdad)
  noShows: number;
  gastoTotal: number; // € de tickets cobrados vinculados
  ultimaReserva: string; // legible
};

export async function getClientes(): Promise<ClienteResumen[]> {
  const db = getDb();
  if (!db) return [];

  try {
    return await conPlazo(
      (async (): Promise<ClienteResumen[]> => {
        const [filas, reservasTodas, gastos] = await Promise.all([
          db.select().from(schema.clientes),
          db
            .select({
              clienteId: schema.reservas.clienteId,
              estado: schema.reservas.estado,
              fecha: schema.reservas.fecha,
            })
            .from(schema.reservas)
            .where(isNotNull(schema.reservas.clienteId)),
          db
            .select({ clienteId: schema.tickets.clienteId, gasto: sum(schema.tickets.total) })
            .from(schema.tickets)
            .where(and(isNotNull(schema.tickets.clienteId), eq(schema.tickets.estado, "cobrado")))
            .groupBy(schema.tickets.clienteId),
        ]);

        const agregados = new Map<
          string,
          { numReservas: number; visitas: number; noShows: number; ultima: string }
        >();
        for (const r of reservasTodas) {
          const acc = agregados.get(r.clienteId!) ?? { numReservas: 0, visitas: 0, noShows: 0, ultima: "" };
          acc.numReservas += 1;
          if (r.estado === "sentada") acc.visitas += 1;
          if (r.estado === "no_show") acc.noShows += 1;
          if (r.fecha > acc.ultima) acc.ultima = r.fecha;
          agregados.set(r.clienteId!, acc);
        }
        const gastoPor = new Map(gastos.map((g) => [g.clienteId!, Number(g.gasto ?? 0)]));

        return filas
          .map((c): ClienteResumen => {
            const agg = agregados.get(c.id);
            return {
              id: c.id,
              nombre: c.nombre,
              telefono: c.telefono,
              email: c.email,
              notas: c.notas,
              etiquetas: c.etiquetas ?? [],
              numReservas: agg?.numReservas ?? 0,
              visitas: agg?.visitas ?? 0,
              noShows: agg?.noShows ?? 0,
              gastoTotal: gastoPor.get(c.id) ?? 0,
              ultimaReserva: agg?.ultima ? fechaLegible(agg.ultima) : "—",
            };
          })
          .sort((a, b) => b.numReservas - a.numReservas || a.nombre.localeCompare(b.nombre));
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getClientes", e);
    return [];
  }
}

// ---------------------------------------------------------------------
// Ficha de cliente (estilo CoverManager): datos + resumen de
// comportamiento + histórico de reservas con su gasto.
// ---------------------------------------------------------------------

export type ClienteDetalle = {
  cliente: {
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    notas: string | null;
    etiquetas: string[];
    restricciones: string | null;
    preferencias: string | null;
    preferenciaMesa: string | null;
    idioma: string | null;
    desde: string; // legible (created_at)
  };
  resumen: {
    numReservas: number;
    visitas: number;
    noShows: number;
    canceladas: number;
    gastoTotal: number;
    ticketMedio: number | null;
    gastoPorPersona: number | null;
    ultimaVisita: string; // legible
  };
  historial: {
    id: string;
    fecha: string; // legible
    fechaISO: string;
    hora: string; // HH:MM
    comensales: number;
    estado: "confirmada" | "sentada" | "no_show" | "cancelada";
    mesa: string; // "Mesa 3" | "Terraza 1 + Terraza 2" | "—"
    gasto: number | null; // ticket cobrado de esa reserva
    notas: string | null;
  }[];
  otrosClientes: { id: string; nombre: string; telefono: string | null }[]; // para unificar
};

export async function getClienteDetalle(id: string): Promise<ClienteDetalle | null> {
  const db = getDb();
  if (!db) return null;

  try {
    return await conPlazo(
      (async (): Promise<ClienteDetalle | null> => {
        const mesas2 = alias(schema.mesas, "mesas2");
        const [[cliente], reservasCliente, ticketsCliente, resto] = await Promise.all([
          db.select().from(schema.clientes).where(eq(schema.clientes.id, id)),
          db
            .select({
              id: schema.reservas.id,
              fecha: schema.reservas.fecha,
              hora: schema.reservas.hora,
              comensales: schema.reservas.comensales,
              estado: schema.reservas.estado,
              notas: schema.reservas.notas,
              mesaNombre: schema.mesas.nombre,
              mesa2Nombre: mesas2.nombre,
            })
            .from(schema.reservas)
            .leftJoin(schema.mesas, eq(schema.reservas.mesaId, schema.mesas.id))
            .leftJoin(mesas2, eq(schema.reservas.mesa2Id, mesas2.id))
            .where(eq(schema.reservas.clienteId, id))
            .orderBy(desc(schema.reservas.fecha), desc(schema.reservas.hora)),
          db
            .select({
              reservaId: schema.tickets.reservaId,
              total: schema.tickets.total,
              comensales: schema.tickets.comensales,
            })
            .from(schema.tickets)
            .where(and(eq(schema.tickets.clienteId, id), eq(schema.tickets.estado, "cobrado"))),
          db
            .select({ id: schema.clientes.id, nombre: schema.clientes.nombre, telefono: schema.clientes.telefono })
            .from(schema.clientes)
            .orderBy(asc(schema.clientes.nombre)),
        ]);
        if (!cliente) return null;

        const gastoPorReserva = new Map<string, number>();
        let gastoTotal = 0;
        let personasCobradas = 0;
        for (const t of ticketsCliente) {
          const importe = Number(t.total ?? 0);
          gastoTotal += importe;
          personasCobradas += t.comensales ?? 0;
          if (t.reservaId) gastoPorReserva.set(t.reservaId, (gastoPorReserva.get(t.reservaId) ?? 0) + importe);
        }

        const visitas = reservasCliente.filter((r) => r.estado === "sentada").length;
        const ultimaSentada = reservasCliente.find((r) => r.estado === "sentada");

        return {
          cliente: {
            id: cliente.id,
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email,
            notas: cliente.notas,
            etiquetas: cliente.etiquetas ?? [],
            restricciones: cliente.restricciones,
            preferencias: cliente.preferencias,
            preferenciaMesa: cliente.preferenciaMesa,
            idioma: cliente.idioma,
            desde: fechaLegible(cliente.createdAt.toISOString().slice(0, 10)),
          },
          resumen: {
            numReservas: reservasCliente.length,
            visitas,
            noShows: reservasCliente.filter((r) => r.estado === "no_show").length,
            canceladas: reservasCliente.filter((r) => r.estado === "cancelada").length,
            gastoTotal,
            ticketMedio: ticketsCliente.length ? gastoTotal / ticketsCliente.length : null,
            gastoPorPersona: personasCobradas > 0 ? gastoTotal / personasCobradas : null,
            ultimaVisita: ultimaSentada ? fechaLegible(ultimaSentada.fecha) : "—",
          },
          historial: reservasCliente.map((r) => ({
            id: r.id,
            fecha: fechaLegible(r.fecha),
            fechaISO: r.fecha,
            hora: r.hora.slice(0, 5),
            comensales: r.comensales,
            estado: r.estado,
            mesa: r.mesaNombre ? (r.mesa2Nombre ? `${r.mesaNombre} + ${r.mesa2Nombre}` : r.mesaNombre) : "—",
            gasto: gastoPorReserva.get(r.id) ?? null,
            notas: r.notas,
          })),
          otrosClientes: resto.filter((c) => c.id !== id),
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getClienteDetalle", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// Dashboard mensual estilo haddock: General (solo validado) vs A tiempo
// real (incluye la bandeja pendiente de validar).
// ---------------------------------------------------------------------

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export type ModoDashboard = "general" | "real";

export type Ajustes = {
  conIva: boolean; // dashboard con o sin IVA
  ventasConTotal: boolean; // ventas con total o con base
  ivaVentasPct: number; // IVA automático de las ventas (10% hostelería)
  toleranciaConciliacion: number;
};

const AJUSTES_DEFECTO: Ajustes = { conIva: true, ventasConTotal: true, ivaVentasPct: 10, toleranciaConciliacion: 1 };

export async function getAjustes(): Promise<Ajustes> {
  const db = getDb();
  if (!db) return AJUSTES_DEFECTO;
  try {
    return await conPlazo(
      (async (): Promise<Ajustes> => {
        const [fila] = await db.select().from(schema.ajustes).where(eq(schema.ajustes.id, 1));
        if (!fila) return AJUSTES_DEFECTO;
        return {
          conIva: fila.conIva,
          ventasConTotal: fila.ventasConTotal,
          ivaVentasPct: Number(fila.ivaVentasPct),
          toleranciaConciliacion: Number(fila.toleranciaConciliacion),
        };
      })(),
    );
  } catch (e) {
    logFallo("getAjustes", e);
    return AJUSTES_DEFECTO;
  }
}

export type CategoriaDesglose = {
  categoria: CategoriaGasto;
  etiqueta: string;
  importe: number;
  pct: number;
  proveedores: { nombre: string; importe: number; pct: number }[];
  documentos: { id: string; proveedor: string; fecha: string; tipo: string; total: number }[];
};

export type DashboardMes = {
  mes: string; // "2026-07"
  etiquetaMes: string; // "julio 2026"
  dias: { dia: number; ventas: number; gastos: number }[];
  gastos: number;
  ventas: number;
  margen: number;
  margenPct: number | null;
  foodCostPct: number | null;
  desgloseCategorias: CategoriaDesglose[]; // gasto por categoría, con drill-down
  desgloseVentas: { nombre: string; importe: number; pct: number }[]; // por método de cobro
  facturasPendientes: number; // en bandeja (estado revisar/procesando) dentro del mes
  conIva: boolean;
  ventasConTotal: boolean;
};

function limitesMes(mes: string): { inicio: string; fin: string; dias: number } {
  const [anyo, m] = mes.split("-").map(Number);
  const dias = new Date(anyo, m, 0).getDate();
  const fin = m === 12 ? `${anyo + 1}-01-01` : `${anyo}-${String(m + 1).padStart(2, "0")}-01`;
  return { inicio: `${mes}-01`, fin, dias };
}

export function etiquetaMesLarga(mes: string): string {
  const [anyo, m] = mes.split("-").map(Number);
  return `${MESES_LARGOS[m - 1]} ${anyo}`;
}

const VACIO_MES = (mes: string): DashboardMes => ({
  mes,
  etiquetaMes: etiquetaMesLarga(mes),
  dias: [],
  gastos: 0,
  ventas: 0,
  margen: 0,
  margenPct: null,
  foodCostPct: null,
  desgloseCategorias: [],
  desgloseVentas: [],
  facturasPendientes: 0,
  conIva: true,
  ventasConTotal: true,
});

function topConOtros(entradas: Map<string, number>, total: number, maximo = 5) {
  const orden = [...entradas.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = orden.slice(0, maximo);
  const resto = orden.slice(maximo).reduce((a, [, v]) => a + v, 0);
  if (resto > 0) top.push(["Otros", resto]);
  return top.map(([nombre, importe]) => ({
    nombre,
    importe,
    pct: total > 0 ? (importe / total) * 100 : 0,
  }));
}

export async function getDashboardMes(mes: string, modo: ModoDashboard): Promise<DashboardMes> {
  const db = getDb();
  if (!db) return VACIO_MES(mes);
  if (!/^\d{4}-\d{2}$/.test(mes)) return VACIO_MES(mes);

  const { inicio, fin, dias: nDias } = limitesMes(mes);
  // Como haddock: en GENERAL mandan las facturas (y tickets de gasto); en
  // A TIEMPO REAL entran también los ALBARANES, que van por delante de la
  // factura del proveedor.
  const tipos: ("factura" | "albaran" | "ticket")[] =
    modo === "real" ? ["factura", "albaran", "ticket"] : ["factura", "ticket"];

  try {
    return await conPlazo(
      (async (): Promise<DashboardMes> => {
        const ajustes = await getAjustes();
        const [facturasMes, ventasMes, ticketsMes, pendientes] = await Promise.all([
          db
            .select({
              id: schema.facturas.id,
              fecha: schema.facturas.fecha,
              total: schema.facturas.total,
              base: schema.facturas.base,
              iva: schema.facturas.iva,
              tipo: schema.facturas.tipo,
              categoria: schema.facturas.categoria,
              proveedor: schema.proveedores.nombre,
              proveedorTexto: schema.facturas.proveedorTexto,
              categoriaProveedor: schema.proveedores.categoria,
            })
            .from(schema.facturas)
            .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
            .where(
              and(
                inArray(schema.facturas.estado, ["validada", "revisar"]),
                inArray(schema.facturas.tipo, tipos),
                gte(schema.facturas.fecha, inicio),
                lt(schema.facturas.fecha, fin),
              ),
            ),
          db
            .select({ fecha: schema.ventasDia.fecha, total: schema.ventasDia.total })
            .from(schema.ventasDia)
            .where(and(gte(schema.ventasDia.fecha, inicio), lt(schema.ventasDia.fecha, fin))),
          db
            .select({ metodoPago: schema.tickets.metodoPago, total: schema.tickets.total })
            .from(schema.tickets)
            .where(
              and(
                eq(schema.tickets.estado, "cobrado"),
                gte(schema.tickets.cobradoAt, new Date(`${inicio}T00:00:00+02:00`)),
                lt(schema.tickets.cobradoAt, new Date(`${fin}T00:00:00+02:00`)),
              ),
            ),
          db
            .select({ n: count() })
            .from(schema.facturas)
            .where(
              and(
                inArray(schema.facturas.estado, ["revisar", "procesando"]),
                gte(schema.facturas.fecha, inicio),
                lt(schema.facturas.fecha, fin),
              ),
            ),
        ]);

        const porDia = new Map<number, { ventas: number; gastos: number }>();
        for (let d = 1; d <= nDias; d++) porDia.set(d, { ventas: 0, gastos: 0 });

        // Con IVA (total) o sin IVA (base; si falta, total − IVA).
        const importeGasto = (f: { total: string | null; base: string | null; iva: string | null }): number => {
          const total = Number(f.total ?? 0);
          if (ajustes.conIva) return total;
          if (f.base !== null) return Number(f.base);
          if (f.iva !== null) return total - Number(f.iva);
          return total;
        };
        const factorVentas = ajustes.ventasConTotal ? 1 : 1 / (1 + ajustes.ivaVentasPct / 100);

        type AccCategoria = {
          importe: number;
          proveedores: Map<string, number>;
          documentos: { id: string; proveedor: string; fecha: string; tipo: string; total: number }[];
        };
        const porCategoria = new Map<CategoriaGasto, AccCategoria>();

        let gastos = 0;
        for (const f of facturasMes) {
          const importe = importeGasto(f);
          gastos += importe;
          if (f.fecha) {
            const d = Number(f.fecha.slice(8, 10));
            porDia.get(d)!.gastos += importe;
          }
          const nombre = f.proveedor ?? f.proveedorTexto ?? "Sin proveedor";
          const categoria = f.categoria ?? f.categoriaProveedor ?? "otros";
          const acc: AccCategoria = porCategoria.get(categoria) ?? {
            importe: 0,
            proveedores: new Map<string, number>(),
            documentos: [],
          };
          acc.importe += importe;
          acc.proveedores.set(nombre, (acc.proveedores.get(nombre) ?? 0) + importe);
          acc.documentos.push({
            id: f.id,
            proveedor: nombre,
            fecha: fechaLegible(f.fecha),
            tipo: f.tipo,
            total: importe,
          });
          porCategoria.set(categoria, acc);
        }

        let ventas = 0;
        for (const v of ventasMes) {
          const importe = Number(v.total) * factorVentas;
          ventas += importe;
          porDia.get(Number(v.fecha.slice(8, 10)))!.ventas += importe;
        }

        let efectivo = 0;
        let tarjeta = 0;
        for (const t of ticketsMes) {
          const importe = Number(t.total ?? 0) * factorVentas;
          if (t.metodoPago === "efectivo") efectivo += importe;
          else tarjeta += importe;
        }
        const ventasPorMetodo = new Map<string, number>([
          ["Tarjeta", tarjeta],
          ["Efectivo", efectivo],
          ["Apunte manual", Math.max(0, ventas - efectivo - tarjeta)],
        ]);

        const desgloseCategorias: CategoriaDesglose[] = [...porCategoria.entries()]
          .sort((a, b) => b[1].importe - a[1].importe)
          .map(([categoria, acc]) => ({
            categoria,
            etiqueta: ETIQUETA_CATEGORIA[categoria],
            importe: acc.importe,
            pct: gastos > 0 ? (acc.importe / gastos) * 100 : 0,
            proveedores: topConOtros(acc.proveedores, acc.importe),
            documentos: acc.documentos.sort((a, b) => b.total - a.total).slice(0, 12),
          }));

        const margen = ventas - gastos;
        return {
          mes,
          etiquetaMes: etiquetaMesLarga(mes),
          dias: [...porDia.entries()].map(([dia, v]) => ({ dia, ...v })),
          gastos,
          ventas,
          margen,
          margenPct: ventas > 0 ? (margen / ventas) * 100 : null,
          foodCostPct: ventas > 0 ? (gastos / ventas) * 100 : null,
          desgloseCategorias,
          desgloseVentas: topConOtros(ventasPorMetodo, ventas),
          facturasPendientes: Number(pendientes[0]?.n ?? 0),
          conIva: ajustes.conIva,
          ventasConTotal: ajustes.ventasConTotal,
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getDashboardMes", e);
    return VACIO_MES(mes);
  }
}

// ---------------------------------------------------------------------
// Usuarios (roles como haddock; gestion en /preferencias)
// ---------------------------------------------------------------------

export type UsuarioFila = {
  id: string;
  nombre: string;
  rol: "admin" | "documentos" | "gestor" | "chef";
  activo: boolean;
  creado: string;
};

export async function getUsuarios(): Promise<UsuarioFila[]> {
  const db = getDb();
  if (!db) return [];
  try {
    return await conPlazo(
      (async (): Promise<UsuarioFila[]> => {
        const filas = await db.select().from(schema.usuarios).orderBy(asc(schema.usuarios.createdAt));
        return filas.map((u) => ({
          id: u.id,
          nombre: u.nombre,
          rol: u.rol,
          activo: u.activo,
          creado: fechaLegible(u.createdAt.toISOString().slice(0, 10)),
        }));
      })(),
    );
  } catch (e) {
    logFallo("getUsuarios", e);
    return [];
  }
}
