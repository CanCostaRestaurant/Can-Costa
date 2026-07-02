import { getFacturas } from "@/lib/db/queries";
import { FacturasClient } from "./facturas-client";

export const dynamic = "force-dynamic";

export default async function FacturasPage() {
  const facturas = await getFacturas();
  return <FacturasClient facturas={facturas} />;
}
