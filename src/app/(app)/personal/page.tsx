import { getPersonalMes } from "@/lib/db/queries";
import { PersonalClient } from "./personal-client";

export const dynamic = "force-dynamic";

function mesActualMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()).slice(0, 7);
}

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const elegido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : mesActualMadrid();
  const datos = await getPersonalMes(elegido);
  return <PersonalClient datos={datos} />;
}
