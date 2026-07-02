import { PageHead } from "@/components/ui";
import { getVentas } from "@/lib/db/queries";
import { VentasClient } from "./ventas-client";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const ventas = await getVentas();
  return (
    <section className="anim-in">
      <PageHead
        titulo="Ventas"
        subtitulo="La facturación de sala, día a día · pronto se importará sola del TPV"
      />
      <VentasClient ventas={ventas} />
    </section>
  );
}
