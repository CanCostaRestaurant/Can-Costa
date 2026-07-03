import { notFound } from "next/navigation";
import { getClienteDetalle } from "@/lib/db/queries";
import { FichaCliente } from "./ficha-cliente";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalle = await getClienteDetalle(id);
  if (!detalle) notFound();
  return <FichaCliente detalle={detalle} />;
}
