"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Segmentado } from "@/components/segmentado";
import { type CategoriaDesglose } from "@/lib/db/queries";
import { cn, eur, pct } from "@/lib/utils";

type Trozo = { nombre: string; importe: number; pct: number };

const COLORES = ["#E8532F", "#F2B84B", "#7BA7BC", "#9CBE8C", "#B6A6C9", "#C9C4B8", "#D98E73", "#8FA98F"];

export function DesgloseTabs({
  etiquetaMes,
  etiquetaCorta,
  gastos,
  ventas,
  margen,
  margenPct,
  foodCostPct,
  categorias,
  listaVentas,
  conIva,
}: {
  etiquetaMes: string;
  etiquetaCorta: string;
  gastos: number;
  ventas: number;
  margen: number;
  margenPct: number | null;
  foodCostPct: number | null;
  categorias: CategoriaDesglose[];
  listaVentas: Trozo[];
  conIva: boolean;
}) {
  const [tab, setTab] = useState<"resultados" | "gastos" | "ventas">("resultados");
  const [drill, setDrill] = useState<string | null>(null); // categoría abierta
  const abierta = categorias.find((c) => c.categoria === drill) ?? null;

  return (
    <div className="card p-5.5 transition-shadow duration-300 hover:shadow-lift">
      <h3 className="font-display text-base font-bold tracking-tight">
        Desglose <span className="capitalize">{etiquetaMes}</span>
      </h3>

      <div className="mt-3.5 mb-5">
        <Segmentado
          tono="claro"
          className="w-full"
          opciones={(["resultados", "gastos", "ventas"] as const).map((t) => ({
            etiqueta: <span className="capitalize">{t}</span>,
            onClick: () => setTab(t),
            activo: tab === t,
          }))}
        />
      </div>

      <div key={tab} className="anim-in">
      {tab === "resultados" && (
        <div>
          <div className="text-center text-[14.5px] font-semibold">
            Margen:{" "}
            <b className={cn("font-display text-[17px]", margen >= 0 ? "text-good" : "text-bad")}>
              {eur(margen)}
            </b>
            {margenPct !== null && (
              <span className={cn("ml-1.5 text-[13px]", margen >= 0 ? "text-good" : "text-bad")}>
                ({pct(margenPct, 2)})
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 divide-x divide-line rounded-xl border border-line">
            <div className="px-4 py-3.5 text-center">
              <div className="text-[12px] font-semibold text-ink-soft">Gastos</div>
              <div className="mt-1 font-display text-[16px] font-bold">{eur(gastos)}</div>
            </div>
            <div className="px-4 py-3.5 text-center">
              <div className="text-[12px] font-semibold text-ink-soft">Ventas</div>
              <div className="mt-1 font-display text-[16px] font-bold">{eur(ventas)}</div>
            </div>
          </div>
          {foodCostPct !== null && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-chip px-4 py-3 text-[13px]">
              <span className="font-semibold text-ink-soft">Food cost del mes</span>
              <b
                className={cn(
                  "font-display text-[15px]",
                  foodCostPct <= 33 ? "text-good" : foodCostPct <= 38 ? "text-warn" : "text-bad",
                )}
              >
                {pct(foodCostPct)}
              </b>
            </div>
          )}
        </div>
      )}

      {tab === "gastos" &&
        (abierta ? (
          <div className="anim-in">
            <button
              onClick={() => setDrill(null)}
              className="mb-2 flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink active:scale-[0.98]"
            >
              <ArrowLeft className="size-3.5" /> todas las categorías
            </button>
            <div className="flex items-baseline justify-between">
              <div className="text-[14.5px] font-bold">{abierta.etiqueta}</div>
              <div className="font-display text-[15px] font-bold">
                {eur(abierta.importe)}{" "}
                <span className="text-[12px] font-normal text-ink-soft">({pct(abierta.pct)} del gasto)</span>
              </div>
            </div>
            <div className="mt-3 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Por proveedor
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {abierta.proveedores.map((t, i) => (
                <div key={t.nombre} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: COLORES[i % COLORES.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.nombre}</span>
                  <span className="text-ink-soft">{pct(t.pct)}</span>
                  <span className="w-20 text-right font-display font-bold">{eur(t.importe, false)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Documentos que influyen
            </div>
            <div className="mt-1.5 flex flex-col">
              {abierta.documentos.map((d) => (
                <Link
                  key={d.id}
                  href="/documentos"
                  className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12.5px] transition-colors hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.proveedor}</span>
                  <span className="text-ink-soft capitalize">{d.tipo === "albaran" ? "albarán" : d.tipo}</span>
                  <span className="text-ink-soft">{d.fecha}</span>
                  <span className="w-18 text-right font-display font-bold">{eur(d.total, false)}</span>
                  <ExternalLink className="size-3 text-ink-soft/60" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <Desglose
            titulo="Desglose por categorías"
            nota="haz clic en una categoría para ver proveedores y documentos"
            etiquetaCorta={etiquetaCorta}
            total={gastos}
            conIva={conIva}
            trozos={categorias.map((c) => ({ nombre: c.etiqueta, importe: c.importe, pct: c.pct }))}
            vacio="Sin gastos este mes."
            onClickTrozo={(nombre) => {
              const cat = categorias.find((c) => c.etiqueta === nombre);
              if (cat) setDrill(cat.categoria);
            }}
          />
        ))}

      {tab === "ventas" && (
        <Desglose
          titulo="Desglose por método de cobro"
          etiquetaCorta={etiquetaCorta}
          total={ventas}
          conIva={conIva}
          trozos={listaVentas}
          vacio="Sin ventas este mes."
        />
      )}
      </div>
    </div>
  );
}

function Desglose({
  titulo,
  nota,
  etiquetaCorta,
  total,
  conIva,
  trozos,
  vacio,
  onClickTrozo,
}: {
  titulo: string;
  nota?: string;
  etiquetaCorta: string;
  total: number;
  conIva: boolean;
  trozos: Trozo[];
  vacio: string;
  onClickTrozo?: (nombre: string) => void;
}) {
  if (total <= 0 || trozos.length === 0) {
    return <p className="py-8 text-center text-[13.5px] text-ink-soft">{vacio}</p>;
  }
  return (
    <div>
      <div className="text-[13.5px] font-bold">{titulo}</div>
      <div className="text-[12px] text-ink-soft capitalize">{etiquetaCorta}</div>
      {nota && <div className="mt-0.5 text-[11.5px] text-ink-soft">{nota}</div>}

      <div className="anim-in relative mx-auto my-5 size-44">
        <Donut trozos={trozos} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[11px] text-ink-soft">{etiquetaCorta}</div>
            <div className="font-display text-[16px] font-bold">{eur(total)}</div>
            <div className="text-[10.5px] text-ink-soft">{conIva ? "con IVA" : "sin IVA"}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {trozos.map((t, i) => (
          <div
            key={t.nombre}
            onClick={onClickTrozo ? () => onClickTrozo(t.nombre) : undefined}
            className={cn(
              "anim-in flex items-center gap-2 text-[12.5px]",
              onClickTrozo &&
                "-mx-1.5 cursor-pointer rounded-lg px-1.5 py-1 transition-all hover:translate-x-0.5 hover:bg-hover active:scale-[0.99]",
            )}
            style={{ animationDelay: `${140 + i * 60}ms` }}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: COLORES[i % COLORES.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold">{t.nombre}</span>
            <span className="text-ink-soft">{pct(t.pct)}</span>
            <span className="w-20 text-right font-display font-bold">{eur(t.importe, false)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({ trozos }: { trozos: Trozo[] }) {
  // Offset acumulado de cada arco, sin mutar variables durante el render.
  const inicios = trozos.map((_, i) => trozos.slice(0, i).reduce((a, t) => a + t.pct, 0));
  return (
    <svg viewBox="0 0 42 42" className="size-full -rotate-90">
      {trozos.map((t, i) => (
        <circle
          key={t.nombre}
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          stroke={COLORES[i % COLORES.length]}
          strokeWidth="6.5"
          strokeDasharray={`${Math.max(t.pct - 0.6, 0.1)} ${100 - Math.max(t.pct - 0.6, 0.1)}`}
          strokeDashoffset={-inicios[i] - 0.3}
          className="anim-fade [transition:stroke-dasharray_0.5s_ease]"
          style={{ animationDelay: `${120 + i * 90}ms` }}
        />
      ))}
    </svg>
  );
}
