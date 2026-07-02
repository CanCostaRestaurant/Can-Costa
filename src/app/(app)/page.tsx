import Link from "next/link";
import { ChartColumn, Coins, ReceiptText, TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { getDashboardData, getFacturas } from "@/lib/db/queries";
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

export default async function HomePage() {
  const [d, facturas] = await Promise.all([getDashboardData(), getFacturas()]);
  const bandeja = facturas.filter((f) => f.estado === "revisar");
  const procesando = facturas.filter((f) => f.estado === "procesando").length;

  return (
    <section className="anim-in">
      <PageHead titulo="Hola, Joaquim 👋" subtitulo={`${fechaHoy()} · esto es lo que pide atención hoy`} />

      <div className="mb-3.5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <Acceso
          href="/documentos"
          icono={<ReceiptText className="size-[18px]" />}
          etiqueta="Por revisar"
          valor={String(bandeja.length)}
          valorClase={bandeja.length > 0 ? "text-warn" : "text-good"}
        >
          {procesando > 0 ? `+ ${procesando} procesando` : "facturas en bandeja"}
        </Acceso>
        <Acceso
          href="/incidencias"
          icono={<TriangleAlert className="size-[18px]" />}
          etiqueta="Alertas de precio"
          valor={String(d.alertas.length)}
          valorClase={d.alertas.length > 0 ? "text-bad" : "text-good"}
        >
          {d.alertas.length === 1 ? "producto ha subido" : "productos han subido"}
        </Acceso>
        <Acceso
          href="/dashboard"
          icono={<ChartColumn className="size-[18px]" />}
          etiqueta="Food cost"
          valor={d.foodCost !== null ? pct(d.foodCost) : "—"}
        >
          últimas 4 semanas
        </Acceso>
        <Acceso
          href="/ventas"
          icono={<Coins className="size-[18px]" />}
          etiqueta="Ventas"
          valor={eur(d.semanas.at(-1)?.ventas ?? 0, false)}
        >
          esta semana · apuntar hoy
        </Acceso>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <div className="card p-5.5 pb-3">
          <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold tracking-tight">
            Bandeja de facturas
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-body text-[11.5px]",
                bandeja.length > 0 ? "bg-warn-soft text-warn" : "bg-good-soft text-good",
              )}
            >
              {bandeja.length}
            </span>
          </h3>
          {bandeja.map((f) => (
            <Link
              key={f.id}
              href="/documentos"
              className="-mx-2 flex items-center gap-3 rounded-lg border-b border-line px-2 py-3 last:border-none hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <b className="block text-sm font-semibold">{f.proveedor}</b>
                <small className="text-xs text-ink-soft">
                  {f.detalle} · {f.fecha} · {f.lineas} líneas
                </small>
              </div>
              <Chip tone="warn" dot>
                Revisar
              </Chip>
              <span className="font-display text-[14.5px] font-semibold">
                {f.total !== null ? eur(f.total) : "—"}
              </span>
            </Link>
          ))}
          {bandeja.length === 0 && (
            <p className="pb-2.5 text-[13.5px] text-ink-soft">
              Bandeja limpia ✨ Todas las facturas están validadas.
            </p>
          )}
        </div>

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
          {d.alertas.slice(0, 4).map((p) => (
            <Link
              key={p.id}
              href="/incidencias"
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
            <p className="pb-2.5 text-[13.5px] text-ink-soft">Sin subidas relevantes esta semana.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Acceso({
  href,
  icono,
  etiqueta,
  valor,
  valorClase,
  children,
}: {
  href: string;
  icono: React.ReactNode;
  etiqueta: string;
  valor: string;
  valorClase?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="card p-5 transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift)">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
        {icono}
        {etiqueta}
      </div>
      <div className={cn("mt-1.5 font-display text-[31px] font-bold tracking-tight", valorClase)}>{valor}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">{children}</div>
    </Link>
  );
}
