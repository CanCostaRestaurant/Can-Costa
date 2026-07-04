"use client";

// Factura de venta imprimible (formato A4, no ticket térmico): emisor (el
// local), cliente, líneas y desglose de base + IVA + total. Se puede imprimir
// (o "Guardar como PDF") y anular sin borrar (la numeración no tiene huecos).
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, Mail, Printer, Send, X } from "lucide-react";
import { type FacturaVenta } from "@/lib/db/queries";
import { eur } from "@/lib/utils";
import { anularFactura, enviarFacturaPorCorreo } from "../actions";

export function FacturaView({ factura }: { factura: FacturaVenta }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, start] = useTransition();
  const anulada = factura.estado === "anulada";

  // Envío por correo (modal)
  const [enviando, setEnviando] = useState(false);
  const [email, setEmail] = useState(factura.enviadaA ?? factura.clienteEmail ?? "");
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  function anular() {
    start(async () => {
      await anularFactura(factura.id);
      setConfirmando(false);
      router.refresh();
    });
  }

  function enviar() {
    setErrorEnvio(null);
    start(async () => {
      const res = await enviarFacturaPorCorreo({ id: factura.id, email });
      if (!res.ok) {
        setErrorEnvio(res.error ?? "No se pudo enviar");
        return;
      }
      setEnviada(true);
      router.refresh();
      setTimeout(() => {
        setEnviando(false);
        setEnviada(false);
      }, 1600);
    });
  }

  return (
    <section className="anim-in mx-auto max-w-3xl">
      {/* Barra de acciones (no se imprime) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <button
          onClick={() => router.push("/facturacion")}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Facturación
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {!anulada && (
            <button
              onClick={() => {
                setErrorEnvio(null);
                setEnviando(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[14px] font-bold text-ink transition-colors hover:border-brand hover:text-brand"
            >
              <Mail className="size-4.5" /> Enviar por correo
            </button>
          )}
          {!anulada &&
            (confirmando ? (
              <span className="flex items-center gap-2 rounded-xl bg-bad-soft px-3 py-1.5 text-[13px] font-semibold text-bad">
                ¿Anular?
                <button onClick={anular} disabled={ocupado} className="cursor-pointer rounded-lg bg-bad px-2.5 py-1 font-bold text-white disabled:opacity-40">
                  Sí, anular
                </button>
                <button onClick={() => setConfirmando(false)} className="cursor-pointer rounded-lg px-2 py-1 text-ink-soft hover:text-ink">
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmando(true)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
              >
                <Ban className="size-4" /> Anular
              </button>
            ))}
          <button
            onClick={() => window.print()}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-black"
          >
            <Printer className="size-4.5" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {anulada && (
        <div className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-center text-[14px] font-bold text-bad print:hidden">
          Factura anulada — no computa en la declaración.
        </div>
      )}

      {factura.enviadaA && !anulada && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-good-soft px-4 py-2.5 text-[13px] font-semibold text-good print:hidden">
          <Check className="size-4" /> Enviada a {factura.enviadaA}
          {factura.enviadaEl ? ` · ${factura.enviadaEl}` : ""}
        </div>
      )}

      {/* Modal de envío por correo */}
      {enviando &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-(--shadow-lift)">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight">
                  <Mail className="size-4.5 text-ink-soft" /> Enviar factura {factura.numero}
                </h3>
                <button
                  onClick={() => setEnviando(false)}
                  className="cursor-pointer rounded-lg p-1 text-ink-soft hover:bg-chip hover:text-ink"
                  aria-label="Cerrar"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              {enviada ? (
                <div className="rounded-xl bg-good-soft px-4 py-6 text-center">
                  <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-good text-white">
                    <Check className="size-5" />
                  </div>
                  <b className="font-display text-[16px] font-bold text-good">Enviada a {email}</b>
                </div>
              ) : (
                <>
                  <p className="mb-3.5 text-[12.5px] text-ink-soft">
                    Se manda directamente desde el correo del restaurante, con el PDF de la factura adjunto.
                  </p>

                  {errorEnvio && (
                    <div className="mb-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13px] font-semibold text-bad">
                      {errorEnvio}
                    </div>
                  )}

                  <label className="block text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
                    Correo del cliente
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email.trim() && !ocupado) enviar();
                      }}
                      placeholder="cliente@correo.com"
                      autoFocus
                      className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14px] font-normal tracking-normal outline-none focus:border-brand"
                    />
                  </label>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setEnviando(false)}
                      className="flex-1 cursor-pointer rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold text-ink-soft transition-colors hover:border-[#CFC6B4] hover:text-ink"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={enviar}
                      disabled={ocupado || !email.trim()}
                      className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                    >
                      <Send className="size-4" /> {ocupado ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* La factura en sí — folio A4 */}
      <div className="relative mx-auto max-w-full rounded-xl border border-line bg-white p-8 text-[13px] text-black shadow-sm max-sm:p-5 print:rounded-none print:border-none print:shadow-none">
        {anulada && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rotate-[-18deg] rounded-lg border-4 border-bad/40 px-6 py-2 font-display text-4xl font-extrabold tracking-widest text-bad/30 uppercase">
              Anulada
            </span>
          </div>
        )}

        {/* Cabecera: emisor + datos de la factura */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-display text-[22px] font-bold tracking-tight">{factura.local.nombre}</div>
            {factura.local.cif && <div className="text-ink-soft">CIF {factura.local.cif}</div>}
            {factura.local.direccion && <div className="text-ink-soft">{factura.local.direccion}</div>}
            {factura.local.telefono && <div className="text-ink-soft">Tel {factura.local.telefono}</div>}
          </div>
          <div className="text-right">
            <div className="font-display text-[13px] font-bold tracking-widest text-ink-soft uppercase">Factura</div>
            <div className="font-display text-[20px] font-bold tracking-tight">{factura.numero}</div>
            <div className="mt-1 text-ink-soft">{factura.fechaLegible}</div>
          </div>
        </div>

        <div className="my-6 h-px bg-black/10" />

        {/* Cliente */}
        <div className="mb-6">
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">Facturar a</div>
          <div className="font-display text-[15px] font-bold">{factura.cliente.nombre}</div>
          {factura.cliente.cif && <div className="text-ink-soft">NIF {factura.cliente.cif}</div>}
          {factura.cliente.direccion && <div className="text-ink-soft">{factura.cliente.direccion}</div>}
        </div>

        {/* Líneas */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black/15 text-[11px] tracking-wider text-ink-soft uppercase">
              <th className="py-2 text-left font-semibold">Concepto</th>
              <th className="py-2 text-center font-semibold">Cant.</th>
              <th className="py-2 text-right font-semibold">Precio</th>
              <th className="py-2 text-right font-semibold">Importe</th>
            </tr>
          </thead>
          <tbody>
            {factura.lineas.map((l, i) => (
              <tr key={i} className="border-b border-black/8">
                <td className="py-2 pr-2">{l.descripcion}</td>
                <td className="py-2 text-center text-ink-soft">{l.cantidad}</td>
                <td className="py-2 text-right text-ink-soft">{eur(l.precioUnitario)}</td>
                <td className="py-2 text-right font-semibold">{eur(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-[260px]">
            <div className="flex justify-between py-1 text-ink-soft">
              <span>Base imponible</span>
              <span>{eur(factura.base)}</span>
            </div>
            <div className="flex justify-between py-1 text-ink-soft">
              <span>IVA {factura.ivaPct}%</span>
              <span>{eur(factura.iva)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-black/15 py-2 font-display text-[18px] font-bold">
              <span>TOTAL</span>
              <span>{eur(factura.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-black/10 pt-3 text-[11px] text-ink-soft">
          Factura emitida por {factura.local.nombre}. Conserve este documento como justificante.
        </div>
      </div>
    </section>
  );
}
