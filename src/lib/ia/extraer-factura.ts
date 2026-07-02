// Lectura de albaranes/facturas con Claude (visión + salida estructurada
// forzada vía tool use). El catálogo y los proveedores van en el prompt para
// que el propio modelo haga el mapeo de líneas → producto.
import Anthropic from "@anthropic-ai/sdk";

export type LineaExtraida = {
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precio_unitario: number | null;
  total: number | null;
  producto_id: string | null;
};

export type FacturaExtraida = {
  proveedor: string;
  proveedor_id: string | null;
  numero: string | null;
  fecha: string | null;
  base: number | null;
  iva: number | null;
  total: number | null;
  lineas: LineaExtraida[];
};

const HERRAMIENTA: Anthropic.Tool = {
  name: "guardar_factura",
  description: "Guarda los datos extraídos del albarán o factura",
  input_schema: {
    type: "object",
    properties: {
      proveedor: { type: "string", description: "Nombre del proveedor tal y como aparece" },
      proveedor_id: { type: ["string", "null"], description: "id del proveedor conocido si coincide claramente" },
      numero: { type: ["string", "null"], description: "Número de factura o albarán" },
      fecha: { type: ["string", "null"], description: "Fecha del documento en formato YYYY-MM-DD" },
      base: { type: ["number", "null"], description: "Base imponible en euros" },
      iva: { type: ["number", "null"], description: "IVA en euros" },
      total: { type: ["number", "null"], description: "Total del documento en euros" },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string", description: "Texto de la línea tal cual aparece" },
            cantidad: { type: ["number", "null"] },
            unidad: { type: ["string", "null"], description: "kg, ud, L, caja…" },
            precio_unitario: { type: ["number", "null"], description: "Precio por unidad en euros" },
            total: { type: ["number", "null"], description: "Importe de la línea en euros" },
            producto_id: {
              type: ["string", "null"],
              description: "id del producto del catálogo SOLO si la correspondencia es clara",
            },
          },
          required: ["descripcion"],
        },
      },
    },
    required: ["proveedor", "lineas"],
  },
};

export async function extraerFactura(opciones: {
  base64: string;
  mediaType: string;
  productos: { id: string; nombre: string; unidad: string }[];
  proveedores: { id: string; nombre: string }[];
}): Promise<FacturaExtraida> {
  const cliente = new Anthropic(); // usa ANTHROPIC_API_KEY

  const documento =
    opciones.mediaType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: opciones.base64 },
        } as Anthropic.ContentBlockParam)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: opciones.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: opciones.base64,
          },
        } as Anthropic.ContentBlockParam);

  const prompt = `Eres el lector de albaranes y facturas de Can Costa, un restaurante de Barcelona.
Extrae la cabecera y TODAS las líneas de producto del documento adjunto.

Catálogo de productos (mapea cada línea a un id SOLO si la correspondencia es clara):
${opciones.productos.map((p) => `- ${p.id} | ${p.nombre} | se compra por ${p.unidad}`).join("\n")}

Proveedores conocidos:
${opciones.proveedores.map((p) => `- ${p.id} | ${p.nombre}`).join("\n")}

Reglas:
- La fecha SIEMPRE en formato YYYY-MM-DD (los documentos españoles suelen usar DD/MM/YYYY: conviértela).
- Importes en euros con punto decimal (1.234,56 € → 1234.56).
- unidad: normaliza a "kg", "ud", "L" o "caja" cuando sea posible.
- proveedor_id: usa el id del proveedor conocido si el nombre coincide; si no, null y deja el nombre leído en proveedor.
- No inventes líneas ni importes: si un dato no se lee bien, déjalo en null.`;

  const respuesta = await cliente.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    tools: [HERRAMIENTA],
    tool_choice: { type: "tool", name: "guardar_factura" },
    messages: [{ role: "user", content: [documento, { type: "text", text: prompt }] }],
  });

  const bloque = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloque || bloque.type !== "tool_use") {
    throw new Error("La IA no devolvió datos estructurados");
  }
  return bloque.input as FacturaExtraida;
}
