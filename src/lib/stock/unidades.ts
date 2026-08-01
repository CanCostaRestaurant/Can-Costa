// Conversión de unidades para el motor de stock: las líneas de factura llegan
// con la unidad en texto crudo tal cual la leyó la IA ("KG", "kgs", "Caja",
// "uds", "L", "500 g"...) y el producto mide en su unidad de referencia
// (kg / L / ud). Solo se suma stock cuando la conversión es SEGURA; si la
// unidad no se entiende (cajas, packs, formatos), la entrada se salta y el
// recuento la corrige después — mejor no sumar que sumar mal.

type UnidadBase = "kg" | "l" | "ud";

// alias → [unidad base, factor a la base]
const ALIAS: Record<string, [UnidadBase, number]> = {
  kg: ["kg", 1], kgs: ["kg", 1], kilo: ["kg", 1], kilos: ["kg", 1], kilogramo: ["kg", 1], kilogramos: ["kg", 1],
  g: ["kg", 0.001], gr: ["kg", 0.001], grs: ["kg", 0.001], gramo: ["kg", 0.001], gramos: ["kg", 0.001],
  l: ["l", 1], lt: ["l", 1], lts: ["l", 1], litro: ["l", 1], litros: ["l", 1],
  ml: ["l", 0.001], cl: ["l", 0.01],
  ud: ["ud", 1], uds: ["ud", 1], u: ["ud", 1], und: ["ud", 1], unidad: ["ud", 1], unidades: ["ud", 1],
  pieza: ["ud", 1], piezas: ["ud", 1], pza: ["ud", 1], pzas: ["ud", 1],
  botella: ["ud", 1], botellas: ["ud", 1], bote: ["ud", 1], botes: ["ud", 1], lata: ["ud", 1], latas: ["ud", 1],
};

function base(unidad: string | null | undefined): [UnidadBase, number] | null {
  if (!unidad) return null;
  const limpia = unidad.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.\s]/g, "");
  return ALIAS[limpia] ?? null;
}

// Cantidad de una línea de factura convertida a la unidad del producto.
// null = no se puede convertir con seguridad (unidades incompatibles o rara).
export function convertirAUnidadProducto(
  cantidad: number,
  unidadLinea: string | null | undefined,
  unidadProducto: string,
): number | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
  const deProducto = base(unidadProducto);
  if (!deProducto) return null;
  // Línea sin unidad: solo se asume la del producto cuando este cuenta UNIDADES
  // (12 → 12 botellas es razonable; 12 sin unidad NO son 12 kg seguro).
  const deLinea = base(unidadLinea) ?? (deProducto[0] === "ud" ? deProducto : null);
  if (!deLinea) return null;
  if (deLinea[0] !== deProducto[0]) return null; // kg vs L vs ud: incompatibles
  return (cantidad * deLinea[1]) / deProducto[1];
}
