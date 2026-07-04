import { getFacturasEmitidas } from "@/lib/db/queries";
import { FacturacionClient } from "./facturacion-client";

export const dynamic = "force-dynamic";

function mesActualMadrid(): string {
  // "YYYY-MM" en la zona de Madrid.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const elegido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : mesActualMadrid();
  const datos = await getFacturasEmitidas(elegido);
  return <FacturacionClient datos={datos} />;
}
