// Capa de consultas de Can Costa.
// - Sin DATABASE_URL configurada → datos mock (arranque/desarrollo).
// - Con BD pero caída o colgada (p. ej. incidencia de Supabase) → plazo duro
//   de 8s por consulta (conPlazo) + estados VACÍOS y console.error: la app
//   degrada con elegancia en vez de devolver un 500 o colgarse minutos.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, max, sql, sum } from "drizzle-orm";
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
            facturaPadreId: schema.facturas.facturaPadreId,
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
          facturaPadreId: f.facturaPadreId,
          numAlbaranes: filas.filter((x) => x.facturaPadreId === f.id).length,
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

export type PagoTicket = {
  id: string;
  metodo: "efectivo" | "tarjeta" | "mixto";
  importe: number;
  entregado: number | null;
};

export type TicketDetalle = {
  id: string;
  mesaId: string | null;
  mesaNombre: string;
  estado: string;
  comensales: number | null;
  minutos: number;
  total: number;
  pagado: number; // suma de pagos parciales ya registrados
  restante: number;
  pagos: PagoTicket[];
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

        const [lineas, pagos] = await Promise.all([
          db
            .select()
            .from(schema.ticketLineas)
            .where(eq(schema.ticketLineas.ticketId, id))
            .orderBy(asc(schema.ticketLineas.createdAt)),
          db
            .select()
            .from(schema.ticketPagos)
            .where(eq(schema.ticketPagos.ticketId, id))
            .orderBy(asc(schema.ticketPagos.createdAt)),
        ]);

        const lineasMap: LineaTicket[] = lineas.map((l) => ({
          id: l.id,
          platoId: l.platoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: Number(l.precioUnitario),
          total: Number(l.total),
        }));
        const pagosMap: PagoTicket[] = pagos.map((p) => ({
          id: p.id,
          metodo: p.metodo,
          importe: Number(p.importe),
          entregado: p.entregado !== null ? Number(p.entregado) : null,
        }));

        const total = lineasMap.reduce((acc, l) => acc + l.total, 0);
        const pagado = pagosMap.reduce((acc, p) => acc + p.importe, 0);

        return {
          id: fila.ticket.id,
          mesaId: fila.ticket.mesaId,
          mesaNombre: fila.mesaNombre ?? "Para llevar",
          estado: fila.ticket.estado,
          comensales: fila.ticket.comensales,
          minutos: minutosDesde(fila.ticket.abiertoAt),
          total,
          pagado,
          restante: Math.max(0, Math.round((total - pagado) * 100) / 100),
          pagos: pagosMap,
          lineas: lineasMap,
        };
      })(),
    );
  } catch (e) {
    logFallo("getTicketDetalle", e);
    return null;
  }
}

export type PlatoTpv = {
  id: string;
  nombre: string;
  emoji: string;
  pvp: number | null;
  tipo: "entrante" | "principal" | "postre" | "bebida" | "otro";
};

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
          tipo: p.tipoPlato,
        }));
      })(),
    );
  } catch (e) {
    logFallo("getPlatosTpv", e);
    return [];
  }
}

export type TicketDesglose = {
  id: string;
  hora: string;
  mesa: string;
  comensales: number | null;
  metodo: string | null;
  total: number;
  numLineas: number;
};
export type PlatoDesglose = {
  nombre: string;
  emoji: string | null;
  unidades: number;
  importe: number;
  margen: number | null;
};
export type ExtraDesglose = { descripcion: string; unidades: number; importe: number };

// Los números de una franja horaria (o del día entero). El filtro
// Mediodía / Noche / Todo de la pantalla de Ventas alterna entre estos.
export type NumerosFranja = {
  totalDia: number;
  numTickets: number;
  ticketMedio: number | null;
  comensales: number;
  efectivo: number;
  tarjeta: number;
  tickets: TicketDesglose[];
  platos: PlatoDesglose[];
  extras: ExtraDesglose[];
};

export type DesgloseDia = {
  fecha: string;
  ventaManual: number | null; // ventas_dia cuando no hay tickets (registro a mano)
  // Números del DÍA COMPLETO también en el nivel superior (compat: Caja lee
  // desglose.tickets y Fina serializa el objeto entero).
  totalDia: number;
  numTickets: number;
  ticketMedio: number | null;
  comensales: number;
  efectivo: number;
  tarjeta: number;
  tickets: TicketDesglose[];
  platos: PlatoDesglose[];
  extras: ExtraDesglose[];
  // Mismo desglose partido por franja horaria de cobro (corte a las 17:00
  // Madrid): mediodía = antes de las 17:00, noche = a partir de las 17:00.
  franjas: { todo: NumerosFranja; mediodia: NumerosFranja; noche: NumerosFranja };
};

export async function getDesgloseDia(fecha: string): Promise<DesgloseDia> {
  const franjaVacia: NumerosFranja = {
    totalDia: 0,
    numTickets: 0,
    ticketMedio: null,
    comensales: 0,
    efectivo: 0,
    tarjeta: 0,
    tickets: [],
    platos: [],
    extras: [],
  };
  const vacio: DesgloseDia = {
    fecha,
    ventaManual: null,
    ...franjaVacia,
    franjas: { todo: franjaVacia, mediodia: franjaVacia, noche: franjaVacia },
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
        const [lineas, costes, pagosDia] = await Promise.all([
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
          db.select().from(schema.ticketPagos).where(inArray(schema.ticketPagos.ticketId, ids)),
        ]);

        const costePorPlato = new Map(costes.map((p) => [p.id, p.coste]));

        // Líneas agrupadas por ticket, para poder reagregar por franja.
        const lineasPorTicketId = new Map<string, typeof lineas>();
        for (const l of lineas) {
          const arr = lineasPorTicketId.get(l.ticketId);
          if (arr) arr.push(l);
          else lineasPorTicketId.set(l.ticketId, [l]);
        }

        // Efectivo cobrado por ticket (un ticket puede llevar efectivo + tarjeta).
        const efectivoPorTicket = new Map<string, number>();
        for (const p of pagosDia) {
          if (p.metodo === "efectivo") {
            efectivoPorTicket.set(p.ticketId, (efectivoPorTicket.get(p.ticketId) ?? 0) + Number(p.importe));
          }
        }

        const horaMadrid = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        });
        const horaCorteMadrid = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone: "Europe/Madrid",
        });
        const CORTE_NOCHE = 17; // cobros < 17:00 = mediodía; ≥ 17:00 = noche
        const esNoche = (c: (typeof cobrados)[number]) =>
          parseInt(horaCorteMadrid.format(c.ticket.cobradoAt!), 10) >= CORTE_NOCHE;

        // Números (KPIs + platos + tickets) de un subconjunto de tickets.
        const agregar = (subset: typeof cobrados): NumerosFranja => {
          const tickets: TicketDesglose[] = subset.map((c) => {
            const ls = lineasPorTicketId.get(c.ticket.id) ?? [];
            return {
              id: c.ticket.id,
              hora: horaMadrid.format(c.ticket.cobradoAt!),
              mesa: c.mesaNombre ?? "Para llevar",
              comensales: c.ticket.comensales,
              metodo: c.ticket.metodoPago,
              total: c.ticket.total ? Number(c.ticket.total) : 0,
              numLineas: ls.reduce((a, l) => a + l.cantidad, 0),
            };
          });

          const porPlato = new Map<string, PlatoDesglose>();
          const porExtra = new Map<string, ExtraDesglose>();
          for (const c of subset) {
            for (const l of lineasPorTicketId.get(c.ticket.id) ?? []) {
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
                const acc = porExtra.get(l.descripcion) ?? { descripcion: l.descripcion, unidades: 0, importe: 0 };
                acc.unidades += l.cantidad;
                acc.importe += Number(l.total);
                porExtra.set(l.descripcion, acc);
              }
            }
          }

          const totalDia = tickets.reduce((a, t) => a + t.total, 0);
          const efectivo = subset.reduce((a, c) => a + (efectivoPorTicket.get(c.ticket.id) ?? 0), 0);
          const comensales = tickets.reduce((a, t) => a + (t.comensales ?? 0), 0);
          return {
            totalDia,
            numTickets: tickets.length,
            ticketMedio: tickets.length ? totalDia / tickets.length : null,
            comensales,
            efectivo,
            tarjeta: totalDia - efectivo,
            tickets,
            platos: [...porPlato.values()].sort((a, b) => b.importe - a.importe),
            extras: [...porExtra.values()].sort((a, b) => b.importe - a.importe),
          };
        };

        const todo = agregar(cobrados);
        const mediodia = agregar(cobrados.filter((c) => !esNoche(c)));
        const noche = agregar(cobrados.filter((c) => esNoche(c)));

        return {
          fecha,
          ventaManual: null,
          ...todo,
          franjas: { todo, mediodia, noche },
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
  origen: string; // "manual" | "web"
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
          origen: f.reserva.origen,
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
  // Datos fiscales del local para el ticket de venta
  nombreFiscal: string | null;
  cif: string | null;
  direccion: string | null;
  telefono: string | null;
  pieTicket: string;
};

const AJUSTES_DEFECTO: Ajustes = {
  conIva: true,
  ventasConTotal: true,
  ivaVentasPct: 10,
  toleranciaConciliacion: 1,
  nombreFiscal: null,
  cif: null,
  direccion: null,
  telefono: null,
  pieTicket: "¡Gracias por su visita!",
};

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
          nombreFiscal: fila.nombreFiscal,
          cif: fila.cif,
          direccion: fila.direccion,
          telefono: fila.telefono,
          pieTicket: fila.pieTicket,
        };
      })(),
    );
  } catch (e) {
    logFallo("getAjustes", e);
    return AJUSTES_DEFECTO;
  }
}

// Recibo (ticket de venta) de un ticket cobrado: datos del local + líneas +
// desglose de IVA (el PVP ya lo incluye) + cambio si se pagó en efectivo.
export type Recibo = {
  id: string;
  numero: number | null;
  mesaNombre: string;
  fechaHora: string;
  metodo: "efectivo" | "tarjeta" | "mixto" | null;
  comensales: number | null;
  entregado: number | null;
  cambio: number | null;
  pagos: { metodo: "efectivo" | "tarjeta" | "mixto"; importe: number }[]; // desglose si pagaron por partes
  lineas: { descripcion: string; cantidad: number; precioUnitario: number; total: number }[];
  base: number;
  iva: number;
  ivaPct: number;
  total: number;
  local: { nombre: string; cif: string | null; direccion: string | null; telefono: string | null; pie: string };
  // Cliente asociado al ticket (para "ver quién compró" y prellenar la factura):
  cliente: { id: string; nombre: string; telefono: string | null; cif: string | null; direccion: string | null } | null;
  // Si ya se emitió factura de este ticket (no se puede emitir dos veces):
  factura: { id: string; numero: string } | null;
};

export async function getRecibo(id: string): Promise<Recibo | null> {
  const db = getDb();
  if (!db) return null;
  try {
    return await conPlazo(
      (async (): Promise<Recibo | null> => {
        const [ajustes, filas] = await Promise.all([
          getAjustes(),
          db
            .select({ ticket: schema.tickets, mesaNombre: schema.mesas.nombre, cliente: schema.clientes })
            .from(schema.tickets)
            .leftJoin(schema.mesas, eq(schema.tickets.mesaId, schema.mesas.id))
            .leftJoin(schema.clientes, eq(schema.tickets.clienteId, schema.clientes.id))
            .where(eq(schema.tickets.id, id)),
        ]);
        const fila = filas[0];
        if (!fila || fila.ticket.estado !== "cobrado") return null;

        const [lineas, pagos, facturas] = await Promise.all([
          db
            .select()
            .from(schema.ticketLineas)
            .where(eq(schema.ticketLineas.ticketId, id))
            .orderBy(asc(schema.ticketLineas.createdAt)),
          db
            .select()
            .from(schema.ticketPagos)
            .where(eq(schema.ticketPagos.ticketId, id))
            .orderBy(asc(schema.ticketPagos.createdAt)),
          db
            .select({ id: schema.facturasVenta.id, numero: schema.facturasVenta.numero })
            .from(schema.facturasVenta)
            .where(and(eq(schema.facturasVenta.ticketId, id), eq(schema.facturasVenta.estado, "emitida")))
            .limit(1),
        ]);

        const total = Number(fila.ticket.total ?? 0);
        const ivaPct = ajustes.ivaVentasPct;
        const base = total / (1 + ivaPct / 100);
        // Entregado y cambio: del último pago en efectivo (el cambio se dio
        // en ese momento, sobre ese pago). Tickets viejos: campo del ticket.
        const ultimoEfectivo = [...pagos].reverse().find((p) => p.metodo === "efectivo" && p.entregado !== null);
        const entregado = ultimoEfectivo
          ? Number(ultimoEfectivo.entregado)
          : fila.ticket.entregado !== null
            ? Number(fila.ticket.entregado)
            : null;
        const importeEfectivo = ultimoEfectivo ? Number(ultimoEfectivo.importe) : total;
        const cobradoAt = fila.ticket.cobradoAt ?? fila.ticket.abiertoAt;

        return {
          id: fila.ticket.id,
          numero: fila.ticket.numero,
          mesaNombre: fila.mesaNombre ?? "Para llevar",
          fechaHora: new Intl.DateTimeFormat("es-ES", {
            timeZone: "Europe/Madrid",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(cobradoAt),
          metodo: fila.ticket.metodoPago,
          comensales: fila.ticket.comensales,
          entregado,
          cambio: entregado !== null ? entregado - importeEfectivo : null,
          pagos: pagos.map((p) => ({ metodo: p.metodo, importe: Number(p.importe) })),
          lineas: lineas.map((l) => ({
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precioUnitario: Number(l.precioUnitario),
            total: Number(l.total),
          })),
          base,
          iva: total - base,
          ivaPct,
          total,
          local: {
            nombre: ajustes.nombreFiscal || "Can Costa",
            cif: ajustes.cif,
            direccion: ajustes.direccion,
            telefono: ajustes.telefono,
            pie: ajustes.pieTicket,
          },
          cliente: fila.cliente
            ? {
                id: fila.cliente.id,
                nombre: fila.cliente.razonSocial || fila.cliente.nombre,
                telefono: fila.cliente.telefono,
                cif: fila.cliente.cif,
                direccion: fila.cliente.direccionFiscal,
              }
            : null,
          factura: facturas[0] ?? null,
        };
      })(),
    );
  } catch (e) {
    logFallo("getRecibo", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// Facturas de venta (emitidas al cliente) — registro para declarar
// ---------------------------------------------------------------------

type LineaFacturaVenta = { descripcion: string; cantidad: number; precioUnitario: number; total: number };

export type FacturaVenta = {
  id: string;
  numero: string;
  serie: string;
  fecha: string; // ISO
  fechaLegible: string; // "4 de julio de 2026"
  estado: "emitida" | "anulada";
  cliente: { id: string | null; nombre: string; cif: string | null; direccion: string | null };
  lineas: LineaFacturaVenta[];
  base: number;
  iva: number;
  ivaPct: number;
  total: number;
  ticketId: string | null;
  emitidaPor: string | null;
  clienteEmail: string | null; // de la ficha del cliente, para prellenar el envío
  enviadaA: string | null; // último correo al que se mandó
  enviadaEl: string | null; // "4 jul, 13:05" (hora Madrid)
  local: { nombre: string; cif: string | null; direccion: string | null; telefono: string | null };
};

function fechaLarga(fechaISO: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(fechaISO + "T12:00:00"),
  );
}

export async function getFacturaVenta(id: string): Promise<FacturaVenta | null> {
  const db = getDb();
  if (!db) return null;
  try {
    return await conPlazo(
      (async (): Promise<FacturaVenta | null> => {
        const [ajustes, filas] = await Promise.all([
          getAjustes(),
          db
            .select({ factura: schema.facturasVenta, clienteEmail: schema.clientes.email })
            .from(schema.facturasVenta)
            .leftJoin(schema.clientes, eq(schema.facturasVenta.clienteId, schema.clientes.id))
            .where(eq(schema.facturasVenta.id, id))
            .limit(1),
        ]);
        if (!filas[0]) return null;
        const f = filas[0].factura;
        return {
          id: f.id,
          numero: f.numero,
          serie: f.serie,
          fecha: f.fecha,
          fechaLegible: fechaLarga(f.fecha),
          estado: f.estado,
          cliente: { id: f.clienteId, nombre: f.clienteNombre, cif: f.clienteCif, direccion: f.clienteDireccion },
          lineas: (f.lineas as LineaFacturaVenta[]).map((l) => ({
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
          clienteEmail: filas[0].clienteEmail,
          enviadaA: f.enviadaA,
          enviadaEl: f.enviadaAt
            ? new Intl.DateTimeFormat("es-ES", {
                timeZone: "Europe/Madrid",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(f.enviadaAt)
            : null,
          local: {
            nombre: ajustes.nombreFiscal || "Can Costa",
            cif: ajustes.cif,
            direccion: ajustes.direccion,
            telefono: ajustes.telefono,
          },
        };
      })(),
    );
  } catch (e) {
    logFallo("getFacturaVenta", e);
    return null;
  }
}

export type FacturaEmitidaFila = {
  id: string;
  numero: string;
  fecha: string;
  fechaLegible: string;
  cliente: string;
  clienteCif: string | null;
  base: number;
  iva: number;
  total: number;
  estado: "emitida" | "anulada";
};

export type FacturasEmitidas = {
  periodo: string; // "YYYY-MM" (mes) o "YYYY-Tn" (trimestre)
  etiquetaPeriodo: string; // "julio de 2026" / "3er trimestre 2026"
  filas: FacturaEmitidaFila[];
  totalBase: number;
  totalIva: number;
  total: number; // suma de emitidas (las anuladas no cuentan)
  // Ventas por tickets del período SIN los tickets ya facturados (su venta
  // viaja en la factura): tickets + facturas = total ventas, sin duplicar.
  ventasTickets: { tickets: number; base: number; iva: number; total: number; ivaPct: number };
  // Períodos con facturas para el selector: trimestres primero, luego meses.
  trimestres: { valor: string; etiqueta: string }[];
  meses: { valor: string; etiqueta: string }[];
};

export const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2]|T[1-4])$/;

// Rango [desde, hasta) en fechas ISO de un período mes o trimestre.
export function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const anio = Number(periodo.slice(0, 4));
  if (periodo.includes("T")) {
    const t = Number(periodo.slice(6)); // 1-4
    const mesIni = (t - 1) * 3 + 1;
    const desde = `${anio}-${String(mesIni).padStart(2, "0")}-01`;
    const hasta = t === 4 ? `${anio + 1}-01-01` : `${anio}-${String(mesIni + 3).padStart(2, "0")}-01`;
    return { desde, hasta };
  }
  const m = Number(periodo.slice(5, 7));
  return {
    desde: `${periodo}-01`,
    hasta: m === 12 ? `${anio + 1}-01-01` : `${anio}-${String(m + 1).padStart(2, "0")}-01`,
  };
}

// Tickets cobrados del período (día en Madrid) SIN factura emitida: la venta
// de un ticket facturado viaja en su factura — si contara también aquí, el
// gestor la sumaría dos veces. Si la factura se anula, el ticket vuelve solo.
export function condTicketsSinFactura(desde: string, hasta: string) {
  return and(
    eq(schema.tickets.estado, "cobrado"),
    sql`(${schema.tickets.cobradoAt} at time zone 'Europe/Madrid')::date >= ${desde}::date`,
    sql`(${schema.tickets.cobradoAt} at time zone 'Europe/Madrid')::date < ${hasta}::date`,
    sql`not exists (select 1 from facturas_venta fv where fv.ticket_id = ${schema.tickets.id} and fv.estado = 'emitida')`,
  );
}

const ORDINAL_TRIMESTRE = ["1er", "2º", "3er", "4º"];

export function etiquetaPeriodo(periodo: string): string {
  if (periodo.includes("T")) {
    const t = Number(periodo.slice(6));
    return `${ORDINAL_TRIMESTRE[t - 1]} trimestre ${periodo.slice(0, 4)}`;
  }
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(
    new Date(periodo + "-01T12:00:00"),
  );
}

export async function getFacturasEmitidas(periodo: string): Promise<FacturasEmitidas> {
  const vacio: FacturasEmitidas = {
    periodo,
    etiquetaPeriodo: etiquetaPeriodo(periodo),
    filas: [],
    totalBase: 0,
    totalIva: 0,
    total: 0,
    ventasTickets: { tickets: 0, base: 0, iva: 0, total: 0, ivaPct: 10 },
    trimestres: [],
    meses: [],
  };
  const db = getDb();
  if (!db) return vacio;
  try {
    return await conPlazo(
      (async (): Promise<FacturasEmitidas> => {
        const { desde, hasta } = rangoPeriodo(periodo);
        const [filas, mesesRaw, ajustes, ticketsAgg] = await Promise.all([
          db
            .select()
            .from(schema.facturasVenta)
            .where(and(gte(schema.facturasVenta.fecha, desde), lt(schema.facturasVenta.fecha, hasta)))
            .orderBy(desc(schema.facturasVenta.correlativo)),
          db
            .select({ mes: sql<string>`to_char(${schema.facturasVenta.fecha}, 'YYYY-MM')` })
            .from(schema.facturasVenta)
            .groupBy(sql`to_char(${schema.facturasVenta.fecha}, 'YYYY-MM')`)
            .orderBy(sql`to_char(${schema.facturasVenta.fecha}, 'YYYY-MM') desc`),
          getAjustes(),
          db
            .select({
              tickets: sql<number>`count(*)::int`,
              total: sql<string>`coalesce(sum(${schema.tickets.total}), 0)`,
            })
            .from(schema.tickets)
            .where(condTicketsSinFactura(desde, hasta)),
        ]);

        const rows: FacturaEmitidaFila[] = filas.map((f) => ({
          id: f.id,
          numero: f.numero,
          fecha: f.fecha,
          fechaLegible: fechaLegible(f.fecha),
          cliente: f.clienteNombre,
          clienteCif: f.clienteCif,
          base: Number(f.base),
          iva: Number(f.iva),
          total: Number(f.total),
          estado: f.estado,
        }));
        const emitidas = rows.filter((r) => r.estado === "emitida");

        // Trimestres derivados de los meses con facturas (más recientes primero).
        const trimestres = [...new Set(mesesRaw.map((m) => `${m.mes.slice(0, 4)}-T${Math.ceil(Number(m.mes.slice(5, 7)) / 3)}`))];

        const ticketsTotal = Number(ticketsAgg[0]?.total ?? 0);
        const ticketsBase = Math.round((ticketsTotal / (1 + ajustes.ivaVentasPct / 100)) * 100) / 100;

        return {
          periodo,
          etiquetaPeriodo: etiquetaPeriodo(periodo),
          filas: rows,
          totalBase: emitidas.reduce((a, r) => a + r.base, 0),
          totalIva: emitidas.reduce((a, r) => a + r.iva, 0),
          total: emitidas.reduce((a, r) => a + r.total, 0),
          ventasTickets: {
            tickets: ticketsAgg[0]?.tickets ?? 0,
            base: ticketsBase,
            iva: Math.round((ticketsTotal - ticketsBase) * 100) / 100,
            total: ticketsTotal,
            ivaPct: ajustes.ivaVentasPct,
          },
          trimestres: trimestres.map((t) => ({ valor: t, etiqueta: etiquetaPeriodo(t) })),
          meses: mesesRaw.map((m) => ({ valor: m.mes, etiqueta: etiquetaPeriodo(m.mes) })),
        };
      })(),
    );
  } catch (e) {
    logFallo("getFacturasEmitidas", e);
    return vacio;
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
        const [facturasMes, conAlbaranes, personalMes, ventasMes, ticketsMes, pendientes] = await Promise.all([
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
          // Facturas con albaranes conciliados: en "a tiempo real" mandan
          // sus albaranes y la factura se aparta (no duplicar importe).
          db
            .select({ padreId: schema.facturas.facturaPadreId })
            .from(schema.facturas)
            .where(isNotNull(schema.facturas.facturaPadreId)),
          db.select().from(schema.personalGastos).where(eq(schema.personalGastos.mes, mes)),
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

        const padresConciliados = new Set(conAlbaranes.map((c) => c.padreId));

        let gastos = 0;
        for (const f of facturasMes) {
          // En "a tiempo real" una factura ya conciliada con albaranes se
          // aparta: cuentan sus albaranes (evita duplicar el importe).
          if (modo === "real" && f.tipo === "factura" && padresConciliados.has(f.id)) continue;
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

        // Gastos de personal del mes (nóminas, SS…): suman al total y a su
        // categoría; no van a las barras diarias porque son mensuales.
        if (personalMes.length) {
          const acc: AccCategoria = porCategoria.get("personal") ?? {
            importe: 0,
            proveedores: new Map<string, number>(),
            documentos: [],
          };
          for (const p of personalMes) {
            const importe = Number(p.importe);
            gastos += importe;
            acc.importe += importe;
            acc.proveedores.set(p.concepto, (acc.proveedores.get(p.concepto) ?? 0) + importe);
            acc.documentos.push({
              id: p.id,
              proveedor: p.concepto,
              fecha: "mensual",
              tipo: "personal",
              total: importe,
            });
          }
          porCategoria.set("personal", acc);
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
  rol: "admin" | "documentos" | "gestor" | "chef" | "tpv";
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

// ---------------------------------------------------------------------
// Conciliacion: cruzar albaranes con su factura (tolerancia en Ajustes)
// ---------------------------------------------------------------------

export type AlbaranConc = {
  id: string;
  numero: string | null;
  fecha: string; // legible
  fechaISO: string | null;
  total: number;
  proveedor: string;
  proveedorId: string | null;
};

export type FacturaConc = {
  id: string;
  numero: string | null;
  fecha: string;
  total: number;
  proveedor: string;
  proveedorId: string | null;
  incidencia: string | null;
  albaranes: AlbaranConc[]; // ya conciliados con ella
  // Propuesta automática que el usuario confirma con un clic. motivo:
  // "referencia" = la factura menciona esos nº de albarán (lo lee la IA, es lo
  // más fiable); "importe" = combinación de albaranes cuya suma cuadra.
  // ambiguo = hay más de una combinación posible por importe → revísala.
  sugerencia: {
    albaranIds: string[];
    suma: number;
    diferencia: number;
    motivo: "referencia" | "importe";
    ambiguo: boolean;
  } | null;
};

export type Conciliacion = {
  tolerancia: number;
  facturas: FacturaConc[];
  albaranesSueltos: AlbaranConc[];
};

// Dígitos significativos de un nº de documento, para cruzar referencias con
// robustez: "ALB-01206" y "1206" → "1206" (quita letras, símbolos y ceros a
// la izquierda). "" si no tiene dígitos (no se cruza).
function soloDigitos(n: string): string {
  return n.replace(/\D/g, "").replace(/^0+/, "");
}

// Mejor combinación de albaranes cuya suma cuadre con `objetivo` (€) dentro de
// `tolerancia`. Trabaja en céntimos (evita errores de coma flotante) y enumera
// subconjuntos, acotado a 15 albaranes para no dispararse (2^15). Devuelve si
// hay MÁS de una combinación que cuadra (ambiguo → mejor que lo mire alguien).
function mejorCombinacionAlbaranes(
  candidatos: { id: string; total: number }[],
  objetivo: number,
  tolerancia: number,
): { ids: string[]; suma: number; ambiguo: boolean } | null {
  const items = candidatos.slice(0, 15).map((a) => ({ id: a.id, c: Math.round(a.total * 100) }));
  const objetivoC = Math.round(objetivo * 100);
  const tolC = Math.round(tolerancia * 100);
  const m = items.length;
  if (m === 0) return null;

  const soluciones: { mask: number; dif: number; count: number }[] = [];
  for (let mask = 1; mask < 1 << m; mask++) {
    let suma = 0;
    let count = 0;
    for (let i = 0; i < m; i++) {
      if (mask & (1 << i)) {
        suma += items[i].c;
        count++;
      }
    }
    const dif = Math.abs(suma - objetivoC);
    if (dif <= tolC) soluciones.push({ mask, dif, count });
  }
  if (soluciones.length === 0) return null;

  // Mejor = la que menos se desvía y, a igualdad, con menos albaranes.
  soluciones.sort((a, b) => a.dif - b.dif || a.count - b.count);
  const best = soluciones[0];
  const ids: string[] = [];
  let sumaC = 0;
  for (let i = 0; i < m; i++) {
    if (best.mask & (1 << i)) {
      ids.push(items[i].id);
      sumaC += items[i].c;
    }
  }
  return { ids, suma: sumaC / 100, ambiguo: soluciones.length > 1 };
}

export async function getConciliacion(): Promise<Conciliacion> {
  const db = getDb();
  if (!db) return { tolerancia: 1, facturas: [], albaranesSueltos: [] };

  try {
    return await conPlazo(
      (async (): Promise<Conciliacion> => {
        const [ajustes, docs] = await Promise.all([
          getAjustes(),
          db
            .select({
              id: schema.facturas.id,
              numero: schema.facturas.numero,
              fecha: schema.facturas.fecha,
              total: schema.facturas.total,
              tipo: schema.facturas.tipo,
              proveedorId: schema.facturas.proveedorId,
              facturaPadreId: schema.facturas.facturaPadreId,
              incidencia: schema.facturas.incidencia,
              proveedor: schema.proveedores.nombre,
              proveedorTexto: schema.facturas.proveedorTexto,
              datosIa: schema.facturas.datosIa,
            })
            .from(schema.facturas)
            .leftJoin(schema.proveedores, eq(schema.facturas.proveedorId, schema.proveedores.id))
            .where(and(inArray(schema.facturas.estado, ["validada", "revisar"]), isNotNull(schema.facturas.total)))
            .orderBy(desc(schema.facturas.fecha)),
        ]);

        const aAlbaran = (d: (typeof docs)[number]): AlbaranConc => ({
          id: d.id,
          numero: d.numero,
          fecha: fechaLegible(d.fecha),
          fechaISO: d.fecha,
          total: Number(d.total ?? 0),
          proveedor: d.proveedor ?? d.proveedorTexto ?? "Sin proveedor",
          proveedorId: d.proveedorId,
        });

        const albaranes = docs.filter((d) => d.tipo === "albaran");
        const sueltos = albaranes.filter((a) => !a.facturaPadreId).map(aAlbaran);
        const tolerancia = ajustes.toleranciaConciliacion;

        const facturas: FacturaConc[] = docs
          .filter((d) => d.tipo === "factura")
          .map((f) => {
            const hijos = albaranes.filter((a) => a.facturaPadreId === f.id).map(aAlbaran);
            const total = Number(f.total ?? 0);

            // Sugerencia automática (el usuario SIEMPRE la confirma con un clic):
            //  1) Por REFERENCIA: la propia factura menciona sus nº de albarán
            //     (lo lee la IA en datosIa.albaranes_referenciados). Es lo más
            //     fiable — no adivina por importes.
            //  2) Por IMPORTE: mejor combinación de albaranes del proveedor cuya
            //     suma cuadra; prueba primero los previos a la fecha de la
            //     factura (la consolida hasta su fecha) y, si no, todos.
            let sugerencia: FacturaConc["sugerencia"] = null;
            if (hijos.length === 0 && f.proveedorId) {
              const candidatos = sueltos.filter((a) => a.proveedorId === f.proveedorId);

              const referencias = Array.isArray(
                (f.datosIa as { albaranes_referenciados?: unknown } | null)?.albaranes_referenciados,
              )
                ? ((f.datosIa as { albaranes_referenciados: unknown[] }).albaranes_referenciados)
                    .map((x) => soloDigitos(String(x)))
                    .filter(Boolean)
                : [];
              if (referencias.length > 0) {
                const set = new Set(referencias);
                const casan = candidatos.filter((a) => {
                  const d = a.numero ? soloDigitos(a.numero) : "";
                  return d !== "" && set.has(d);
                });
                if (casan.length > 0) {
                  const suma = casan.reduce((s, a) => s + a.total, 0);
                  sugerencia = {
                    albaranIds: casan.map((a) => a.id),
                    suma,
                    diferencia: suma - total,
                    motivo: "referencia",
                    ambiguo: false,
                  };
                }
              }

              if (!sugerencia && candidatos.length > 0) {
                const previos = f.fecha ? candidatos.filter((a) => a.fechaISO && a.fechaISO <= f.fecha!) : [];
                const combi =
                  mejorCombinacionAlbaranes(previos, total, tolerancia) ??
                  mejorCombinacionAlbaranes(candidatos, total, tolerancia);
                if (combi) {
                  sugerencia = {
                    albaranIds: combi.ids,
                    suma: combi.suma,
                    diferencia: combi.suma - total,
                    motivo: "importe",
                    ambiguo: combi.ambiguo,
                  };
                }
              }
            }

            return {
              id: f.id,
              numero: f.numero,
              fecha: fechaLegible(f.fecha),
              total,
              proveedor: f.proveedor ?? f.proveedorTexto ?? "Sin proveedor",
              proveedorId: f.proveedorId,
              incidencia: f.incidencia,
              albaranes: hijos,
              sugerencia,
            };
          });

        return { tolerancia, facturas, albaranesSueltos: sueltos };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getConciliacion", e);
    return { tolerancia: 1, facturas: [], albaranesSueltos: [] };
  }
}

// ---------------------------------------------------------------------
// Personal: gastos de personal por mes (suman al dashboard)
// ---------------------------------------------------------------------

export type GastoPersonal = {
  id: string;
  concepto: string;
  importe: number;
  tipo: "nomina" | "seguridad_social" | "otro";
  trabajadorId: string | null;
  trabajadorNombre: string | null;
  // Desglose estilo JOMA (opcional; null = no informado).
  liquido?: number | null;
  irpf?: number | null;
  ssTrabajador?: number | null;
  ssEmpresa?: number | null;
  cashB?: number | null;
  // El PDF (base64) NO viaja en la lista: solo su presencia y nombre.
  tieneDocumento: boolean;
  documentoNombre: string | null;
};

export type PersonalMes = {
  mes: string;
  gastos: GastoPersonal[];
  total: number;
};

export type Trabajador = {
  id: string;
  nombre: string;
  puesto: string | null;
  categoria?: string | null;
  salario: number | null;
  activo: boolean;
};

export async function getTrabajadores(): Promise<Trabajador[]> {
  const db = getDb();
  if (!db) return [];
  try {
    return await conPlazo(
      (async (): Promise<Trabajador[]> => {
        const filas = await db
          .select()
          .from(schema.personalTrabajadores)
          .orderBy(desc(schema.personalTrabajadores.activo), asc(schema.personalTrabajadores.nombre));
        return filas.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          puesto: f.puesto,
          categoria: f.categoria,
          salario: f.salario !== null ? Number(f.salario) : null,
          activo: f.activo,
        }));
      })(),
    );
  } catch (e) {
    logFallo("getTrabajadores", e);
    return [];
  }
}

export async function getPersonalMes(mes: string): Promise<PersonalMes> {
  const db = getDb();
  if (!db || !/^\d{4}-\d{2}$/.test(mes)) return { mes, gastos: [], total: 0 };
  try {
    return await conPlazo(
      (async (): Promise<PersonalMes> => {
        const filas = await db
          .select({
            id: schema.personalGastos.id,
            concepto: schema.personalGastos.concepto,
            importe: schema.personalGastos.importe,
            tipo: schema.personalGastos.tipo,
            trabajadorId: schema.personalGastos.trabajadorId,
            liquido: schema.personalGastos.liquido,
            irpf: schema.personalGastos.irpf,
            ssTrabajador: schema.personalGastos.ssTrabajador,
            ssEmpresa: schema.personalGastos.ssEmpresa,
            cashB: schema.personalGastos.cashB,
            documentoNombre: schema.personalGastos.documentoNombre,
            tieneDoc: sql<boolean>`${schema.personalGastos.documento} is not null`,
            trabajadorNombre: schema.personalTrabajadores.nombre,
          })
          .from(schema.personalGastos)
          .leftJoin(
            schema.personalTrabajadores,
            eq(schema.personalGastos.trabajadorId, schema.personalTrabajadores.id),
          )
          .where(eq(schema.personalGastos.mes, mes))
          .orderBy(asc(schema.personalGastos.createdAt));
        const gastos: GastoPersonal[] = filas.map((f) => ({
          id: f.id,
          concepto: f.concepto,
          importe: Number(f.importe),
          tipo: f.tipo,
          trabajadorId: f.trabajadorId,
          trabajadorNombre: f.trabajadorNombre,
          liquido: f.liquido !== null ? Number(f.liquido) : null,
          irpf: f.irpf !== null ? Number(f.irpf) : null,
          ssTrabajador: f.ssTrabajador !== null ? Number(f.ssTrabajador) : null,
          ssEmpresa: f.ssEmpresa !== null ? Number(f.ssEmpresa) : null,
          cashB: f.cashB !== null ? Number(f.cashB) : null,
          tieneDocumento: Boolean(f.tieneDoc),
          documentoNombre: f.documentoNombre,
        }));
        return { mes, gastos, total: gastos.reduce((a, g) => a + g.importe, 0) };
      })(),
    );
  } catch (e) {
    logFallo("getPersonalMes", e);
    return { mes, gastos: [], total: 0 };
  }
}

// ---------------------------------------------------------------------
// Cierre de caja: cuadre diario de efectivo y datafono contra el TPV
// ---------------------------------------------------------------------

export type RetiradaCaja = { id: string; importe: number; motivo: string | null; hora: string };

export type CierreDia = {
  fecha: string;
  ticketsAbiertos: { id: string; mesa: string; total: number }[]; // bloquean el cierre
  numTickets: number;
  totalDia: number;
  efectivoEsperado: number; // ventas en efectivo del dia
  tarjetaEsperada: number; // ventas en tarjeta del dia
  fondoAnterior: number; // fondo que dejo el ultimo cierre anterior
  retiradas: RetiradaCaja[]; // efectivo sacado del cajon durante el dia
  retiradasTotal: number;
  cierre: {
    efectivoContado: number;
    datafono: number;
    fondoSiguiente: number;
    efectivoEsperado: number;
    tarjetaEsperada: number;
    fondoAnterior: number;
    retiradas: number;
    notas: string | null;
    cerradoPor: string | null;
    actualizado: string;
  } | null; // null = aun sin cerrar
};

export async function getCierreDia(fecha: string): Promise<CierreDia> {
  const vacio: CierreDia = {
    fecha,
    ticketsAbiertos: [],
    numTickets: 0,
    totalDia: 0,
    efectivoEsperado: 0,
    tarjetaEsperada: 0,
    fondoAnterior: 0,
    retiradas: [],
    retiradasTotal: 0,
    cierre: null,
  };
  const db = getDb();
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return vacio;

  try {
    return await conPlazo(
      (async (): Promise<CierreDia> => {
        const desde = new Date(fecha + "T00:00:00Z");
        const hasta = new Date(desde.getTime() + 86_400_000);

        const [abiertos, cobrados, [cierreFila], [previo], retiradasFilas] = await Promise.all([
          db
            .select({ ticket: schema.tickets, mesaNombre: schema.mesas.nombre })
            .from(schema.tickets)
            .leftJoin(schema.mesas, eq(schema.tickets.mesaId, schema.mesas.id))
            .where(eq(schema.tickets.estado, "abierto")),
          db
            .select({ id: schema.tickets.id, total: schema.tickets.total })
            .from(schema.tickets)
            .where(
              and(
                eq(schema.tickets.estado, "cobrado"),
                gte(schema.tickets.cobradoAt, desde),
                lt(schema.tickets.cobradoAt, hasta),
              ),
            ),
          db.select().from(schema.cierresCaja).where(eq(schema.cierresCaja.fecha, fecha)),
          db
            .select()
            .from(schema.cierresCaja)
            .where(lt(schema.cierresCaja.fecha, fecha))
            .orderBy(desc(schema.cierresCaja.fecha))
            .limit(1),
          db
            .select()
            .from(schema.retiradasCaja)
            .where(eq(schema.retiradasCaja.fecha, fecha))
            .orderBy(asc(schema.retiradasCaja.createdAt)),
        ]);

        // Totales de los abiertos (suma de sus lineas)
        const idsAbiertos = abiertos.map((a) => a.ticket.id);
        const totalesAbiertos = new Map<string, number>();
        if (idsAbiertos.length) {
          const lineas = await db
            .select({ ticketId: schema.ticketLineas.ticketId, total: schema.ticketLineas.total })
            .from(schema.ticketLineas)
            .where(inArray(schema.ticketLineas.ticketId, idsAbiertos));
          for (const l of lineas) {
            totalesAbiertos.set(l.ticketId, (totalesAbiertos.get(l.ticketId) ?? 0) + Number(l.total));
          }
        }

        // Efectivo/tarjeta del dia desde los PAGOS de los tickets cobrados
        let efectivoEsperado = 0;
        let tarjetaEsperada = 0;
        if (cobrados.length) {
          const pagos = await db
            .select()
            .from(schema.ticketPagos)
            .where(inArray(schema.ticketPagos.ticketId, cobrados.map((c) => c.id)));
          for (const p of pagos) {
            if (p.metodo === "efectivo") efectivoEsperado += Number(p.importe);
            else tarjetaEsperada += Number(p.importe);
          }
        }

        return {
          fecha,
          ticketsAbiertos: abiertos.map((a) => ({
            id: a.ticket.id,
            mesa: a.mesaNombre ?? "Para llevar",
            total: totalesAbiertos.get(a.ticket.id) ?? 0,
          })),
          numTickets: cobrados.length,
          totalDia: cobrados.reduce((acc, c) => acc + Number(c.total ?? 0), 0),
          efectivoEsperado,
          tarjetaEsperada,
          fondoAnterior: previo ? Number(previo.fondoSiguiente) : 0,
          retiradas: retiradasFilas.map((r) => ({
            id: r.id,
            importe: Number(r.importe),
            motivo: r.motivo,
            hora: new Intl.DateTimeFormat("es-ES", {
              timeZone: "Europe/Madrid",
              hour: "2-digit",
              minute: "2-digit",
            }).format(r.createdAt),
          })),
          retiradasTotal: retiradasFilas.reduce((acc, r) => acc + Number(r.importe), 0),
          cierre: cierreFila
            ? {
                efectivoContado: Number(cierreFila.efectivoContado),
                datafono: Number(cierreFila.datafono),
                fondoSiguiente: Number(cierreFila.fondoSiguiente),
                efectivoEsperado: Number(cierreFila.efectivoEsperado),
                tarjetaEsperada: Number(cierreFila.tarjetaEsperada),
                fondoAnterior: Number(cierreFila.fondoAnterior),
                retiradas: Number(cierreFila.retiradas),
                notas: cierreFila.notas,
                cerradoPor: cierreFila.cerradoPor,
                actualizado: new Intl.DateTimeFormat("es-ES", {
                  timeZone: "Europe/Madrid",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(cierreFila.updatedAt),
              }
            : null,
        };
      })(),
      12_000,
    );
  } catch (e) {
    logFallo("getCierreDia", e);
    return vacio;
  }
}

// ---------------------------------------------------------------------
// Historico de cierres de caja
// ---------------------------------------------------------------------

export type CierreHistorico = {
  fecha: string; // ISO, para navegar a ?dia=
  fechaLegible: string;
  efectivoContado: number;
  efectivoEsperado: number; // fondo anterior + ventas efectivo − retiradas (snapshot)
  difEfectivo: number;
  datafono: number;
  tarjetaEsperada: number;
  difTarjeta: number;
  fondoSiguiente: number;
  retiradas: number;
  cerradoPor: string | null;
  notas: string | null;
};

export async function getCierresHistorico(limite = 30): Promise<CierreHistorico[]> {
  const db = getDb();
  if (!db) return [];
  try {
    return await conPlazo(
      (async (): Promise<CierreHistorico[]> => {
        const filas = await db
          .select()
          .from(schema.cierresCaja)
          .orderBy(desc(schema.cierresCaja.fecha))
          .limit(limite);
        return filas.map((c) => {
          const esperadoCajon = Number(c.fondoAnterior) + Number(c.efectivoEsperado) - Number(c.retiradas);
          return {
            fecha: c.fecha,
            fechaLegible: fechaLegible(c.fecha),
            efectivoContado: Number(c.efectivoContado),
            efectivoEsperado: esperadoCajon,
            difEfectivo: Number(c.efectivoContado) - esperadoCajon,
            datafono: Number(c.datafono),
            tarjetaEsperada: Number(c.tarjetaEsperada),
            difTarjeta: Number(c.datafono) - Number(c.tarjetaEsperada),
            fondoSiguiente: Number(c.fondoSiguiente),
            retiradas: Number(c.retiradas),
            cerradoPor: c.cerradoPor,
            notas: c.notas,
          };
        });
      })(),
    );
  } catch (e) {
    logFallo("getCierresHistorico", e);
    return [];
  }
}
