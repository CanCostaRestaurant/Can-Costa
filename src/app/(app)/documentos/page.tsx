import { getFacturas, getProductosConHistorico } from "@/lib/db/queries";
import { FacturasClient } from "./facturas-client";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const [facturas, productos] = await Promise.all([getFacturas(), getProductosConHistorico()]);
  return (
    <FacturasClient
      facturas={facturas}
      productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio }))}
    />
  );
}
