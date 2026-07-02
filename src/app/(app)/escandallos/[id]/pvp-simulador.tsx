"use client";

import { useState } from "react";
import { OBJETIVO_FOOD_COST } from "@/lib/mock";
import { eur, pct } from "@/lib/utils";

export function PvpSimulador({
  coste,
  pvpInicial,
  vendidosMes,
}: {
  coste: number;
  pvpInicial: number;
  vendidosMes: number;
}) {
  const [pvp, setPvp] = useState(pvpInicial);

  const fc = pvp > 0 ? (coste / pvp) * 100 : 0;
  const color = fc <= OBJETIVO_FOOD_COST ? "var(--color-good)" : fc <= 38 ? "var(--color-warn)" : "var(--color-bad)";
  const pvpObjetivo = coste / (OBJETIVO_FOOD_COST / 100);

  return (
    <div className="card p-5.5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Precio en carta</div>
      <div className="mt-2 mb-4.5 flex items-baseline gap-1.5">
        <input
          type="number"
          value={pvp}
          step={0.5}
          min={1}
          onChange={(e) => setPvp(parseFloat(e.target.value) || 0)}
          className="w-[120px] border-b-2 border-line bg-transparent font-display text-4xl font-bold tracking-tight outline-none transition-colors focus:border-brand"
        />
        <span className="font-display text-[22px] font-semibold text-ink-soft">€</span>
      </div>

      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Food cost</div>
      <div className="mt-1.5">
        <div className="relative h-3 overflow-visible rounded-full bg-chip">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(fc, 100)}%`, background: color }}
          />
          <div
            className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-ink"
            style={{ left: `${OBJETIVO_FOOD_COST}%` }}
            title={`Objetivo ${OBJETIVO_FOOD_COST}%`}
          />
        </div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <span className="font-display text-[26px] font-bold">{pct(fc)}</span>
          <small className="text-xs text-ink-soft">objetivo ≤ {OBJETIVO_FOOD_COST}%</small>
        </div>
      </div>

      <div className="mt-4.5 flex flex-col gap-2.5 border-t border-line pt-3.5 text-[13.5px]">
        <div className="flex justify-between">
          <span className="text-ink-soft">Margen bruto por plato</span>
          <b className="font-display font-bold">{eur(pvp - coste)}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">PVP para food cost {OBJETIVO_FOOD_COST}%</span>
          <b className="font-display font-bold">{eur(pvpObjetivo)}</b>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Vendidos este mes (TPV)</span>
          <b className="font-display font-bold">{vendidosMes} uds</b>
        </div>
      </div>
    </div>
  );
}
