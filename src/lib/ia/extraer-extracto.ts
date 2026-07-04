// Lectura de extractos bancarios con Claude (visión + salida estructurada vía
// tool use). Devuelve los movimientos; el emparejado con facturas se hace luego
// de forma determinista en la server action.
import Anthropic from "@anthropic-ai/sdk";

export type MovimientoExtraido = {
  fecha: string | null;
  importe: number; // negativo = cargo/pago (sale dinero); positivo = ingreso
  concepto: string;
  proveedor_id: string | null; // si la IA reconoce a quién se paga
};

const HERRAMIENTA: Anthropic.Tool = {
  name: "guardar_extracto",
  description: "Guarda los movimientos leídos del extracto bancario",
  input_schema: {
    type: "object",
    properties: {
      movimientos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fecha: { type: ["string", "null"], description: "Fecha del movimiento en formato YYYY-MM-DD" },
            importe: {
              type: "number",
              description:
                "Importe en euros: NEGATIVO si es un cargo/pago (dinero que SALE), POSITIVO si es un ingreso",
            },
            concepto: { type: "string", description: "Texto/concepto del movimiento tal cual aparece" },
            proveedor_id: {
              type: ["string", "null"],
              description:
                "id del proveedor conocido si el concepto identifica claramente a quién se paga; si no, null",
            },
          },
          required: ["importe", "concepto"],
        },
      },
    },
    required: ["movimientos"],
  },
};

export async function extraerExtracto(opciones: {
  base64: string;
  mediaType: string;
  proveedores: { id: string; nombre: string }[];
}): Promise<MovimientoExtraido[]> {
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

  const prompt = `Eres el lector de extractos bancarios de Can Costa, un restaurante de Barcelona.
Extrae TODOS los movimientos del extracto adjunto (una fila por movimiento).

Proveedores conocidos (para identificar a quién se paga en cada cargo):
${opciones.proveedores.map((p) => `- ${p.id} | ${p.nombre}`).join("\n")}

Reglas:
- importe: NEGATIVO si es un cargo/pago (dinero que SALE de la cuenta), POSITIVO si es un ingreso.
- Importes en euros con punto decimal (1.234,56 → 1234.56).
- fecha SIEMPRE en formato YYYY-MM-DD (los extractos españoles usan DD/MM: conviértela).
- concepto: el texto del movimiento tal cual (transferencia, recibo, adeudo…).
- proveedor_id: pon el id del proveedor conocido si el concepto identifica claramente a quién se paga; si no, null.
- No inventes movimientos ni importes: si un dato no se lee, déjalo en null (salvo importe y concepto).`;

  const respuesta = await cliente.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    tools: [HERRAMIENTA],
    tool_choice: { type: "tool", name: "guardar_extracto" },
    messages: [{ role: "user", content: [documento, { type: "text", text: prompt }] }],
  });

  const bloque = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloque || bloque.type !== "tool_use") throw new Error("La IA no devolvió movimientos");
  const datos = bloque.input as { movimientos?: MovimientoExtraido[] };
  return datos.movimientos ?? [];
}
