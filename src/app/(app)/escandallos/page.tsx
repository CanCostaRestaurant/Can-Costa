import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { getPlatosResumen } from "@/lib/db/queries";
import { eur, pct } from "@/lib/utils";
import { NuevoPlatoBtn } from "./nuevo-plato-btn";

export const dynamic = "force-dynamic";

const GRADIENTES = [
  "linear-gradient(135deg,#FCEFE7,#F7DECD)",
  "linear-gradient(135deg,#FBE9E4,#F5D5CB)",
  "linear-gradient(135deg,#F3EEDF,#EAE0C4)",
  "linear-gradient(135deg,#EFF2E5,#DEE5C8)",
  "linear-gradient(135deg,#F6EBE0,#EDD9C4)",
  "linear-gradient(135deg,#F2E7EA,#E5CDD4)",
];

function tonoFoodCost(fc: number | null): "good" | "warn" | "bad" | "gray" {
  if (fc === null) return "gray";
  if (fc <= 33) return "good";
  if (fc <= 38) return "warn";
  return "bad";
}

export default async function EscandallosPage() {
  const todos = await getPlatosResumen();
  const platos = todos.filter((p) => !p.esPreparacion);
  const preparaciones = todos.filter((p) => p.esPreparacion);
  const conAviso = todos.filter((p) => p.aviso);

  return (
    <section className="anim-in">
      <PageHead
        titulo="Escandallos"
        subtitulo="El coste de cada plato, siempre al día con tus últimos precios"
        derecha={<NuevoPlatoBtn />}
      />

      {conAviso.length > 0 && (
        <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-[#EED9AC] bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#7A5106]">
          <TriangleAlert className="size-5 shrink-0 text-warn" />
          <div>
            {conAviso.length === 1 ? (
              <>
                Un ingrediente de <b>{conAviso[0].nombre}</b> ha subido de precio — su coste se ha recalculado.
              </>
            ) : (
              <>
                <b>{conAviso.length} platos</b> tienen ingredientes que han subido de precio — sus costes se han
                recalculado.
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
        {platos.map((plato, i) => (
          <Link
            key={plato.id}
            href={`/escandallos/${plato.id}`}
            className="card anim-in overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift)"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div
              className="relative flex h-[92px] items-end px-4 py-3"
              style={plato.fotoUrl ? undefined : { background: GRADIENTES[i % GRADIENTES.length] }}
            >
              {plato.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={plato.fotoUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="text-[34px]">{plato.emoji}</span>
              )}
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
                  <b className="font-display text-[15.5px] font-bold">
                    {plato.pvp !== null ? eur(plato.pvp) : "—"}
                  </b>
                </div>
                <Chip tone={tonoFoodCost(plato.foodCost)} className="ml-auto">
                  {plato.foodCost !== null ? `${pct(plato.foodCost, 0)} food cost` : "sin PVP"}
                </Chip>
              </div>
              {plato.margenObjetivo !== null && plato.margen !== null && (
                <div
                  className={`mt-2 text-[12px] font-semibold ${plato.bajoObjetivo ? "text-bad" : "text-good"}`}
                >
                  margen {pct(plato.margen, 0)} · esperado {pct(plato.margenObjetivo, 0)}
                  {plato.bajoObjetivo ? " ⚠" : " ✓"}
                </div>
              )}
            </div>
          </Link>
        ))}
        {platos.length === 0 && (
          <div className="card col-span-full p-8 text-center text-sm text-ink-soft">
            Aún no hay platos. Crea el primero con "+ Nuevo plato".
          </div>
        )}
      </div>

      {preparaciones.length > 0 && (
        <>
          <h3 className="mt-7 mb-3 font-display text-[17px] font-bold tracking-tight">
            Preparaciones
            <span className="ml-2 font-body text-[12.5px] font-normal text-ink-soft">
              sub-recetas que se usan como ingrediente en tus platos
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
            {preparaciones.map((prep) => (
              <Link
                key={prep.id}
                href={`/escandallos/${prep.id}`}
                className="card flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift)"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-chip text-[22px]">
                  {prep.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-display text-[14.5px] font-bold tracking-tight">
                    {prep.nombre}
                  </b>
                  <small className="text-[12px] text-ink-soft">
                    {eur(prep.coste)}/ración · salen {prep.raciones}
                  </small>
                </span>
                {prep.aviso && <Chip tone="bad">▲</Chip>}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
