import { getConciliacion } from "@/lib/db/queries";
import { ConciliacionClient } from "./conciliacion-client";

export const dynamic = "force-dynamic";

export default async function ConciliacionPage() {
  const datos = await getConciliacion();
  return <ConciliacionClient datos={datos} />;
}
