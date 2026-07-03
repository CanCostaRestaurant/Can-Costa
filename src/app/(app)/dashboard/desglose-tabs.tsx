"use client";

import { useState } from "react";
import { cn, eur, pct } from "@/lib/utils";

type Trozo = { nombre: string; importe: number; pct: number };

const COLORES = ["#E8532F", "#F2B84B", "#7BA7BC", "#9CBE8C", "#B6A6C9", "#C9C4B8"];

export function DesgloseTabs({
  etiquetaMes,
  etiquetaCorta,
  gastos,
  ventas,
  margen,
  margenPct,
  foodCostPct,
  listaGastos,
  listaVentas,
}: {
  etiquetaMes: string;
  etiquetaCorta: string;
  gastos: number;
  ventas: number;
  margen: number;
  margenPct: number | null;
  foodCostPct: number | null;
  listaGastos: Trozo[];
  listaVentas: Trozo[];
}) {
  const [tab, setTab] = useState<"resultados" | "gastos" | "ventas">("resultados");

  return (
    <div className="card p-5.5">
      <h3 className="font-display text-base font-bold tracking-tight">
        Desglose <span className="capitalize">{etiquetaMes}</span>
      </h3>

      <div className="mt-3.5 mb-5 flex rounded-xl bg-chip p-1">
        {(["resultados", "gastos", "ventas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors",
              tab === t ? "bg-card shadow-sm" : "text-ink-soft hover:text-ink",
            )}
          >
            {t}
          </button>
        ))}
      </div>

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

      {tab === "gastos" && (
        <Desglose
          titulo="Desglose por proveedor"
          etiquetaCorta={etiquetaCorta}
          total={gastos}
          trozos={listaGastos}
          vacio="Sin gastos este mes."
        />
      )}

      {tab === "ventas" && (
        <Desglose
          titulo="Desglose por método de cobro"
          etiquetaCorta={etiquetaCorta}
          total={ventas}
          trozos={listaVentas}
          vacio="Sin ventas este mes."
        />
      )}
    </div>
  );
}

function Desglose({
  titulo,
  etiquetaCorta,
  total,
  trozos,
  vacio,
}: {
  titulo: string;
  etiquetaCorta: string;
  total: number;
  trozos: Trozo[];
  vacio: string;
}) {
  if (total <= 0 || trozos.length === 0) {
    return <p className="py-8 text-center text-[13.5px] text-ink-soft">{vacio}</p>;
  }
  return (
    <div>
      <div className="text-[13.5px] font-bold">{titulo}</div>
      <div className="text-[12px] text-ink-soft capitalize">{etiquetaCorta}</div>

      <div className="relative mx-auto my-5 size-44">
        <Donut trozos={trozos} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[11px] text-ink-soft">{etiquetaCorta}</div>
            <div className="font-display text-[16px] font-bold">{eur(total)}</div>
            <div className="text-[10.5px] text-ink-soft">con IVA</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {trozos.map((t, i) => (
          <div key={t.nombre} className="flex items-center gap-2 text-[12.5px]">
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
  let acumulado = 0;
  return (
    <svg viewBox="0 0 42 42" className="size-full -rotate-90">
      {trozos.map((t, i) => {
        const inicio = acumulado;
        acumulado += t.pct;
        return (
          <circle
            key={t.nombre}
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke={COLORES[i % COLORES.length]}
            strokeWidth="6.5"
            strokeDasharray={`${Math.max(t.pct - 0.6, 0.1)} ${100 - Math.max(t.pct - 0.6, 0.1)}`}
            strokeDashoffset={-inicio - 0.3}
          />
        );
      })}
    </svg>
  );
}
