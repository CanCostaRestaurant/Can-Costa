import Link from "next/link";
import { Chip, MonthChip, PageHead } from "@/components/ui";
import { COMPRAS_SEMANA, FACTURAS, KPIS, PRODUCTOS } from "@/lib/mock";
import { cn, eur, pct } from "@/lib/utils";

const EMOJI_ALERTA: Record<string, string> = {
  aceite: "🫒",
  aguacate: "🥑",
  merluza: "🐟",
};

export default function InicioPage() {
  const alertas = PRODUCTOS.filter((p) => p.variacion >= 5);
  const ultimas = FACTURAS.filter((f) => f.total !== null).slice(0, 3);
  const maxSemana = Math.max(...COMPRAS_SEMANA.map((s) => s.total));

  return (
    <section className="anim-in">
      <PageHead
        titulo="Hola, Joaquim 👋"
        subtitulo="Miércoles 2 de julio · así van las compras del mes"
        derecha={<MonthChip>Junio 2026</MonthChip>}
      />

      <div className="mb-3.5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <Kpi etiqueta="Compras del mes" valor={eur(KPIS.comprasMes, false)}>
          <span className="font-bold text-bad">{KPIS.comprasVs}</span> vs mayo
        </Kpi>
        <Kpi etiqueta="Food cost" valor={pct(KPIS.foodCost)}>
          objetivo <b>{pct(KPIS.foodCostObjetivo, 0)}</b>
        </Kpi>
        <Kpi etiqueta="Margen medio platos" valor={pct(KPIS.margenMedio)}>
          <span className="font-bold text-good">estable</span> este mes
        </Kpi>
        <Kpi etiqueta="Alertas de precio" valor={String(KPIS.alertas)} valorClase="text-bad">
          productos han subido
        </Kpi>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3.5 max-md:grid-cols-1">
        <div className="card flex flex-col p-5.5">
          <h3 className="font-display text-base font-bold tracking-tight">Compras por semana</h3>
          <div className="flex min-h-[200px] flex-1 gap-5 px-1.5 pt-8">
            {COMPRAS_SEMANA.map((s, i) => (
              <div key={s.semana} className="relative flex flex-1 items-end justify-center">
                <div
                  className={cn(
                    "anim-grow relative w-full max-w-24 rounded-t-[10px]",
                    i === COMPRAS_SEMANA.length - 1 ? "bg-brand" : "bg-[#E9E2D4]",
                  )}
                  style={{ height: `${(s.total / maxSemana) * 100}%`, animationDelay: `${i * 80}ms` }}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-display text-[13px] font-bold whitespace-nowrap">
                    {eur(s.total, false)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-5 border-t border-line px-1.5">
            {COMPRAS_SEMANA.map((s) => (
              <span key={s.semana} className="flex-1 pt-2 text-center text-xs text-ink-soft">
                {s.semana}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="card p-5.5 pb-3">
            <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold tracking-tight">
              Subidas de precio
              <span className="rounded-full bg-bad-soft px-2 py-0.5 font-body text-[11.5px] text-bad">
                {alertas.length}
              </span>
            </h3>
            {alertas.map((p) => (
              <Link
                key={p.id}
                href="/precios"
                className="-mx-2 flex items-center gap-3 rounded-lg border-b border-line px-2 py-2.5 last:border-none hover:bg-hover"
              >
                <div className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-bad-soft text-[15px]">
                  {EMOJI_ALERTA[p.id] ?? "📦"}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-semibold">{p.nombre}</b>
                  <small className="text-xs text-ink-soft">
                    {p.proveedor} · {p.precio}
                  </small>
                </div>
                <span className="font-display text-[15px] font-bold text-bad">+{p.variacion}%</span>
              </Link>
            ))}
          </div>

          <div className="card p-5.5 pb-3">
            <h3 className="mb-2 font-display text-base font-bold tracking-tight">Últimas facturas</h3>
            {ultimas.map((f) => (
              <Link
                key={f.id}
                href="/facturas"
                className="-mx-2 flex items-center gap-3 rounded-lg border-b border-line px-2 py-2.5 text-[13.5px] last:border-none hover:bg-hover"
              >
                <b className="flex-1 font-semibold">{f.proveedor}</b>
                {f.estado === "revisar" ? (
                  <Chip tone="warn" dot>
                    Revisar
                  </Chip>
                ) : (
                  <Chip tone="good" dot>
                    Validada
                  </Chip>
                )}
                <span className="font-display font-semibold">{eur(f.total!)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({
  etiqueta,
  valor,
  valorClase,
  children,
}: {
  etiqueta: string;
  valor: string;
  valorClase?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-1.5 font-display text-[31px] font-bold tracking-tight", valorClase)}>{valor}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">{children}</div>
    </div>
  );
}
