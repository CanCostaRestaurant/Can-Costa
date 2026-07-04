import { getCierreDia, getCierresHistorico } from "@/lib/db/queries";
import { CierreClient } from "./cierre-client";

export const dynamic = "force-dynamic";

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoyMadrid();
  const [datos, historico] = await Promise.all([getCierreDia(fecha), getCierresHistorico()]);
  return <CierreClient datos={datos} historico={historico} hoy={hoyMadrid()} />;
}
