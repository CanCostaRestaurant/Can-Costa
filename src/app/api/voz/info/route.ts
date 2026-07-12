// Tool del agente de voz: datos de la casa para preguntas frecuentes
// (horarios, dirección, teléfono) — siempre desde los mandos de Ajustes,
// así renombrar el restaurante o cambiar turnos actualiza también al agente.
import { NextResponse, type NextRequest } from "next/server";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { autorizado } from "../comun";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mandos = await cargarMandos();
  const r = mandos.restaurante;
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return NextResponse.json({
    ok: true,
    nombre: r.nombre,
    direccion: r.direccion || null,
    telefono: r.telefono || null,
    horarios: mandos.servicios.map((s) => ({ servicio: s.nombre, de: s.inicio, a: s.fin })),
    dias_cierre: mandos.diasCierre.map((d) => DIAS[d]),
    maximo_comensales_online: 20,
    nota: "Para grupos de más de 20 o eventos, tomar nombre y teléfono y avisar de que el equipo devuelve la llamada.",
  });
}
