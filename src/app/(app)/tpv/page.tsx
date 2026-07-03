import { getMapaMesas, getPlatosTpv, getTicketDetalle } from "@/lib/db/queries";
import { ComandaClient } from "./comanda-client";
import { MapaClient } from "./mapa-client";

export const dynamic = "force-dynamic";

export default async function TpvPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;

  if (ticket) {
    const [detalle, platos] = await Promise.all([getTicketDetalle(ticket), getPlatosTpv()]);
    if (detalle && detalle.estado === "abierto") {
      return <ComandaClient ticket={detalle} platos={platos} />;
    }
    // Ticket inexistente o ya cerrado → al mapa.
  }

  const mapa = await getMapaMesas();
  return <MapaClient mapa={mapa} />;
}
