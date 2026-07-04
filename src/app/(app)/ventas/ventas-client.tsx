"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Printer, Tablet, Users } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { type DesgloseDia, type VentaDia } from "@/lib/db/queries";
import { cn, eur, pct } from "@/lib/utils";
import { guardarVentaDia } from "./actions";

export function VentasClient({
  desglose,
  historico,
  hoy,
}: {
  desglose: DesgloseDia;
  historico: VentaDia[];
  hoy: string;
}) {
  const router = useRouter();
  const [guardando, startGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importe, setImporte] = useState("");

  const d = desglose;
  const hayTickets = d.numTickets > 0;

  function cambiarDia(dia: string) {
    router.push(dia === hoy ? "/ventas" : `/ventas?dia=${dia}`);
  }

  function guardarManual() {
    setError(null);
    const total = parseFloat(importe.replace(",", "."));
    startGuardar(async () => {
      const res = await guardarVentaDia(d.fecha, total);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      setImporte("");
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Ventas"
        subtitulo="El desglose exacto de cada día: tickets, mesas, platos y márgenes"
        derecha={
          <div className="flex items-center gap-2">
            <Link
              href="/tpv"
              className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold"
            >
              <Tablet className="size-4 text-ink-soft" /> Abrir TPV
            </Link>
            <DatePicker
              value={d.fecha}
              max={hoy}
              align="right"
              onChange={(v) => v && cambiarDia(v)}
            />
          </div>
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <Kpi etiqueta="Total del día" valor={eur(hayTickets ? d.totalDia : (d.ventaManual ?? 0))}>
          {hayTickets ? `${d.numTickets} tickets` : d.ventaManual !== null ? "apuntado a mano" : "sin ventas"}
        </Kpi>
        <Kpi etiqueta="Ticket medio" valor={d.ticketMedio !== null ? eur(d.ticketMedio) : "—"}>
          {d.comensales > 0 ? `${d.comensales} comensales` : "por ticket"}
        </Kpi>
        <Kpi etiqueta="Efectivo" valor={hayTickets ? eur(d.efectivo) : "—"}>
          {hayTickets && d.totalDia > 0 ? pct((d.efectivo / d.totalDia) * 100, 0) + " del total" : "—"}
        </Kpi>
        <Kpi etiqueta="Tarjeta" valor={hayTickets ? eur(d.tarjeta) : "—"}>
          {hayTickets && d.totalDia > 0 ? pct((d.tarjeta / d.totalDia) * 100, 0) + " del total" : "—"}
        </Kpi>
      </div>

      {hayTickets ? (
        <div className="mb-3.5 grid grid-cols-[1.2fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
          {/* Ranking de platos con margen */}
          <div className="card p-5.5 pb-3">
            <h3 className="mb-2 font-display text-base font-bold tracking-tight">Qué se ha vendido</h3>
            {d.platos.map((p) => (
              <div key={p.nombre} className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
                <span className="text-lg">{p.emoji ?? "🍽️"}</span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-semibold">{p.nombre}</b>
                  <small className="text-xs text-ink-soft">
                    {p.unidades} {p.unidades === 1 ? "unidad" : "unidades"}
                  </small>
                </div>
                {p.margen !== null && (
                  <span className="text-xs font-semibold text-good">+{eur(p.margen)} margen</span>
                )}
                <b className="w-20 text-right font-display text-[15px] font-bold">{eur(p.importe)}</b>
              </div>
            ))}
            {d.extras.length > 0 && (
              <>
                <div className="mt-2 border-t border-line pt-2 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
                  Bebidas y extras
                </div>
                {d.extras.map((e) => (
                  <div key={e.descripcion} className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-none">
                    <span className="min-w-0 flex-1 font-semibold">{e.descripcion}</span>
                    <small className="text-xs text-ink-soft">×{e.unidades}</small>
                    <b className="w-20 text-right font-display font-bold">{eur(e.importe)}</b>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Tickets del día */}
          <div className="card overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Hora</Th>
                  <Th>Mesa</Th>
                  <Th>
                    <Users className="inline size-3.5" />
                  </Th>
                  <Th>Pago</Th>
                  <Th>Total</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {d.tickets.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-none">
                    <td className="px-3 py-2.5 text-sm text-ink-soft">{t.hora}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold">{t.mesa}</td>
                    <td className="px-3 py-2.5 text-sm">{t.comensales ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {t.metodo === "efectivo" ? (
                        <Banknote className="size-4 text-good" aria-label="Efectivo" />
                      ) : (
                        <CreditCard className="size-4 text-ink-soft" aria-label="Tarjeta" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-display text-sm font-bold">{eur(t.total)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <Link
                        href={`/tpv/recibo/${t.id}`}
                        title="Ver / reimprimir ticket"
                        className="inline-grid size-8 cursor-pointer place-items-center rounded-lg text-ink-soft transition-colors hover:bg-chip hover:text-ink"
                      >
                        <Printer className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card mb-3.5 flex flex-wrap items-end justify-between gap-4 p-5.5">
          <div>
            <h3 className="font-display text-base font-bold tracking-tight">Sin tickets este día</h3>
            <p className="mt-1 max-w-md text-[13.5px] text-ink-soft">
              {d.ventaManual !== null
                ? "Hay un total apuntado a mano. Cuando el TPV esté en marcha, el desglose saldrá solo."
                : "Puedes apuntar el total a mano o cobrar por el TPV para tener desglose completo."}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Total del día
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={d.ventaManual !== null ? String(d.ventaManual) : "1.250"}
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="mt-1.5 block w-36 rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
              />
            </label>
            <button
              onClick={guardarManual}
              disabled={guardando || !importe.trim()}
              className="cursor-pointer rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Histórico de ventas */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Histórico · últimos 35 días
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {historico.map((v) => (
              <tr
                key={v.id}
                onClick={() => cambiarDia(v.fecha)}
                className={cn(
                  "cursor-pointer border-b border-line transition-colors last:border-none hover:bg-hover",
                  v.fecha === d.fecha && "bg-hover",
                )}
              >
                <td className="px-4 py-2.5 text-sm font-semibold capitalize">{v.diaSemana}</td>
                <td className="px-4 py-2.5 text-sm text-ink-soft">{v.fechaLegible}</td>
                <td className="px-4 py-2.5">
                  <Chip tone={v.origen === "tpv" ? "good" : "gray"}>
                    {v.origen === "tpv" ? "TPV" : v.origen === "seed" ? "demo" : "manual"}
                  </Chip>
                </td>
                <td className="px-4 py-2.5 text-right font-display text-[14.5px] font-semibold">{eur(v.total)}</td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-ink-soft">Aún no hay ventas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ etiqueta, valor, children }: { etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className="mt-1.5 font-display text-[28px] font-bold tracking-tight">{valor}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">{children}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
