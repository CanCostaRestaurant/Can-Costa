import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPlatoDetalle, getProductosConHistorico } from "@/lib/db/queries";
import { EscandalloEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function EscandalloDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plato, productos] = await Promise.all([getPlatoDetalle(id), getProductosConHistorico()]);
  if (!plato) notFound();

  return (
    <section className="anim-in">
      <Link
        href="/escandallos"
        className="mb-3.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
      >
        <ArrowLeft className="size-[15px]" />
        Todos los platos
      </Link>

      <EscandalloEditor
        plato={plato}
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: p.precio,
          unidad: p.precio.split("/")[1] ?? "ud",
        }))}
      />
    </section>
  );
}
