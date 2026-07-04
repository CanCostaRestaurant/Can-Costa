"use client";

// Botón "Generar factura" del recibo: abre un modal para confirmar/completar
// los datos fiscales del cliente y emite la factura (numeración correlativa).
// Al emitir, lleva a la factura imprimible en /facturacion/[id].
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FileText, TriangleAlert, X } from "lucide-react";
import { type Recibo } from "@/lib/db/queries";
import { eur } from "@/lib/utils";
import { emitirFactura } from "@/app/(app)/facturacion/actions";

export function FacturaBoton({ recibo }: { recibo: Recibo }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState(recibo.cliente?.nombre ?? "");
  const [cif, setCif] = useState(recibo.cliente?.cif ?? "");
  const [direccion, setDireccion] = useState(recibo.cliente?.direccion ?? "");
  const [guardar, setGuardar] = useState(!!recibo.cliente);

  function emitir() {
    setError(null);
    start(async () => {
      const res = await emitirFactura({
        ticketId: recibo.id,
        nombre,
        cif,
        direccion,
        guardarEnCliente: guardar && !!recibo.cliente,
      });
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo emitir la factura");
        return;
      }
      router.push(`/facturacion/${res.id}`);
    });
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[14px] font-bold text-ink transition-colors hover:border-brand hover:text-brand"
      >
        <FileText className="size-4.5" /> Generar factura
      </button>

      {abierto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-(--shadow-lift)">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight">
                  <FileText className="size-4.5 text-ink-soft" /> Hacer factura
                </h3>
                <button
                  onClick={() => setAbierto(false)}
                  className="cursor-pointer rounded-lg p-1 text-ink-soft hover:bg-chip hover:text-ink"
                  aria-label="Cerrar"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              <p className="mb-3.5 text-[12.5px] text-ink-soft">
                Ticket nº {recibo.numero ?? "—"} · {recibo.mesaNombre} · <b className="text-ink">{eur(recibo.total)}</b>.
                Completa los datos fiscales del cliente.
              </p>

              {error && (
                <div className="mb-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13px] font-semibold text-bad">{error}</div>
              )}

              {!recibo.local.cif && (
                <div className="mb-3 flex gap-2 rounded-[14px] bg-warn-soft px-4 py-3 text-[12.5px] font-semibold text-[#7A5106]">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                  Falta el CIF del local. Configúralo en Preferencias para que salga en la factura.
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Campo etiqueta="Nombre o razón social" valor={nombre} onCambio={setNombre} placeholder="Empresa SL / Nombre y apellidos" />
                <Campo etiqueta="NIF / CIF" valor={cif} onCambio={setCif} placeholder="B12345678" />
                <Campo etiqueta="Domicilio fiscal (opcional)" valor={direccion} onCambio={setDireccion} placeholder="Calle, nº, CP, población" />

                {recibo.cliente && (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={guardar}
                      onChange={(e) => setGuardar(e.target.checked)}
                      className="size-4 accent-brand"
                    />
                    Guardar estos datos en la ficha de {recibo.cliente.nombre}
                  </label>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setAbierto(false)}
                  className="flex-1 cursor-pointer rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold text-ink-soft transition-colors hover:border-[#CFC6B4] hover:text-ink"
                >
                  Cancelar
                </button>
                <button
                  onClick={emitir}
                  disabled={ocupado || !nombre.trim() || !cif.trim()}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                >
                  <FileText className="size-4" /> {ocupado ? "Emitiendo…" : "Emitir factura"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambio,
  placeholder,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
      {etiqueta}
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14px] font-normal tracking-normal outline-none focus:border-brand"
      />
    </label>
  );
}
