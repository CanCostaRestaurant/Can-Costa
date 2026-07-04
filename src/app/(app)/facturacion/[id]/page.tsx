import { redirect } from "next/navigation";
import { getFacturaVenta } from "@/lib/db/queries";
import { FacturaView } from "./factura-view";

export const dynamic = "force-dynamic";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = await getFacturaVenta(id);
  if (!factura) redirect("/facturacion");
  return <FacturaView factura={factura} />;
}
