import { PageHead } from "@/components/ui";
import { getProductosConHistorico } from "@/lib/db/queries";
import { PreciosClient } from "./precios-client";

// Lee de la BD en cada petición; sin esto Next congelaría los datos en el build.
export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const productos = await getProductosConHistorico();

  return (
    <section className="anim-in">
      <PageHead
        titulo="Precios de compra"
        subtitulo="Cada producto con su histórico, alimentado por tus facturas"
      />
      <PreciosClient productos={productos} />
    </section>
  );
}
