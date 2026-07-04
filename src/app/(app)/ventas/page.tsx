import { getCierreDia, getCierresHistorico, getDesgloseDia, getVentas } from "@/lib/db/queries";
import { VentasClient } from "./ventas-client";

export const dynamic = "force-dynamic";

export default async function VentasPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoy;

  const [desglose, historico, caja, cajas] = await Promise.all([
    getDesgloseDia(fecha),
    getVentas(35),
    getCierreDia(fecha),
    getCierresHistorico(35),
  ]);
  return (
    <VentasClient desglose={desglose} historico={historico} caja={caja} cajas={cajas} hoy={hoy} />
  );
}
