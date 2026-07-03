"use server";

import Anthropic from "@anthropic-ai/sdk";
import { ejecutarHerramientaFina, HERRAMIENTAS_FINA } from "@/lib/fina/herramientas";

export type MensajeFina = { rol: "user" | "assistant"; texto: string };

const MAX_RONDAS = 6;

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function preguntarFina(
  historial: MensajeFina[],
): Promise<{ ok: boolean; texto?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Falta configurar la clave de IA (ANTHROPIC_API_KEY)" };
  }
  const limpio = historial.slice(-12).filter((m) => m.texto.trim());
  if (limpio.length === 0 || limpio.at(-1)!.rol !== "user") {
    return { ok: false, error: "Escríbeme una pregunta" };
  }

  const sistema = `Eres Fina, la administrativa y financiera de IA de Can Costa, un restaurante de Barcelona. Hoy es ${hoyMadrid()}.

Tu trabajo dentro de la app ya incluye leer y digitalizar las facturas que suben a Documentos; además respondes preguntas del dueño con los DATOS REALES del negocio usando tus herramientas de solo lectura.

Normas:
- Responde SIEMPRE en español, cercana y directa, frases cortas. Sin tecnicismos innecesarios.
- Usa las herramientas antes de dar cifras: nunca inventes un número. Si un dato no existe, dilo claramente.
- Formato español para números: 1.234,56 € y porcentajes con coma.
- Cuando detectes algo accionable (subida de precio, food cost alto, plato con poco margen, facturas sin validar), dilo proactivamente en 1 línea al final.
- Respuestas compactas: 2-6 frases o una lista corta. Nada de parrafadas.`;

  const cliente = new Anthropic();
  const mensajes: Anthropic.MessageParam[] = limpio.map((m) => ({
    role: m.rol === "user" ? "user" : "assistant",
    content: m.texto,
  }));

  try {
    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      const respuesta = await cliente.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        system: sistema,
        tools: HERRAMIENTAS_FINA,
        messages: mensajes,
      });

      if (respuesta.stop_reason === "tool_use") {
        mensajes.push({ role: "assistant", content: respuesta.content });
        const resultados: Anthropic.ToolResultBlockParam[] = [];
        for (const bloque of respuesta.content) {
          if (bloque.type === "tool_use") {
            resultados.push({
              type: "tool_result",
              tool_use_id: bloque.id,
              content: await ejecutarHerramientaFina(bloque.name, bloque.input as Record<string, unknown>),
            });
          }
        }
        mensajes.push({ role: "user", content: resultados });
        continue;
      }

      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { ok: true, texto: texto || "No he sabido responder a eso." };
    }
    return { ok: false, error: "Me he liado con demasiadas consultas seguidas — pregúntamelo de otra forma" };
  } catch (e) {
    console.error("[fina] preguntarFina falló:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No he podido consultar la IA ahora mismo — reintenta en unos segundos" };
  }
}
