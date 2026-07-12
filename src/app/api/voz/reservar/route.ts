// Tool del agente de voz: crear la reserva. Reutiliza reservarPublica al
// completo (validación, asignación de mesa real, ficha de cliente, SMS/email
// de confirmación) con origen='telefono'. Si la mesa voló mientras hablaban,
// devuelve alternativas para que el agente re-ofrezca sin colgar.
import { NextResponse, type NextRequest } from "next/server";
import { disponibilidadPublica, reservarPublica } from "@/app/reservar/actions";
import { aMin, autorizado, contextoFechas, fechaHablada } from "../comun";

export const maxDuration = 30;

type Cuerpo = {
  nombre?: string;
  telefono?: string;
  email?: string;
  fecha?: string;
  hora?: string;
  comensales?: number;
  notas?: string;
};

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let cuerpo: Cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo JSON no válido" }, { status: 400 });
  }

  const res = await reservarPublica({
    nombre: cuerpo.nombre ?? "",
    telefono: cuerpo.telefono,
    email: cuerpo.email,
    fecha: cuerpo.fecha ?? "",
    hora: cuerpo.hora ?? "",
    comensales: Number(cuerpo.comensales),
    notas: cuerpo.notas ? `[por teléfono] ${cuerpo.notas}` : "[por teléfono]",
    companyia: "",
    origen: "telefono",
  });

  if (res.ok) {
    return NextResponse.json({
      ok: true,
      confirmada: true,
      ...contextoFechas(),
      fecha: res.fecha,
      fecha_hablada: fechaHablada(res.fecha!),
      aviso: `La reserva ha quedado para ${fechaHablada(res.fecha!)}. Di al cliente EXACTAMENTE esa fecha con su día de la semana; si no es el día que el cliente quería, cancela el malentendido: pide disculpas y vuelve a empezar con la fecha correcta.`,
      hora: res.hora,
      mesa_hasta: res.hastaHora,
      comensales: res.comensales,
      sms_confirmacion_enviado: Boolean(res.smsEnviado),
      email_confirmacion_enviado: Boolean(res.emailEnviado),
    });
  }

  // Sin mesa a esa hora (o carrera): adjuntar alternativas del día para que
  // el agente pueda re-ofrecer en la misma frase.
  let alternativas: string[] = [];
  if (cuerpo.fecha && /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.fecha) && res.error?.toLowerCase().includes("mesa")) {
    const disp = await disponibilidadPublica(cuerpo.fecha, Math.round(Number(cuerpo.comensales)));
    const libres = (disp.ok ? (disp.slots ?? []) : []).filter(
      (s) => s.estado === "libre" || s.estado === "pocas",
    );
    const objetivo = cuerpo.hora && /^\d{2}:\d{2}$/.test(cuerpo.hora) ? aMin(cuerpo.hora) : null;
    alternativas = libres
      .map((s) => s.hora)
      .sort((a, b) =>
        objetivo === null ? aMin(a) - aMin(b) : Math.abs(aMin(a) - objetivo) - Math.abs(aMin(b) - objetivo),
      )
      .slice(0, 4)
      .sort((a, b) => aMin(a) - aMin(b));
  }

  return NextResponse.json({
    ok: false,
    ...contextoFechas(),
    error: res.error ?? "No se pudo reservar",
    alternativas_horas: alternativas,
  });
}
