// Utilidades compartidas de los endpoints del AGENTE DE VOZ (/api/voz/*).
//
// La plataforma de voz (ElevenLabs Agents, Vapi…) llama a estos endpoints
// como "tools" durante la llamada telefónica: mirar disponibilidad, crear la
// reserva y consultar datos de la casa. Se autentican con Bearer, igual que
// el cron: VOZ_SECRET si está definida, o CRON_SECRET como alternativa (así
// no hace falta estrenar secreto para probar).
import { type NextRequest } from "next/server";

export function autorizado(req: NextRequest): boolean {
  const secreto = process.env.VOZ_SECRET || process.env.CRON_SECRET;
  if (!secreto) return false;
  return req.headers.get("authorization") === `Bearer ${secreto}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-07-18" → "sábado 18 de julio" (para que el agente lo diga natural).
export function fechaHablada(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

export function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export const aMin = (h: string) => {
  const [H, M] = h.split(":").map(Number);
  return H * 60 + M;
};
