// Herramientas de SOLO LECTURA para Fina: reutilizan la capa de queries
// (con sus plazos y fallbacks) y devuelven JSON compacto para el modelo.
import Anthropic from "@anthropic-ai/sdk";
import {
  getClientes,
  getDashboardMes,
  getDesgloseDia,
  getFacturas,
  getPlatosResumen,
  getProductosConHistorico,
  getProveedoresResumen,
} from "@/lib/db/queries";

export const HERRAMIENTAS_FINA: Anthropic.Tool[] = [
  {
    name: "resumen_mes",
    description:
      "Resumen económico de un mes: gastos, ventas, margen, food cost, desglose de gastos por proveedor y de ventas por método de cobro. Incluye las facturas pendientes de validar.",
    input_schema: {
      type: "object",
      properties: { mes: { type: "string", description: "Mes en formato YYYY-MM" } },
      required: ["mes"],
    },
  },
  {
    name: "precios_productos",
    description:
      "Catálogo de productos de compra con su último precio, proveedor, última compra y variación % respecto a la compra anterior. Úsalo para detectar subidas de precio.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "escandallos",
    description:
      "Los platos de la carta con su coste de escandallo vivo, PVP, margen y food cost por plato.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "facturas_recientes",
    description: "Últimas facturas y albaranes: proveedor, fecha, total y estado (validada, en bandeja…).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ventas_de_un_dia",
    description: "Desglose de las ventas de un día concreto: tickets, ticket medio, platos vendidos y márgenes.",
    input_schema: {
      type: "object",
      properties: { fecha: { type: "string", description: "Día en formato YYYY-MM-DD" } },
      required: ["fecha"],
    },
  },
  {
    name: "proveedores",
    description: "Gasto acumulado por proveedor y número de documentos.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "clientes_habituales",
    description: "Clientes de reservas: número de reservas, visitas, no-shows y gasto acumulado.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function ejecutarHerramientaFina(nombre: string, entrada: Record<string, unknown>): Promise<string> {
  try {
    switch (nombre) {
      case "resumen_mes": {
        const mes = typeof entrada.mes === "string" ? entrada.mes : "";
        if (!/^\d{4}-\d{2}$/.test(mes)) return "Error: mes debe ser YYYY-MM";
        const d = await getDashboardMes(mes, "real");
        return JSON.stringify({
          mes: d.etiquetaMes,
          gastos_eur: d.gastos,
          ventas_eur: d.ventas,
          margen_eur: d.margen,
          margen_pct: d.margenPct,
          food_cost_pct: d.foodCostPct,
          gastos_por_proveedor: d.desgloseGastos,
          ventas_por_metodo: d.desgloseVentas,
          facturas_pendientes_de_validar: d.facturasPendientes,
        });
      }
      case "precios_productos": {
        const productos = await getProductosConHistorico();
        return JSON.stringify(
          productos.slice(0, 80).map((p) => ({
            nombre: p.nombre,
            proveedor: p.proveedor,
            precio: p.precio,
            ultima_compra: p.ultimaCompra,
            variacion_pct: p.variacion,
          })),
        );
      }
      case "escandallos":
        return JSON.stringify((await getPlatosResumen()).slice(0, 40));
      case "facturas_recientes": {
        const facturas = await getFacturas();
        return JSON.stringify(
          facturas.slice(0, 25).map((f) => ({
            proveedor: f.proveedor,
            fecha: f.fecha,
            total: f.total,
            estado: f.estado,
          })),
        );
      }
      case "ventas_de_un_dia": {
        const fecha = typeof entrada.fecha === "string" ? entrada.fecha : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Error: fecha debe ser YYYY-MM-DD";
        return JSON.stringify(await getDesgloseDia(fecha));
      }
      case "proveedores":
        return JSON.stringify((await getProveedoresResumen()).slice(0, 30));
      case "clientes_habituales": {
        const clientes = await getClientes();
        return JSON.stringify(
          clientes.slice(0, 25).map((c) => ({
            nombre: c.nombre,
            reservas: c.numReservas,
            visitas: c.visitas,
            no_shows: c.noShows,
            gasto_eur: c.gastoTotal,
            ultima_reserva: c.ultimaReserva,
          })),
        );
      }
      default:
        return `Herramienta desconocida: ${nombre}`;
    }
  } catch (e) {
    return `Error consultando datos: ${e instanceof Error ? e.message : "desconocido"}`;
  }
}
