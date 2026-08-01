import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";
import { getBriefingDia } from "@/lib/db/queries";
import { normalizarBriefing } from "@/lib/briefing/tipos";
import { BriefingClient } from "./briefing-client";

export const dynamic = "force-dynamic";

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

// Fecha de calendario REAL (el regex deja pasar 2026-13-01 y Date hace
// overflow con 2026-02-31): ida y vuelta por Date en UTC.
function esFechaReal(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

export default async function BriefingPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const hoy = hoyMadrid();
  const fecha = dia && esFechaReal(dia) ? dia : hoy;

  const datos = await getBriefingDia(fecha);

  // El equipo de sala (rol tablet) lo LEE; edición para el resto de roles.
  let puedeEditar = true;
  const secreto = process.env.AUTH_SECRET;
  if (secreto) {
    const almacen = await cookies();
    const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
    if (sesion.ok && sesion.rol === "tpv") puedeEditar = false;
  }

  return (
    <BriefingClient
      // key por fecha: al cambiar de día el formulario se REMONTA con los
      // datos de ese día (sin key, useState conservaría el día anterior).
      key={fecha}
      dia={datos}
      inicial={normalizarBriefing(datos.datos)}
      existia={datos.datos !== null}
      hoy={hoy}
      puedeEditar={puedeEditar && !datos.fallo}
      cargaDegradada={datos.fallo}
    />
  );
}
