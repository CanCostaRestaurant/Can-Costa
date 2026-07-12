// Tool del agente de voz: datos de la casa para preguntas frecuentes
// (horarios, dirección, teléfono) — siempre desde los mandos de Ajustes,
// así renombrar el restaurante o cambiar turnos actualiza también al agente.
import { NextResponse, type NextRequest } from "next/server";
import { CARTA, RITUAL_CERVESA } from "@/lib/carta";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { autorizado, contextoFechas, NOMBRES_DIA } from "../comun";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mandos = await cargarMandos();
  const r = mandos.restaurante;
  return NextResponse.json({
    ok: true,
    ...contextoFechas(),
    nombre: r.nombre,
    direccion: r.direccion || null,
    telefono: r.telefono || null,
    horarios: mandos.servicios.map((s) => ({ servicio: s.nombre, de: s.inicio, a: s.fin })),
    dias_cierre: mandos.diasCierre.map((d) => NOMBRES_DIA[d]),
    maximo_comensales_online: 20,
    carta: {
      ritual: `${RITUAL_CERVESA.nombre} — ${RITUAL_CERVESA.pvp}€`,
      secciones: CARTA.map((g) => ({
        seccion: g.titulo,
        platos: g.platos.map((p) => `${p.nombre} ${p.pvp}€${p.nota ? ` (${p.nota})` : ""}`),
      })),
      nota_carta:
        "Si preguntan qué hay: destaca 2-3 platos con gracia (la brasa es lo nuestro), NUNCA recites la carta entera. Precios solo si los piden.",
    },
    nota: "Para grupos de más de 20 o eventos, tomar nombre y teléfono y avisar de que el equipo devuelve la llamada.",
  });
}
