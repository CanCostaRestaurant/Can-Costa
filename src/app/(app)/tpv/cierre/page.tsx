import { getCierreDia } from "@/lib/db/queries";
import { CierreClient } from "./cierre-client";

export const dynamic = "force-dynamic";

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hoyMadrid();
  const datos = await getCierreDia(fecha);
  return <CierreClient datos={datos} hoy={hoyMadrid()} />;
}
