import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { PageHead } from "@/components/ui";
import { PLATOS } from "@/lib/mock";
import { cn, eur } from "@/lib/utils";
import { PvpSimulador } from "./pvp-simulador";

export function generateStaticParams() {
  return PLATOS.map((p) => ({ id: p.id }));
}

export default async function EscandalloDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plato = PLATOS.find((p) => p.id === id);
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

      <PageHead
        titulo={`${plato.emoji} ${plato.nombre}`}
        subtitulo="El coste se actualiza solo con cada factura que subes"
      />

      {plato.aviso && (
        <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-[#EED9AC] bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#7A5106]">
          <TriangleAlert className="size-5 shrink-0 text-warn" />
          <div>
            La <b>merluza fresca</b> subió un 8% en la factura de hoy de Peixos Blanch. Este plato costaba{" "}
            <b>6,47 €</b> y ahora cuesta <b>{eur(plato.coste)}</b>.
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Ingrediente</Th>
                <Th>Cantidad</Th>
                <Th>Precio</Th>
                <Th>Coste</Th>
              </tr>
            </thead>
            <tbody>
              {plato.ingredientes.map((ing) => (
                <tr key={ing.nombre} className={cn("border-b border-line", ing.subida && "bg-warn-soft")}>
                  <td className="px-3.5 py-3 text-sm font-semibold">{ing.nombre}</td>
                  <td className="px-3.5 py-3 text-sm">{ing.cantidad}</td>
                  <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold">{ing.precio}</td>
                  <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold">{eur(ing.coste)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-3.5 py-3 font-display text-sm font-bold">
                  Coste total del plato
                </td>
                <td className="px-3.5 py-3 font-display text-[17px] font-bold">{eur(plato.coste)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <PvpSimulador coste={plato.coste} pvpInicial={plato.pvp} vendidosMes={plato.vendidosMes} />
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
