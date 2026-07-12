// Envío por WhatsApp con la Cloud API de Meta (sin proveedor intermedio, es lo
// más barato). Dos tipos de mensaje:
//   - plantilla (template): para INICIAR conversación (el recordatorio). Meta
//     obliga a usar una plantilla aprobada para escribir primero al cliente.
//   - texto libre: solo válido DENTRO de las 24h desde que el cliente escribió
//     (p. ej. el "¡Gracias, quedas confirmado!" tras su respuesta).
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (+ WHATSAPP_TEMPLATE_NAME para el
// recordatorio). Si faltan, devuelve enviado:false con el motivo y no rompe.

const API = "https://graph.facebook.com/v21.0";

export type ResultadoWhatsapp = { enviado: boolean; motivo?: string };

// Teléfono a formato internacional sin '+', que es lo que quiere la Cloud API.
// Los españoles sin prefijo (9 dígitos) se asumen +34.
export function normalizarTelefonoWa(telefono: string): string | null {
  const limpio = telefono.replace(/[^\d+]/g, "");
  if (!limpio) return null;
  if (limpio.startsWith("+")) return limpio.slice(1);
  if (limpio.length === 9) return `34${limpio}`; // España sin prefijo
  return limpio;
}

async function llamar(body: unknown): Promise<ResultadoWhatsapp> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    return { enviado: false, motivo: "WhatsApp sin configurar (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)" };
  }
  try {
    const res = await fetch(`${API}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[whatsapp] Meta respondió", res.status, txt.slice(0, 300));
      return { enviado: false, motivo: `WhatsApp devolvió ${res.status}` };
    }
    return { enviado: true };
  } catch (e) {
    console.error("[whatsapp] envío falló:", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "no se pudo contactar con WhatsApp" };
  }
}

// Recordatorio con plantilla aprobada. Los parámetros van en el orden {{1}},
// {{2}}… del cuerpo de la plantilla (aquí: nombre, hora, comensales).
export async function enviarPlantillaRecordatorio(datos: {
  telefono: string;
  nombre: string;
  hora: string;
  comensales: number;
}): Promise<ResultadoWhatsapp> {
  const to = normalizarTelefonoWa(datos.telefono);
  if (!to) return { enviado: false, motivo: "teléfono no válido" };
  const plantilla = process.env.WHATSAPP_TEMPLATE_NAME;
  if (!plantilla) return { enviado: false, motivo: "falta WHATSAPP_TEMPLATE_NAME" };
  const idioma = process.env.WHATSAPP_TEMPLATE_LANG || "es";

  return llamar({
    to,
    type: "template",
    template: {
      name: plantilla,
      language: { code: idioma },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: datos.nombre },
            { type: "text", text: datos.hora },
            { type: "text", text: String(datos.comensales) },
          ],
        },
      ],
    },
  });
}

// Texto libre (solo dentro de la ventana de 24h). Best-effort: si falla, no pasa
// nada — es solo el acuse de "gracias, confirmado".
export async function enviarTextoWa(telefono: string, texto: string): Promise<ResultadoWhatsapp> {
  const to = normalizarTelefonoWa(telefono);
  if (!to) return { enviado: false, motivo: "teléfono no válido" };
  return llamar({ to, type: "text", text: { body: texto } });
}
