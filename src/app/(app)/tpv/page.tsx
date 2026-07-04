import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";
import { getMapaMesas, getPlatosTpv, getTicketDetalle } from "@/lib/db/queries";
import { ComandaClient } from "./comanda-client";
import { MapaClient } from "./mapa-client";

export const dynamic = "force-dynamic";

async function esModoTablet(): Promise<boolean> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return false;
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok && sesion.rol === "tpv";
}

export default async function TpvPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;

  if (ticket) {
    const [detalle, platos] = await Promise.all([getTicketDetalle(ticket), getPlatosTpv()]);
    if (detalle && detalle.estado === "abierto") {
      return <ComandaClient ticket={detalle} platos={platos} />;
    }
    // Ticket inexistente o ya cerrado → al mapa.
  }

  const [mapa, esTablet] = await Promise.all([getMapaMesas(), esModoTablet()]);
  return <MapaClient mapa={mapa} esTablet={esTablet} />;
}
