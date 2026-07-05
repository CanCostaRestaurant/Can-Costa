"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartColumn, LayoutGrid, Lock, Map, Settings2, ShoppingBag, Users } from "lucide-react";
import { PageHead } from "@/components/ui";
import { type MapaMesasTpv, type MesaEstado } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { abrirTicket } from "./actions";

function tiempo(minutos: number): string {
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

// Tamaño de cada mesa en el plano, en cqw (1cqw = 1% del ANCHO del lienzo):
// así la mesa ocupa siempre el mismo % que su posición y escala igual en
// cualquier pantalla. `w`/`h` son ambos % del ancho (el lienzo es 16:9), que
// es justo lo que necesita la detección de solapes del editor. ÚNICA fuente
// del tamaño: la usan el render del TPV, el del editor y el cálculo de choques.
export function dimsMesaPlano(mesa: { capacidad: number; forma: string }): { w: number; h: number } {
  if (mesa.forma === "alargada") {
    const w = mesa.capacidad >= 4 ? 12 : 10.5;
    return { w, h: w / 2 };
  }
  const w = mesa.capacidad <= 2 ? 6.5 : mesa.capacidad <= 4 ? 8 : 9.5;
  return { w, h: w };
}

// Estilo inline con el tamaño (en cqw) para pintar la mesa.
export function estiloMesaPlano(mesa: { capacidad: number; forma: string }): React.CSSProperties {
  const { w, h } = dimsMesaPlano(mesa);
  return { width: `${w}cqw`, height: `${h}cqw` };
}

// Solo el redondeo (el tamaño va por estiloMesaPlano).
export function clasesMesaPlano(mesa: { forma: string }): string {
  return mesa.forma === "redonda" ? "rounded-full" : "rounded-[1.4cqw]";
}

export function MapaClient({ mapa, esTablet = false }: { mapa: MapaMesasTpv; esTablet?: boolean }) {
  const router = useRouter();
  const [abriendo, startAbrir] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const todas = mapa.zonas.flatMap((z) => z.mesas);
  const colocadas = todas.filter((m) => m.posX !== null && m.posY !== null);
  const sinColocar = todas.filter((m) => m.posX === null || m.posY === null);

  const [vista, setVista] = useState<"plano" | "lista">("plano");
  useEffect(() => {
    // En móvil la LISTA es la vista cómoda por defecto (el plano está
    // pensado para la tablet en horizontal); se puede cambiar igualmente.
    const esMovil = window.innerWidth < 768;
    const guardada = window.localStorage.getItem("tpv-vista");
    if (guardada === "lista" || guardada === "plano") setVista(guardada);
    else if (colocadas.length === 0 || esMovil) setVista("lista");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarVista(v: "plano" | "lista") {
    setVista(v);
    window.localStorage.setItem("tpv-vista", v);
  }

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
          <div className="flex flex-wrap gap-2">
            <div className="card flex overflow-hidden rounded-full! p-0.5 text-[13px] font-semibold">
              <button
                onClick={() => cambiarVista("plano")}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                  vista === "plano" ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
                )}
              >
                <Map className="size-3.5" /> Plano
              </button>
              <button
                onClick={() => cambiarVista("lista")}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                  vista === "lista" ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
                )}
              >
                <LayoutGrid className="size-3.5" /> Lista
              </button>
            </div>
            {/* En modo tablet estos accesos ya están en la barra superior;
                además Distribución (editar el plano) no es para camareros. */}
            {!esTablet && (
              <>
                <Link
                  href="/ventas"
                  className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap"
                >
                  <ChartColumn className="size-4 text-ink-soft" /> Ventas
                </Link>
                <Link
                  href="/tpv/mesas"
                  className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap"
                >
                  <Settings2 className="size-4 text-ink-soft" /> Distribución
                </Link>
                <Link
                  href="/caja"
                  className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-black"
                >
                  <Lock className="size-4" /> Cierre de caja
                </Link>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      {vista === "plano" && colocadas.length > 0 ? (
        <>
          <div
            className="card relative mb-4 aspect-[16/9] w-full overflow-hidden [container-type:inline-size] max-md:aspect-[4/3]"
            style={{
              backgroundImage: "radial-gradient(circle, #E8E1D4 1.2px, transparent 1.2px)",
              backgroundSize: "26px 26px",
            }}
          >
            {colocadas.map((mesa) => (
              <button
                key={mesa.id}
                onClick={() => abrir(mesa)}
                disabled={abriendo}
                title={`${mesa.nombre} · ${mesa.capacidad} plazas`}
                style={{ left: `${mesa.posX}%`, top: `${mesa.posY}%`, ...estiloMesaPlano(mesa) }}
                className={cn(
                  "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center overflow-hidden border-2 p-[0.4cqw] text-center leading-tight transition-all hover:scale-105",
                  clasesMesaPlano(mesa),
                  mesa.ticket
                    ? "border-brand bg-brand text-white shadow-(--shadow-lift)"
                    : "border-dashed border-[#C9BFAC] bg-card text-ink hover:border-brand",
                )}
              >
                <b className="font-display text-[clamp(8px,1.3cqw,13px)] font-bold">{mesa.nombre}</b>
                {mesa.ticket ? (
                  <>
                    <span className="font-display text-[clamp(8px,1.3cqw,13px)] font-bold">
                      {eur(mesa.ticket.total)}
                    </span>
                    <span className="text-[clamp(6px,1cqw,10px)] opacity-80">{tiempo(mesa.ticket.minutos)}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-0.5 text-[clamp(7px,1.05cqw,10.5px)] text-ink-soft">
                    <Users className="size-[clamp(7px,1.1cqw,12px)]" /> {mesa.capacidad}
                  </span>
                )}
              </button>
            ))}
          </div>
          {sinColocar.length > 0 && (
            <p className="mb-4 text-[13px] text-ink-soft">
              Sin colocar en el plano: {sinColocar.map((m) => m.nombre).join(", ")} — colócalas en{" "}
              <Link href="/tpv/mesas" className="font-semibold text-brand">
                Distribución
              </Link>
              .
            </p>
          )}
        </>
      ) : (
        mapa.zonas.map((zona) => (
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
        ))
      )}

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
