import { getInventario } from "@/lib/db/queries";
import { InventarioClient } from "./inventario-client";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const datos = await getInventario();
  return <InventarioClient datos={datos} />;
}
