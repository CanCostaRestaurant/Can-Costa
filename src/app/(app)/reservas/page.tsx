import { getReservasDia } from "@/lib/db/queries";
import { ReservasClient } from "./reservas-client";

export const dynamic = "force-dynamic";

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoy;

  const datos = await getReservasDia(fecha);
  return <ReservasClient datos={datos} hoy={hoy} />;
}
