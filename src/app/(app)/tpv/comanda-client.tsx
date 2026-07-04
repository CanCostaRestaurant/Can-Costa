"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Check, CreditCard, Minus, Plus, Printer, Users, X } from "lucide-react";
import { type PlatoTpv, type TicketDetalle } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import {
  agregarLineaTicket,
  anularTicket,
  cambiarCantidadLinea,
  cambiarComensales,
  cobrarTicket,
} from "./actions";

// Bebidas y extras de un toque (línea libre, sin escandallo).
const EXTRAS_RAPIDOS: { nombre: string; precio: number }[] = [
  { nombre: "Copa de vino", precio: 3.5 },
  { nombre: "Caña", precio: 2.8 },
  { nombre: "Refresco", precio: 2.5 },
  { nombre: "Agua", precio: 2.2 },
  { nombre: "Café", precio: 1.6 },
  { nombre: "Postre del día", precio: 5.5 },
];

export function ComandaClient({ ticket, platos }: { ticket: TicketDetalle; platos: PlatoTpv[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [libreDesc, setLibreDesc] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");
  const [cobrando, setCobrando] = useState(false);

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      if (alTerminar) alTerminar();
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/tpv")}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Mesas
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight">{ticket.mesaNombre}</h1>
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-card px-2 py-1">
          <Users className="size-4 text-ink-soft" />
          <button
            onClick={() => ejecutar(() => cambiarComensales(ticket.id, Math.max(1, (ticket.comensales ?? 1) - 1)))}
            className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-chip"
            aria-label="Menos comensales"
          >
            <Minus className="size-3.5" />
          </button>
          <b className="w-5 text-center font-display text-[15px]">{ticket.comensales ?? "—"}</b>
          <button
            onClick={() => ejecutar(() => cambiarComensales(ticket.id, (ticket.comensales ?? 0) + 1))}
            className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-chip"
            aria-label="Más comensales"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1fr_1.2fr] items-start gap-3.5 max-md:grid-cols-1">
        {/* ── Ticket ── */}
        <div className="card flex flex-col overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Comanda
          </div>
          <div className="min-h-[220px] flex-1">
            {ticket.lineas.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">
                Toca los platos de la derecha para añadirlos
              </p>
            )}
            {ticket.lineas.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border-b border-line px-3 py-2">
                <button
                  onClick={() => ejecutar(() => cambiarCantidadLinea(l.id, ticket.id, -1))}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip"
                  aria-label={`Quitar ${l.descripcion}`}
                >
                  <Minus className="size-4" />
                </button>
                <b className="w-6 shrink-0 text-center font-display text-[15px]">{l.cantidad}</b>
                <button
                  onClick={() => ejecutar(() => cambiarCantidadLinea(l.id, ticket.id, 1))}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip"
                  aria-label={`Añadir ${l.descripcion}`}
                >
                  <Plus className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{l.descripcion}</span>
                <span className="shrink-0 font-display text-[14.5px] font-bold">{eur(l.total)}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-ink px-4 py-3">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold tracking-wider text-ink-soft uppercase">Total</span>
              <b className="font-display text-3xl font-bold tracking-tight">{eur(ticket.total)}</b>
            </div>
            <button
              onClick={() => setCobrando(true)}
              disabled={ocupado || ticket.lineas.length === 0}
              className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-good text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Cobrar {eur(ticket.total)}
            </button>
            <button
              onClick={() => {
                if (!confirmarAnular) {
                  setConfirmarAnular(true);
                  setTimeout(() => setConfirmarAnular(false), 4000);
                  return;
                }
                ejecutar(() => anularTicket(ticket.id), () => router.push("/tpv"));
              }}
              className={cn(
                "mt-2 w-full cursor-pointer rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors",
                confirmarAnular
                  ? "border-bad bg-bad text-white"
                  : "border-line text-ink-soft hover:border-bad hover:text-bad",
              )}
            >
              {confirmarAnular ? "¿Seguro? Anular ticket" : "Anular ticket"}
            </button>
          </div>
        </div>

        {/* ── Carta ── */}
        <div className="flex flex-col gap-3.5">
          <div className="card p-4">
            <h3 className="mb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Platos</h3>
            <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2">
              {platos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => ejecutar(() => agregarLineaTicket(ticket.id, { platoId: p.id }))}
                  disabled={ocupado}
                  className="flex min-h-20 cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand disabled:opacity-60"
                >
                  <span className="text-xl">{p.emoji}</span>
                  <span className="text-[13px] leading-tight font-semibold">{p.nombre}</span>
                  <span className="font-display text-[13px] font-bold text-ink-soft">
                    {p.pvp !== null ? eur(p.pvp) : "sin PVP"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Bebidas y extras
            </h3>
            <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2">
              {EXTRAS_RAPIDOS.map((e) => (
                <button
                  key={e.nombre}
                  onClick={() =>
                    ejecutar(() => agregarLineaTicket(ticket.id, { descripcion: e.nombre, precio: e.precio }))
                  }
                  disabled={ocupado}
                  className="flex min-h-13 cursor-pointer items-center justify-between rounded-xl border border-line bg-card px-3 py-2 transition-all hover:border-brand disabled:opacity-60"
                >
                  <span className="text-[13px] font-semibold">{e.nombre}</span>
                  <span className="font-display text-[13px] font-bold text-ink-soft">{eur(e.precio)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <input
                placeholder="Línea libre…"
                value={libreDesc}
                onChange={(e) => setLibreDesc(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="€"
                value={librePrecio}
                onChange={(e) => setLibrePrecio(e.target.value)}
                className="w-20 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={() =>
                  ejecutar(
                    () =>
                      agregarLineaTicket(ticket.id, {
                        descripcion: libreDesc,
                        precio: parseFloat(librePrecio.replace(",", ".")),
                      }),
                    () => {
                      setLibreDesc("");
                      setLibrePrecio("");
                    },
                  )
                }
                disabled={!libreDesc.trim() || !librePrecio || ocupado}
                className="cursor-pointer rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      </div>

      {cobrando && (
        <PanelCobro
          ticketId={ticket.id}
          total={ticket.total}
          onCerrar={() => setCobrando(false)}
          onListo={() => router.push("/tpv")}
          onTicket={(id) => router.push(`/tpv/recibo/${id}?print=1`)}
        />
      )}
    </section>
  );
}

function PanelCobro({
  ticketId,
  total,
  onCerrar,
  onListo,
  onTicket,
}: {
  ticketId: string;
  total: number;
  onCerrar: () => void;
  onListo: () => void;
  onTicket: (id: string) => void;
}) {
  const [cobrando, startCobro] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [entregadoTxt, setEntregadoTxt] = useState("");
  const [cobrado, setCobrado] = useState<{ id: string; cambio: number | null } | null>(null);

  // Importes sugeridos de efectivo: justos + los billetes que superan el total.
  const sugerencias = useMemo(() => {
    const notas = [5, 10, 20, 50, 100].filter((n) => n > total);
    return [Math.ceil(total * 100) / 100, ...notas].slice(0, 4);
  }, [total]);

  const entregado = parseFloat(entregadoTxt.replace(",", ".")) || 0;
  const cambio = entregado >= total ? entregado - total : null;

  function cobrar(metodo: "efectivo" | "tarjeta") {
    setError(null);
    startCobro(async () => {
      const res = await cobrarTicket(ticketId, metodo, metodo === "efectivo" && entregado > 0 ? entregado : undefined);
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo cobrar");
        return;
      }
      setCobrado({ id: res.id, cambio: metodo === "efectivo" ? cambio : null });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 max-md:p-0 md:items-center"
      onClick={cobrado ? undefined : onCerrar}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl max-md:rounded-b-none"
        onClick={(e) => e.stopPropagation()}
      >
        {cobrado ? (
          // ── Cobrado ✓ ──
          <div className="text-center">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-good-soft text-good">
              <Check className="size-8" />
            </div>
            <div className="font-display text-[22px] font-bold tracking-tight">Cobrado</div>
            {cobrado.cambio !== null && cobrado.cambio > 0 && (
              <div className="mt-2 rounded-xl bg-warn-soft px-4 py-3">
                <div className="text-[12.5px] font-semibold text-[#7A5106]">Cambio a devolver</div>
                <div className="font-display text-[30px] font-bold text-[#7A5106]">{eur(cobrado.cambio)}</div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => onTicket(cobrado.id)}
                className="flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card text-[15px] font-bold transition-colors hover:border-brand"
              >
                <Printer className="size-5" /> Ticket
              </button>
              <button
                onClick={onListo}
                className="flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-bold text-white transition-colors hover:bg-black"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          // ── Cobro ──
          <>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-wider text-ink-soft uppercase">A cobrar</span>
              <button
                onClick={onCerrar}
                className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-chip hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mb-4 text-center font-display text-[40px] font-bold tracking-tight">{eur(total)}</div>

            {error && (
              <div className="mb-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{error}</div>
            )}

            {/* Efectivo con cambio */}
            <div className="mb-3 rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                <Banknote className="size-4 text-good" /> Efectivo
              </div>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => setEntregadoTxt(String(s))}
                    className={cn(
                      "cursor-pointer rounded-lg border py-2 text-[13px] font-semibold transition-colors",
                      entregado === s ? "border-good bg-good-soft text-good" : "border-line hover:border-good",
                    )}
                  >
                    {s === sugerencias[0] ? "Justos" : eur(s, false)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  inputMode="decimal"
                  placeholder="otro importe…"
                  value={entregadoTxt}
                  onChange={(e) => setEntregadoTxt(e.target.value)}
                  className="w-28 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                {cambio !== null && cambio > 0 && (
                  <span className="ml-auto text-[13px]">
                    Cambio <b className="font-display text-[16px]">{eur(cambio)}</b>
                  </span>
                )}
              </div>
              <button
                onClick={() => cobrar("efectivo")}
                disabled={cobrando}
                className="mt-2.5 flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-good text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Banknote className="size-5" /> Cobrar en efectivo
              </button>
            </div>

            {/* Tarjeta */}
            <button
              onClick={() => cobrar("tarjeta")}
              disabled={cobrando}
              className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              <CreditCard className="size-5" /> Cobrar con tarjeta
            </button>
            <p className="mt-2 text-center text-[11.5px] text-ink-soft">
              Con tarjeta: pasa el importe por el datáfono y confirma aquí.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
