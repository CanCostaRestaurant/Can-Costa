import { redirect } from "next/navigation";
import { getRecibo } from "@/lib/db/queries";
import { ReciboView } from "./recibo-view";

export const dynamic = "force-dynamic";

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const recibo = await getRecibo(id);
  if (!recibo) redirect("/tpv");
  return <ReciboView recibo={recibo} autoimprimir={print === "1"} />;
}
