"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartColumn, Settings2, ShoppingBag, Users } from "lucide-react";
import { PageHead } from "@/components/ui";
import { type MapaMesasTpv, type MesaEstado } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { abrirTicket } from "./actions";

function tiempo(minutos: number): string {
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

export function MapaClient({ mapa }: { mapa: MapaMesasTpv }) {
  const router = useRouter();
  const [abriendo, startAbrir] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function abrir(mesa: MesaEstado | null) {
    setError(null);
    if (mesa?.ticket) {
      router.push(`/tpv?ticket=${mesa.ticket.id}`);
      return;
    }
    startAbrir(async () => {
      const res = await abrirTicket(mesa?.id ?? null);
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo abrir el ticket");
        return;
      }
      router.push(`/tpv?ticket=${res.id}`);
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="TPV · Sala"
        subtitulo="Toca una mesa para abrir su comanda"
        derecha={
          <div className="flex gap-2">
            <Link
              href="/ventas"
              className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold"
            >
              <ChartColumn className="size-4 text-ink-soft" /> Ventas del día
            </Link>
            <Link
              href="/tpv/mesas"
              className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold"
            >
              <Settings2 className="size-4 text-ink-soft" /> Distribución
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      {mapa.zonas.map((zona) => (
        <div key={zona.zona} className="mb-6">
          <h3 className="mb-2.5 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            {zona.titulo}
          </h3>
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
            {zona.mesas.map((mesa) => (
              <button
                key={mesa.id}
                onClick={() => abrir(mesa)}
                disabled={abriendo}
                className={cn(
                  "flex min-h-28 cursor-pointer flex-col justify-between rounded-card border-2 p-4 text-left transition-all",
                  mesa.ticket
                    ? "border-brand bg-brand-soft hover:-translate-y-0.5"
                    : "border-dashed border-[#D8CFBE] bg-card hover:border-brand",
                )}
              >
                <div className="flex w-full items-start justify-between">
                  <b className="font-display text-lg font-bold tracking-tight">{mesa.nombre}</b>
                  <span className="flex items-center gap-1 text-xs text-ink-soft">
                    <Users className="size-3.5" />
                    {mesa.ticket?.comensales ?? mesa.capacidad}
                  </span>
                </div>
                {mesa.ticket ? (
                  <div className="flex w-full items-end justify-between">
                    <span className="font-display text-xl font-bold text-brand">{eur(mesa.ticket.total)}</span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                      {tiempo(mesa.ticket.minutos)}
                    </span>
                  </div>
                ) : (
                  <span className="text-[13px] text-ink-soft">libre</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mb-6">
        <h3 className="mb-2.5 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Para llevar
        </h3>
        <div className="flex flex-wrap gap-3">
          {mapa.paraLlevar.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/tpv?ticket=${t.id}`)}
              className="flex min-h-16 cursor-pointer items-center gap-3 rounded-card border-2 border-brand bg-brand-soft px-4 py-3 transition-all hover:-translate-y-0.5"
            >
              <ShoppingBag className="size-5 text-brand" />
              <span className="font-display text-lg font-bold">{eur(t.total)}</span>
              <span className="text-[11px] font-semibold text-ink-soft">{tiempo(t.minutos)}</span>
            </button>
          ))}
          <button
            onClick={() => abrir(null)}
            disabled={abriendo}
            className="flex min-h-16 cursor-pointer items-center gap-2 rounded-card border-2 border-dashed border-[#D8CFBE] bg-card px-5 py-3 text-[14px] font-semibold text-ink-soft transition-colors hover:border-brand"
          >
            <ShoppingBag className="size-5" /> + Nuevo para llevar
          </button>
        </div>
      </div>
    </section>
  );
}
