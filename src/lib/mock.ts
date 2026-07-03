// Datos de ejemplo mientras el visual se valida; luego vendrán de Supabase.

export type EstadoFactura = "procesando" | "revisar" | "validada" | "error" | "rechazada";

export type TipoDocumento = "factura" | "albaran" | "ticket";

export type CategoriaGasto =
  | "materia_prima"
  | "bebidas"
  | "limpieza"
  | "consumibles"
  | "gestoria"
  | "alquiler"
  | "suministros"
  | "otros";

export const ETIQUETA_CATEGORIA: Record<CategoriaGasto, string> = {
  materia_prima: "Materia prima",
  bebidas: "Bebidas",
  limpieza: "Limpieza",
  consumibles: "Consumibles",
  gestoria: "Gestoría",
  alquiler: "Alquiler",
  suministros: "Suministros",
  otros: "Otros",
};

// Solo estas categorías alimentan el apartado Productos (regla haddock).
export const CATEGORIAS_CON_PRODUCTOS: CategoriaGasto[] = [
  "materia_prima",
  "bebidas",
  "limpieza",
  "consumibles",
];

export type LineaFactura = {
  producto: string;
  cantidad: string;
  precioUd: string;
  total: number;
  variacion?: number; // % vs última compra
  // Campos para el editor de la bandeja (solo llegan desde BD):
  id?: string;
  productoId?: string | null;
  cantidadNum?: number | null;
  precioNum?: number | null;
  unidad?: string | null;
};

export type Factura = {
  id: string;
  proveedor: string;
  detalle: string;
  fecha: string;
  fechaISO?: string | null; // para filtrar por mes
  lineas: number;
  total: number | null;
  estado: EstadoFactura;
  tipo?: TipoDocumento;
  categoria?: CategoriaGasto | null; // null = hereda la del proveedor
  categoriaEfectiva?: CategoriaGasto; // la propia o, si no, la del proveedor
  pagada?: boolean;
  incidencia?: string | null;
  motivoRechazo?: string | null;
  lineasDetalle?: LineaFactura[];
  lineasOcultas?: number;
};

export const FACTURAS: Factura[] = [
  {
    id: "f-proc",
    proveedor: "Makro",
    detalle: "subida hace 2 min",
    fecha: "2 jul",
    lineas: 0,
    total: null,
    estado: "procesando",
  },
  {
    id: "f-peixos",
    proveedor: "Peixos Blanch",
    detalle: "albarán 2941",
    fecha: "2 jul",
    lineas: 12,
    total: 284.6,
    estado: "revisar",
    lineasOcultas: 7,
    lineasDetalle: [
      { producto: "Merluza fresca", cantidad: "6,2 kg", precioUd: "12,90 €/kg", total: 79.98, variacion: 8 },
      { producto: "Atún rojo (lomo)", cantidad: "2,4 kg", precioUd: "24,50 €/kg", total: 58.8, variacion: -2 },
      { producto: "Gamba roja", cantidad: "3,0 kg", precioUd: "16,80 €/kg", total: 50.4 },
      { producto: "Pulpo", cantidad: "4,1 kg", precioUd: "11,90 €/kg", total: 48.79 },
      { producto: "Mejillón roca", cantidad: "8,0 kg", precioUd: "3,20 €/kg", total: 25.6 },
    ],
  },
  {
    id: "f-serra",
    proveedor: "Frutas Serra",
    detalle: "albarán diario",
    fecha: "2 jul",
    lineas: 18,
    total: 156.3,
    estado: "revisar",
    lineasOcultas: 14,
    lineasDetalle: [
      { producto: "Aguacate", cantidad: "4,0 kg", precioUd: "6,45 €/kg", total: 25.8, variacion: 15 },
      { producto: "Tomate pera", cantidad: "12,0 kg", precioUd: "1,85 €/kg", total: 22.2, variacion: -3 },
      { producto: "Patata agria", cantidad: "20,0 kg", precioUd: "1,10 €/kg", total: 22.0 },
      { producto: "Limón", cantidad: "5,0 kg", precioUd: "2,30 €/kg", total: 11.5 },
    ],
  },
  { id: "f-makro", proveedor: "Makro", detalle: "factura A-88213", fecha: "1 jul", lineas: 34, total: 612.45, estado: "validada" },
  { id: "f-sola", proveedor: "Cárniques Solà", detalle: "factura 1204", fecha: "29 jun", lineas: 9, total: 348.2, estado: "validada" },
  { id: "f-vila", proveedor: "Distribucions Vila", detalle: "bebidas · factura 7731", fecha: "28 jun", lineas: 11, total: 421.8, estado: "validada" },
  { id: "f-mistral", proveedor: "Forn Mistral", detalle: "albarán semanal", fecha: "28 jun", lineas: 4, total: 62.4, estado: "validada" },
];

export type Producto = {
  id: string;
  nombre: string;
  proveedor: string;
  precio: string;
  ultimaCompra: string;
  variacion: number;
  familia: "pescado" | "carne" | "fruta-verdura" | "seco" | "bebida" | "otros";
  hist: number[];
  meses: string[];
  nota: string;
  // Ficha pro (solo llegan desde BD):
  unidad?: string;
  ultimoNum?: number | null;
  referencia?: number | null; // media ponderada de las compras
  maximo?: number | null;
  minimo?: number | null;
  nCompras?: number;
  precioPactado?: number | null; // tarifa acordada; manda sobre la referencia
  enAlza?: boolean; // última compra por encima de pactado/referencia → rojo
};

export const PRODUCTOS: Producto[] = [
  {
    id: "aceite",
    nombre: "Aceite de oliva suave 5L",
    proveedor: "Makro",
    precio: "28,90 €/ud",
    ultimaCompra: "30 jun",
    variacion: 12,
    familia: "seco",
    hist: [24.2, 24.6, 25.1, 26.4, 27.8, 28.9],
    meses: ["feb", "mar", "abr", "may", "jun", "jun"],
    nota: "Ha subido un <b>12%</b> desde febrero. Aparece en <b>9 escandallos</b> — revisa la fritura y los sofritos.",
  },
  {
    id: "merluza",
    nombre: "Merluza fresca",
    proveedor: "Peixos Blanch",
    precio: "12,90 €/kg",
    ultimaCompra: "hoy",
    variacion: 8,
    familia: "pescado",
    hist: [11.4, 11.6, 11.9, 11.8, 11.95, 12.9],
    meses: ["feb", "mar", "abr", "may", "jun", "hoy"],
    nota: "Subida de <b>+8%</b> en la factura de hoy. Afecta a <b>Merluza a la brasa</b> y al menú del día.",
  },
  {
    id: "aguacate",
    nombre: "Aguacate",
    proveedor: "Frutas Serra",
    precio: "6,45 €/kg",
    ultimaCompra: "hoy",
    variacion: 15,
    familia: "fruta-verdura",
    hist: [5.1, 5.3, 5.4, 5.6, 5.6, 6.45],
    meses: ["feb", "mar", "abr", "may", "jun", "hoy"],
    nota: "Subida fuerte de temporada (<b>+15%</b>). Valora sustituirlo o ajustar ración en los 3 platos que lo usan.",
  },
  {
    id: "tomate",
    nombre: "Tomate pera",
    proveedor: "Frutas Serra",
    precio: "1,85 €/kg",
    ultimaCompra: "hoy",
    variacion: -3,
    familia: "fruta-verdura",
    hist: [2.2, 2.15, 2.05, 1.95, 1.9, 1.85],
    meses: ["feb", "mar", "abr", "may", "jun", "hoy"],
    nota: "Bajando desde febrero (<b>−16%</b> acumulado). Buen momento para platos con tomate.",
  },
  {
    id: "solomillo",
    nombre: "Solomillo de vaca",
    proveedor: "Cárniques Solà",
    precio: "26,40 €/kg",
    ultimaCompra: "29 jun",
    variacion: 0,
    familia: "carne",
    hist: [26.1, 26.4, 26.2, 26.4, 26.4, 26.4],
    meses: ["feb", "mar", "abr", "may", "jun", "jun"],
    nota: "Precio estable todo el semestre. Sin cambios en tus escandallos.",
  },
  {
    id: "mozzarella",
    nombre: "Mozzarella fior di latte",
    proveedor: "Makro",
    precio: "7,20 €/kg",
    ultimaCompra: "1 jul",
    variacion: 2,
    familia: "seco",
    hist: [6.9, 7.0, 7.0, 7.05, 7.1, 7.2],
    meses: ["feb", "mar", "abr", "may", "jun", "jul"],
    nota: "Subida suave y sostenida (<b>+4%</b> en 6 meses). Vigilar si sigue.",
  },
  {
    id: "atun",
    nombre: "Atún rojo (lomo)",
    proveedor: "Peixos Blanch",
    precio: "24,50 €/kg",
    ultimaCompra: "hoy",
    variacion: -2,
    familia: "pescado",
    hist: [25.8, 25.2, 25.0, 25.1, 25.0, 24.5],
    meses: ["feb", "mar", "abr", "may", "jun", "hoy"],
    nota: "Ligera bajada. El tartar gana <b>0,12 €</b> de margen por ración.",
  },
  {
    id: "brioche",
    nombre: "Pan brioche",
    proveedor: "Forn Mistral",
    precio: "0,65 €/ud",
    ultimaCompra: "28 jun",
    variacion: 0,
    familia: "seco",
    hist: [0.65, 0.65, 0.65, 0.65, 0.65, 0.65],
    meses: ["feb", "mar", "abr", "may", "jun", "jun"],
    nota: "Precio pactado estable con el proveedor.",
  },
];

export type Ingrediente = {
  nombre: string;
  cantidad: string;
  precio: string;
  coste: number;
  subida?: boolean;
};

export type Plato = {
  id: string;
  nombre: string;
  emoji: string;
  gradiente: string;
  coste: number;
  pvp: number;
  aviso?: string;
  vendidosMes: number;
  ingredientes: Ingrediente[];
};

export const PLATOS: Plato[] = [
  {
    id: "merluza-brasa",
    nombre: "Merluza a la brasa",
    emoji: "🐟",
    gradiente: "linear-gradient(135deg,#FCEFE7,#F7DECD)",
    coste: 6.8,
    pvp: 17.5,
    aviso: "▲ subió la merluza",
    vendidosMes: 142,
    ingredientes: [
      { nombre: "Merluza fresca", cantidad: "320 g", precio: "12,90 €/kg", coste: 4.13, subida: true },
      { nombre: "Patata agria", cantidad: "200 g", precio: "1,10 €/kg", coste: 0.22 },
      { nombre: "Verduras de temporada", cantidad: "150 g", precio: "6,30 €/kg", coste: 0.95 },
      { nombre: "Aceite de oliva suave", cantidad: "40 ml", precio: "5,78 €/L", coste: 0.23 },
      { nombre: "Ajo, perejil y limón", cantidad: "—", precio: "—", coste: 0.27 },
      { nombre: "Merma y varios (15%)", cantidad: "—", precio: "—", coste: 1.0 },
    ],
  },
  {
    id: "tartar-atun",
    nombre: "Tartar de atún",
    emoji: "🥩",
    gradiente: "linear-gradient(135deg,#FBE9E4,#F5D5CB)",
    coste: 4.85,
    pvp: 16.5,
    vendidosMes: 96,
    ingredientes: [
      { nombre: "Atún rojo (lomo)", cantidad: "140 g", precio: "24,50 €/kg", coste: 3.43 },
      { nombre: "Aguacate", cantidad: "80 g", precio: "6,45 €/kg", coste: 0.52 },
      { nombre: "Soja, sésamo y encurtidos", cantidad: "—", precio: "—", coste: 0.45 },
      { nombre: "Merma y varios (10%)", cantidad: "—", precio: "—", coste: 0.45 },
    ],
  },
  {
    id: "hamburguesa",
    nombre: "Hamburguesa de la casa",
    emoji: "🍔",
    gradiente: "linear-gradient(135deg,#F3EEDF,#EAE0C4)",
    coste: 3.1,
    pvp: 12.9,
    vendidosMes: 210,
    ingredientes: [
      { nombre: "Vacuno picado", cantidad: "180 g", precio: "9,80 €/kg", coste: 1.76 },
      { nombre: "Pan brioche", cantidad: "1 ud", precio: "0,65 €/ud", coste: 0.65 },
      { nombre: "Queso, lechuga y tomate", cantidad: "—", precio: "—", coste: 0.42 },
      { nombre: "Merma y varios (10%)", cantidad: "—", precio: "—", coste: 0.27 },
    ],
  },
  {
    id: "burrata",
    nombre: "Ensalada de burrata",
    emoji: "🥗",
    gradiente: "linear-gradient(135deg,#EFF2E5,#DEE5C8)",
    coste: 3.95,
    pvp: 10.9,
    vendidosMes: 88,
    ingredientes: [
      { nombre: "Burrata", cantidad: "1 ud (125 g)", precio: "2,10 €/ud", coste: 2.1 },
      { nombre: "Tomate pera", cantidad: "180 g", precio: "1,85 €/kg", coste: 0.33 },
      { nombre: "Rúcula y pesto", cantidad: "—", precio: "—", coste: 1.16 },
      { nombre: "Merma y varios (10%)", cantidad: "—", precio: "—", coste: 0.36 },
    ],
  },
  {
    id: "canelones",
    nombre: "Canelones de rustido",
    emoji: "🥘",
    gradiente: "linear-gradient(135deg,#F6EBE0,#EDD9C4)",
    coste: 2.6,
    pvp: 11.5,
    vendidosMes: 124,
    ingredientes: [
      { nombre: "Carne de rustido", cantidad: "120 g", precio: "8,90 €/kg", coste: 1.07 },
      { nombre: "Placas de canelón", cantidad: "4 ud", precio: "0,08 €/ud", coste: 0.32 },
      { nombre: "Bechamel y queso", cantidad: "—", precio: "—", coste: 0.86 },
      { nombre: "Merma y varios (15%)", cantidad: "—", precio: "—", coste: 0.35 },
    ],
  },
  {
    id: "pulpo",
    nombre: "Pulpo a la brasa",
    emoji: "🐙",
    gradiente: "linear-gradient(135deg,#F2E7EA,#E5CDD4)",
    coste: 7.9,
    pvp: 19.0,
    vendidosMes: 74,
    ingredientes: [
      { nombre: "Pulpo", cantidad: "450 g", precio: "11,90 €/kg", coste: 5.36 },
      { nombre: "Patata agria", cantidad: "150 g", precio: "1,10 €/kg", coste: 0.17 },
      { nombre: "Pimentón y alioli", cantidad: "—", precio: "—", coste: 1.06 },
      { nombre: "Merma y varios (15%)", cantidad: "—", precio: "—", coste: 1.31 },
    ],
  },
];

export const KPIS = {
  comprasMes: 8420,
  comprasVs: "+6%",
  foodCost: 31.2,
  foodCostObjetivo: 30,
  margenMedio: 68.8,
  alertas: 3,
};

export const COMPRAS_SEMANA = [
  { semana: "Sem 1", total: 1850 },
  { semana: "Sem 2", total: 2140 },
  { semana: "Sem 3", total: 1980 },
  { semana: "Sem 4", total: 2450 },
];

export const OBJETIVO_FOOD_COST = 33;

export function foodCost(plato: { coste: number; pvp: number }): number {
  return (plato.coste / plato.pvp) * 100;
}

export function nivelFoodCost(fc: number): "good" | "warn" | "bad" {
  if (fc <= OBJETIVO_FOOD_COST) return "good";
  if (fc <= 38) return "warn";
  return "bad";
}
