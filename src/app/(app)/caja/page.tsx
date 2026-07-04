import { getCierreDia, getCierresHistorico } from "@/lib/db/queries";
import { CajaClient } from "./caja-client";

export const dynamic = "force-dynamic";

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoyMadrid();
  const [caja, cajas] = await Promise.all([getCierreDia(fecha), getCierresHistorico(35)]);
  return <CajaClient caja={caja} cajas={cajas} hoy={hoyMadrid()} />;
}
