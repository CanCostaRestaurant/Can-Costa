import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { PLATOS, foodCost, nivelFoodCost } from "@/lib/mock";
import { eur, pct } from "@/lib/utils";

export default function EscandallosPage() {
  return (
    <section className="anim-in">
      <PageHead
        titulo="Escandallos"
        subtitulo="El coste de cada plato, siempre al día con tus últimos precios"
        derecha={
          <button className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black">
            + Nuevo plato
          </button>
        }
      />

      <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-[#EED9AC] bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#7A5106]">
        <TriangleAlert className="size-5 shrink-0 text-warn" />
        <div>
          La <b>merluza</b> ha subido un 8% — el plato <b>Merluza a la brasa</b> ha pasado de 36,8% a <b>38,9%</b>{" "}
          de food cost.
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
        {PLATOS.map((plato, i) => {
          const fc = foodCost(plato);
          const nivel = nivelFoodCost(fc);
          return (
            <Link
              key={plato.id}
              href={`/escandallos/${plato.id}`}
              className="card anim-in overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift)"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div
                className="relative flex h-[92px] items-end px-4 py-3"
                style={{ background: plato.gradiente }}
              >
                <span className="text-[34px]">{plato.emoji}</span>
                {plato.aviso && (
                  <Chip tone="bad" className="absolute top-2.5 right-2.5">
                    {plato.aviso}
                  </Chip>
                )}
              </div>
              <div className="px-4 pt-3.5 pb-4">
                <h4 className="font-display text-base font-bold tracking-tight">{plato.nombre}</h4>
                <div className="mt-2.5 flex items-end gap-4">
                  <div>
                    <small className="block text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Coste
                    </small>
                    <b className="font-display text-[15.5px] font-bold">{eur(plato.coste)}</b>
                  </div>
                  <div>
                    <small className="block text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      PVP
                    </small>
                    <b className="font-display text-[15.5px] font-bold">{eur(plato.pvp)}</b>
                  </div>
                  <Chip tone={nivel} className="ml-auto">
                    {pct(fc, 0)} food cost
                  </Chip>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
