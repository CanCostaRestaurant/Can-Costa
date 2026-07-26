import { getMapaMesas, getPlatosTpv, getTicketDetalle } from "@/lib/db/queries";
import { ComanderoComanda, ComanderoMesas } from "./comandero-client";

export const dynamic = "force-dynamic";

// COMANDERO: el TPV de bolsillo del camarero. Solo pasar pedidos — elegir
// mesa, marcar platos y enviarlos a cocina. Cobrar, caja y facturas se quedan
// en la tablet fija (/tpv): aquí ni aparecen.
export default async function ComanderoPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;

  if (ticket) {
    const [detalle, platos] = await Promise.all([getTicketDetalle(ticket), getPlatosTpv()]);
    if (detalle && detalle.estado === "abierto") {
      return <ComanderoComanda ticket={detalle} platos={platos} />;
    }
    // Ticket inexistente o ya cobrado → a las mesas.
  }

  const mapa = await getMapaMesas();
  return <ComanderoMesas mapa={mapa} />;
}
