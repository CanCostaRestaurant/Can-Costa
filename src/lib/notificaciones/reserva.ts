// Confirmación automática de reserva al cliente, como CoverManager:
// email (Gmail SMTP — el mismo buzón que recibe las facturas por correo)
// y/o SMS (Twilio), con enlace a Google Maps y botón de añadir al calendario.
// Env-driven: si faltan las claves del proveedor, devuelve enviado:false con
// el motivo y la reserva se crea igual (la notificación nunca bloquea).
//
// Env necesarias:
//   Email → IMAP_USER + IMAP_PASSWORD (mismo Gmail que ya usa el buzón de
//           facturas: la contraseña de aplicación autentica también en SMTP)
//   SMS   → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+34...)
import { enviarCorreo } from "@/lib/correo/enviar";
import type { MandosReservas } from "@/lib/reservas/config";

export type DatosConfirmacion = {
  nombre: string;
  email: string | null;
  telefono: string | null;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  comensales: number;
  hastaHora: string; // fin del doblaje: "tu mesa hasta las 22:30"
  zona: string | null; // "Terraza" / "Interior" — al cliente NO se le dice el nº de mesa
};

export type ResultadoEnvio = { enviado: boolean; motivo?: string };

// Al cliente solo le decimos la zona (terraza o interior), no la mesa concreta:
// el número de mesa lo asignamos nosotros y puede cambiar el día del servicio.
export function etiquetaZona(zona: "sala" | "terraza" | "barra" | null | undefined): string | null {
  if (zona === "terraza") return "Terraza";
  if (zona === "barra") return "Barra";
  if (zona === "sala") return "Interior";
  return null;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fechaLarga(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

function urlMaps(r: MandosReservas["restaurante"]): string {
  if (r.mapsUrl.trim()) return r.mapsUrl.trim();
  const consulta = encodeURIComponent(`${r.nombre} ${r.direccion}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${consulta}`;
}

// Enlace "añadir a Google Calendar" (sin API: URL de plantilla pública).
function urlCalendar(datos: DatosConfirmacion, r: MandosReservas["restaurante"]): string {
  const inicio = `${datos.fecha.replaceAll("-", "")}T${datos.hora.replace(":", "")}00`;
  const fin = `${datos.fecha.replaceAll("-", "")}T${datos.hastaHora.replace(":", "")}00`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Reserva en ${r.nombre}`,
    dates: `${inicio}/${fin}`,
    ctz: "Europe/Madrid",
    location: `${r.nombre}, ${r.direccion}`,
    details: `Mesa para ${datos.comensales}. ${r.telefono ? `Tel. ${r.telefono}` : ""}`.trim(),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export async function enviarEmailConfirmacion(
  datos: DatosConfirmacion,
  mandos: MandosReservas,
): Promise<ResultadoEnvio> {
  if (!datos.email?.trim()) return { enviado: false, motivo: "la reserva no tiene email" };

  const r = mandos.restaurante;
  const nombrePila = datos.nombre.split(" ")[0];
  // Sobrio (sin colores chillones ni imágenes) para no parecer "newsletter" y
  // reducir spam, pero con UN botón claro —en tinta oscura— para el calendario.
  const html = `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1c1917">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c">${r.nombre}</p>
    <h2 style="margin:0 0 14px;font-weight:normal;font-size:22px">Tu reserva está confirmada</h2>
    <p style="margin:0 0 18px;font-family:system-ui,sans-serif;color:#57534e">Hola ${nombrePila}, te esperamos.</p>
    <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#78716c">Día</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right"><b>${fechaLarga(datos.fecha)}</b></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#78716c">Hora</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right"><b>${datos.hora}</b> · mesa hasta las ${datos.hastaHora}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#78716c">Comensales</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right"><b>${datos.comensales}</b>${datos.zona ? ` · ${datos.zona}` : ""}</td></tr>
    </table>
    <div style="text-align:center;margin:26px 0 6px">
      <a href="${urlCalendar(datos, r)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;padding:14px 30px;border-radius:10px">Añadir al calendario</a>
    </div>
    <p style="margin:10px 0 0;text-align:center;font-family:system-ui,sans-serif;font-size:13px;color:#78716c">
      Guarda la reserva en tu móvil para que no se te olvide.
    </p>
    <p style="margin:20px 0 0;font-family:system-ui,sans-serif;font-size:14px;color:#57534e">
      ${r.direccion ? `${r.direccion} — <a href="${urlMaps(r)}" style="color:#1c1917">cómo llegar</a>. ` : ""}${r.telefono ? `Si no puedes venir, avísanos al ${r.telefono}.` : "Si no puedes venir, responde a este correo y lo anulamos."}
    </p>
  </div>`;

  // Versión en texto plano (multipart): Gmail penaliza el HTML a secas.
  const texto = [
    `${r.nombre} — Tu reserva está confirmada`,
    ``,
    `Hola ${nombrePila}, te esperamos.`,
    ``,
    `Día: ${fechaLarga(datos.fecha)}`,
    `Hora: ${datos.hora} (mesa hasta las ${datos.hastaHora})`,
    `Comensales: ${datos.comensales}${datos.zona ? ` · ${datos.zona}` : ""}`,
    ``,
    r.direccion ? `Dirección: ${r.direccion}` : null,
    `Cómo llegar: ${urlMaps(r)}`,
    `Añadir al calendario: ${urlCalendar(datos, r)}`,
    ``,
    r.telefono ? `Si no puedes venir, avísanos al ${r.telefono}.` : "Si no puedes venir, responde a este correo y lo anulamos.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const res = await enviarCorreo({
    para: datos.email.trim(),
    asunto: `Reserva confirmada en ${r.nombre}, ${fechaLarga(datos.fecha)} a las ${datos.hora}`,
    html,
    texto,
    nombreRemitente: r.nombre,
  });
  return res.enviado ? { enviado: true } : { enviado: false, motivo: res.motivo };
}

export async function enviarSmsConfirmacion(
  datos: DatosConfirmacion,
  mandos: MandosReservas,
): Promise<ResultadoEnvio> {
  if (!datos.telefono?.trim()) return { enviado: false, motivo: "la reserva no tiene teléfono" };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { enviado: false, motivo: "SMS sin configurar (TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM)" };
  }

  const r = mandos.restaurante;
  // Los SMS cobran por segmento (~160 chars): mensaje corto y al grano.
  const texto =
    `${r.nombre}: reserva confirmada ${fechaLarga(datos.fecha)} a las ${datos.hora}, ` +
    `${datos.comensales} pax (mesa hasta ${datos.hastaHora}). ` +
    `Ubicacion: ${urlMaps(r)}`;

  // Teléfonos españoles sin prefijo → +34.
  const limpio = datos.telefono.replace(/[\s.-]/g, "");
  const e164 = limpio.startsWith("+") ? limpio : `+34${limpio}`;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: from, Body: texto }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      console.error("[notificaciones] Twilio respondió", res.status, cuerpo.slice(0, 300));
      return { enviado: false, motivo: `el proveedor de SMS devolvió ${res.status}` };
    }
    return { enviado: true };
  } catch (e) {
    console.error("[notificaciones] SMS falló:", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "no se pudo contactar con el proveedor de SMS" };
  }
}
