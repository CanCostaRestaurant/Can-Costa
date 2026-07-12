// Webhook de WhatsApp (Cloud API de Meta).
//   GET  → verificación inicial (Meta manda hub.challenge; se responde tal cual
//          si el hub.verify_token coincide con WHATSAPP_VERIFY_TOKEN).
//   POST → mensajes entrantes. Si el cliente responde afirmativo (botón
//          "Confirmar" o un "sí"/"vale"…), se busca su reserva próxima con
//          recordatorio enviado y sin confirmar, y se marca confirmada_cliente_at
//          (→ verde en el CRM). Un "no" se deja pendiente (no auto-cancelamos).
// La ruta es pública (proxy) porque la llama Meta, no un usuario con sesión.
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { enviarTextoWa } from "@/lib/whatsapp/enviar";

export const dynamic = "force-dynamic";

// Verificación del webhook al darlo de alta en Meta.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const modo = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  if (modo === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

const AFIRMA = [
  "si", "sii", "sip", "vale", "ok", "oka", "okey", "okay", "confirmo", "confirmado",
  "confirmada", "confirmar", "claro", "perfecto", "voy", "vamos", "asistire",
  "asistiremos", "yes", "de acuerdo", "hecho", "genial", "alli estare", "alli estaremos",
];
const NEGA = ["no", "nop", "cancela", "cancelar", "anula", "anular", "imposible", "no podre", "no puedo", "no voy", "no podremos"];

function sinAcentos(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Clasifica la respuesta libre del cliente: afirmativa / negativa / dudosa.
function clasificar(texto: string): "si" | "no" | "?" {
  const t = sinAcentos(texto);
  if (!t) return "?";
  const palabras = t.split(/\s+/);
  const neg = NEGA.some((n) => t === n || palabras.includes(n) || t.startsWith(n + " "));
  const pos = AFIRMA.some((a) => t === a || palabras.includes(a) || t.startsWith(a + " ") || t.startsWith(a));
  if (neg) return "no";
  if (pos) return "si";
  return "?";
}

// Solo los últimos 9 dígitos (móvil español) para cruzar teléfonos aunque estén
// guardados con o sin prefijo, espacios, etc.
function clave(telefono: string | null | undefined): string {
  if (!telefono) return "";
  return telefono.replace(/\D/g, "").slice(-9);
}

export async function POST(req: NextRequest) {
  // A Meta SIEMPRE se le responde 200 (si no, reintenta sin parar). Los errores
  // se registran y ya.
  try {
    const cuerpo = await req.json().catch(() => null);
    const mensajes =
      cuerpo?.entry?.flatMap(
        (e: { changes?: { value?: { messages?: unknown[] } }[] }) =>
          e.changes?.flatMap((c) => c.value?.messages ?? []) ?? [],
      ) ?? [];

    for (const m of mensajes as Record<string, unknown>[]) {
      const from = typeof m.from === "string" ? m.from : null;
      if (!from) continue;

      // Extrae la respuesta según el tipo (botón de plantilla, botón interactivo
      // o texto libre) y decide si es afirmativa.
      let veredicto: "si" | "no" | "?" = "?";
      if (m.type === "button") {
        const b = m.button as { text?: string; payload?: string } | undefined;
        veredicto = clasificar(`${b?.text ?? ""} ${b?.payload ?? ""}`);
      } else if (m.type === "interactive") {
        const i = m.interactive as { button_reply?: { id?: string; title?: string } } | undefined;
        veredicto = clasificar(`${i?.button_reply?.title ?? ""} ${i?.button_reply?.id ?? ""}`);
      } else if (m.type === "text") {
        const t = m.text as { body?: string } | undefined;
        veredicto = clasificar(t?.body ?? "");
      }

      if (veredicto !== "si") continue; // "no"/dudosa → se queda pendiente

      await marcarConfirmada(from);
    }
  } catch (e) {
    console.error("[webhooks/whatsapp] POST falló:", e instanceof Error ? e.message : e);
    resetDb();
  }
  return NextResponse.json({ ok: true });
}

async function marcarConfirmada(from: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const k = clave(from);
  if (!k) return;

  // Reservas próximas ya recordadas y sin confirmar; se cruza el teléfono en JS
  // (por los últimos 9 dígitos) y se confirma la más cercana.
  const candidatas = await conPlazo(
    db
      .select()
      .from(schema.reservas)
      .where(
        and(
          gte(schema.reservas.fecha, hoy),
          isNotNull(schema.reservas.recordatorioAt),
          isNull(schema.reservas.confirmadaClienteAt),
          isNotNull(schema.reservas.telefono),
        ),
      )
      .orderBy(asc(schema.reservas.fecha), asc(schema.reservas.hora)),
  );

  const reserva = candidatas.find((r) => clave(r.telefono) === k);
  if (!reserva) return;

  await conPlazo(
    db
      .update(schema.reservas)
      .set({ confirmadaClienteAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.reservas.id, reserva.id)),
  );

  // Acuse dentro de la ventana de 24h (best-effort; si falla, da igual).
  enviarTextoWa(reserva.telefono!, "¡Gracias! Tu reserva queda confirmada. Te esperamos.").catch(() => {});
}
