import Link from "next/link";
import { Chip, MonthChip, PageHead } from "@/components/ui";
import { getDashboardData } from "@/lib/db/queries";
import { type Producto } from "@/lib/mock";
import { cn, eur, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMOJI_FAMILIA: Record<Producto["familia"], string> = {
  pescado: "🐟",
  carne: "🥩",
  "fruta-verdura": "🥑",
  seco: "🫒",
  bebida: "🥤",
  otros: "📦",
};

function fechaHoy(): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function InicioPage() {
  const d = await getDashboardData();
  const maxBarra = Math.max(...d.semanas.map((s) => Math.max(s.ventas, s.compras)), 1);

  return (
    <section className="anim-in">
      <PageHead
        titulo="Hola, Joaquim 👋"
        subtitulo={`${fechaHoy()} · así van compras y ventas`}
        derecha={<MonthChip>Últimas 4 semanas</MonthChip>}
      />

      <div className="mb-3.5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <Kpi etiqueta="Compras" valor={eur(d.comprasPeriodo, false)}>
          facturas y albaranes
        </Kpi>
        <Kpi etiqueta="Food cost" valor={d.foodCost !== null ? pct(d.foodCost) : "—"}>
          objetivo <b>30%</b>
        </Kpi>
        <Kpi etiqueta="Margen bruto" valor={d.margenBruto !== null ? pct(d.margenBruto) : "—"}>
          sobre lo vendido
        </Kpi>
        <Kpi
          etiqueta="Alertas de precio"
          valor={String(d.alertas.length)}
          valorClase={d.alertas.length > 0 ? "text-bad" : "text-good"}
        >
          {d.alertas.length === 1 ? "producto ha subido" : "productos han subido"}
        </Kpi>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3.5 max-md:grid-cols-1">
        <div className="card flex flex-col p-5.5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold tracking-tight">Compras y ventas por semana</h3>
            <div className="flex items-center gap-4 text-xs font-semibold text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[#C9DCC0]" /> Ventas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-brand" /> Compras
              </span>
            </div>
          </div>
          <div className="flex min-h-[200px] flex-1 gap-5 px-1.5 pt-8">
            {d.semanas.map((s) => (
              <div key={s.etiqueta} className="flex flex-1 items-end justify-center gap-1.5">
                <Barra valor={s.ventas} max={maxBarra} clase="bg-[#C9DCC0]" />
                <Barra valor={s.compras} max={maxBarra} clase="bg-brand" />
              </div>
            ))}
          </div>
          <div className="flex gap-5 border-t border-line px-1.5">
            {d.semanas.map((s) => (
              <span key={s.etiqueta} className="flex-1 pt-2 text-center text-xs text-ink-soft">
                {s.etiqueta}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="card p-5.5 pb-3">
            <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold tracking-tight">
              Subidas de precio
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-body text-[11.5px]",
                  d.alertas.length > 0 ? "bg-bad-soft text-bad" : "bg-good-soft text-good",
                )}
              >
                {d.alertas.length}
              </span>
            </h3>
            {d.alertas.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href="/precios"
                className="-mx-2 flex items-center gap-3 rounded-lg border-b border-line px-2 py-2.5 last:border-none hover:bg-hover"
              >
                <div className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-bad-soft text-[15px]">
                  {EMOJI_FAMILIA[p.familia]}
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
            {d.alertas.length === 0 && (
              <p className="pb-2.5 text-[13.5px] text-ink-soft">
                Sin subidas relevantes esta semana. Se avisará aquí cuando un producto suba un 5% o más.
              </p>
            )}
          </div>

          <div className="card p-5.5 pb-3">
            <h3 className="mb-2 font-display text-base font-bold tracking-tight">Últimas facturas</h3>
            {d.ultimas.map((f) => (
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
                <span className="font-display font-semibold">{eur(f.total)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Barra({ valor, max, clase }: { valor: number; max: number; clase: string }) {
  return (
    <div
      className={cn("anim-grow relative w-full max-w-14 rounded-t-lg", clase)}
      style={{ height: `${Math.max((valor / max) * 100, 1)}%` }}
    >
      <span className="absolute -top-5.5 left-1/2 -translate-x-1/2 font-display text-[11.5px] font-bold whitespace-nowrap">
        {valor > 0 ? eur(valor, false) : ""}
      </span>
    </div>
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
