import { getProveedoresResumen } from "@/lib/db/queries";
import { ProveedoresClient } from "./proveedores-client";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const proveedores = await getProveedoresResumen();
  return <ProveedoresClient proveedores={proveedores} />;
}
