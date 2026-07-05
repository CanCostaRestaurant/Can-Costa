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
  mesa: string | null;
};

export type ResultadoEnvio = { enviado: boolean; motivo?: string };

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
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#F7F3EC;border-radius:16px;padding:28px">
    <h2 style="margin:0 0 4px;color:#1c1917">Reserva confirmada ✓</h2>
    <p style="margin:0 0 20px;color:#57534e">${r.nombre} te espera, ${datos.nombre.split(" ")[0]}.</p>
    <div style="background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:20px">
      <p style="margin:0 0 6px"><b>${fechaLarga(datos.fecha)}</b> a las <b>${datos.hora}</b></p>
      <p style="margin:0 0 6px">Mesa para <b>${datos.comensales}</b>${datos.mesa ? ` · ${datos.mesa}` : ""}</p>
      <p style="margin:0;color:#57534e;font-size:14px">Dispones de la mesa hasta las ${datos.hastaHora}.</p>
    </div>
    <p style="margin:0 0 10px">
      <a href="${urlMaps(r)}" style="display:inline-block;background:#E8532F;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">📍 Cómo llegar</a>
      &nbsp;
      <a href="${urlCalendar(datos, r)}" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">🗓 Añadir al calendario</a>
    </p>
    <p style="margin:16px 0 0;color:#78716c;font-size:13px">
      ${r.direccion}${r.telefono ? ` · Si no puedes venir, avísanos: ${r.telefono}` : ""}
    </p>
  </div>`;

  const res = await enviarCorreo({
    para: datos.email.trim(),
    asunto: `Reserva confirmada en ${r.nombre} — ${fechaLarga(datos.fecha)} ${datos.hora}`,
    html,
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
