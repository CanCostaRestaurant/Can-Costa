// Tool del agente de voz: ¿hay mesa? Devuelve las horas LIBRES de un día
// para un grupo y, si el día está completo, las próximas fechas con hueco
// (el mismo cross-selling anti-pérdida de la web). JSON pensado para que el
// LLM de la plataforma lo verbalice sin inventar nada.
import { NextResponse, type NextRequest } from "next/server";
import { disponibilidadPublica, proximasFechasLibres } from "@/app/reservar/actions";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { aMin, autorizado, contextoFechas, fechaHablada, hoyMadrid, NOMBRES_DIA } from "../comun";

export const maxDuration = 30;

type Cuerpo = { fecha?: string; comensales?: number; hora?: string };

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let cuerpo: Cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo JSON no válido" }, { status: 400 });
  }

  const fecha = (cuerpo.fecha ?? "").trim();
  const pax = Math.round(Number(cuerpo.comensales));
  const horaDeseada = (cuerpo.hora ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ ok: false, error: "fecha debe ser YYYY-MM-DD" }, { status: 400 });
  }
  if (!Number.isFinite(pax) || pax < 1 || pax > 20) {
    return NextResponse.json(
      { ok: false, error: "comensales debe ser 1-20; para grupos mayores, tomar nota y avisar al equipo" },
      { status: 400 },
    );
  }
  if (fecha < hoyMadrid()) {
    return NextResponse.json({ ok: false, error: "Esa fecha ya ha pasado" }, { status: 400 });
  }

  // Día de cierre semanal: decirlo con claridad (no es "completo") y
  // ofrecer directamente las próximas fechas con hueco.
  const mandos = await cargarMandos();
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  if (mandos.diasCierre.includes(diaSemana)) {
    const otras = await proximasFechasLibres(fecha, pax);
    const nombresCierre = mandos.diasCierre.map((d) => NOMBRES_DIA[d]).join(" y ");
    return NextResponse.json({
      ok: true,
      ...contextoFechas(),
      fecha,
      fecha_hablada: fechaHablada(fecha),
      comensales: pax,
      cerrado: true,
      dias_cierre_semanal: nombresCierre,
      mensaje: `Ese día cerramos (descanso semanal: cerramos cada ${nombresCierre}). Ofrece SOLO las fechas de otras_fechas_con_hueco — hoy y manana son calendario, NO disponibilidad.`,
      hay_mesa: false,
      horas_libres: [],
      hora_pedida: null,
      otras_fechas_con_hueco: (otras.ok ? (otras.fechas ?? []) : []).map((f) => ({
        fecha: f.fecha,
        fecha_hablada: fechaHablada(f.fecha),
        desde_hora: f.hora,
      })),
    });
  }

  const res = await disponibilidadPublica(fecha, pax);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error ?? "No se pudo consultar" }, { status: 500 });
  }

  const slots = res.slots ?? [];
  const libres = slots.filter((s) => s.estado === "libre" || s.estado === "pocas");

  // Horas libres agrupadas por servicio (Comida/Cena), tal cual se dirían.
  const porServicio = [...new Set(libres.map((s) => s.servicio))].map((servicio) => ({
    servicio,
    horas: libres.filter((s) => s.servicio === servicio).map((s) => s.hora),
  }));

  // Si pidió una hora concreta: ¿está libre? Y si no, las 4 más cercanas.
  let horaPedida: { hora: string; libre: boolean; alternativas_cercanas: string[] } | null = null;
  if (horaDeseada && /^\d{2}:\d{2}$/.test(horaDeseada)) {
    const libre = libres.some((s) => s.hora === horaDeseada);
    const objetivo = aMin(horaDeseada);
    const cercanas = libre
      ? []
      : libres
          .map((s) => s.hora)
          .sort((a, b) => Math.abs(aMin(a) - objetivo) - Math.abs(aMin(b) - objetivo))
          .slice(0, 4)
          .sort((a, b) => aMin(a) - aMin(b));
    horaPedida = { hora: horaDeseada, libre, alternativas_cercanas: cercanas };
  }

  // Día completo → próximas fechas con hueco, para no perder la reserva.
  let otrasFechas: { fecha: string; fecha_hablada: string; desde_hora: string }[] = [];
  if (libres.length === 0) {
    const otras = await proximasFechasLibres(fecha, pax);
    otrasFechas = (otras.ok ? (otras.fechas ?? []) : []).map((f) => ({
      fecha: f.fecha,
      fecha_hablada: fechaHablada(f.fecha),
      desde_hora: f.hora,
    }));
  }

  return NextResponse.json({
    ok: true,
    ...contextoFechas(),
    fecha,
    fecha_hablada: fechaHablada(fecha),
    comensales: pax,
    cerrado: false,
    hay_mesa: libres.length > 0,
    horas_libres: porServicio,
    hora_pedida: horaPedida,
    otras_fechas_con_hueco: otrasFechas,
  });
}
