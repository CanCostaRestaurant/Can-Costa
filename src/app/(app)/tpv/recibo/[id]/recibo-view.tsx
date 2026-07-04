"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Printer } from "lucide-react";
import { type Recibo } from "@/lib/db/queries";
import { eur } from "@/lib/utils";

const METODO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", mixto: "Varios" };

export function ReciboView({
  recibo,
  autoimprimir,
  reciénCobrado,
}: {
  recibo: Recibo;
  autoimprimir?: boolean;
  reciénCobrado?: boolean;
}) {
  const router = useRouter();

  // Al llegar recién cobrado (?print=1) se abre el diálogo de impresión solo.
  useEffect(() => {
    if (autoimprimir) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoimprimir]);

  return (
    <section className="anim-in mx-auto max-w-md">
      {/* Confirmación de cobro (no sale en la impresión) */}
      {reciénCobrado && (
        <div className="mb-4 rounded-2xl bg-good-soft px-5 py-4 text-center print:hidden">
          <div className="mx-auto mb-1.5 grid size-11 place-items-center rounded-full bg-good text-white">
            <Check className="size-6" />
          </div>
          <div className="font-display text-[19px] font-bold tracking-tight text-good">Cobrado</div>
          {recibo.cambio !== null && recibo.cambio > 0 && (
            <div className="mt-1.5">
              <span className="text-[13px] font-semibold text-ink-soft">Cambio a devolver </span>
              <b className="font-display text-[26px] font-bold text-ink">{eur(recibo.cambio)}</b>
            </div>
          )}
        </div>
      )}

      {/* Barra de acciones (no sale en la impresión) */}
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <button
          onClick={() => router.push("/tpv")}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
        >
          <ArrowLeft className="size-4" /> {reciénCobrado ? "Nueva mesa" : "Mesas"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-black"
        >
          <Printer className="size-4.5" /> Imprimir ticket
        </button>
      </div>

      {/* El ticket en sí — ancho de rollo térmico 80mm */}
      <div
        id="recibo"
        className="mx-auto w-[80mm] max-w-full rounded-xl border border-line bg-white px-5 py-6 font-mono text-[12.5px] leading-relaxed text-black shadow-sm print:rounded-none print:border-none print:shadow-none"
      >
        <div className="text-center">
          <div className="font-display text-[18px] font-bold tracking-tight">{recibo.local.nombre}</div>
          {recibo.local.direccion && <div className="text-[11px]">{recibo.local.direccion}</div>}
          <div className="text-[11px]">
            {recibo.local.cif ? `CIF ${recibo.local.cif}` : ""}
            {recibo.local.cif && recibo.local.telefono ? " · " : ""}
            {recibo.local.telefono ? `Tel ${recibo.local.telefono}` : ""}
          </div>
        </div>

        <Separador />

        <div className="flex justify-between">
          <span>Ticket nº {recibo.numero ?? "—"}</span>
          <span>{recibo.mesaNombre}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>{recibo.fechaHora}</span>
          {recibo.comensales ? <span>{recibo.comensales} pax</span> : <span />}
        </div>

        <Separador />

        {recibo.lineas.map((l, i) => (
          <div key={i} className="mb-1">
            <div>{l.descripcion}</div>
            <div className="flex justify-between">
              <span className="text-[11px]">
                {l.cantidad} × {eur(l.precioUnitario)}
              </span>
              <span className="font-semibold">{eur(l.total)}</span>
            </div>
          </div>
        ))}

        <Separador />

        <div className="flex justify-between text-[15px] font-bold">
          <span>TOTAL</span>
          <span>{eur(recibo.total)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[11px]">
          <span>Base imponible</span>
          <span>{eur(recibo.base)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>IVA {recibo.ivaPct}%</span>
          <span>{eur(recibo.iva)}</span>
        </div>

        <Separador />

        <div className="flex justify-between">
          <span>Pago</span>
          <span className="font-semibold">{recibo.metodo ? METODO[recibo.metodo] : "—"}</span>
        </div>
        {recibo.pagos.length > 1 &&
          recibo.pagos.map((p, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span>· {METODO[p.metodo] ?? p.metodo}</span>
              <span>{eur(p.importe)}</span>
            </div>
          ))}
        {recibo.entregado !== null && (
          <>
            <div className="flex justify-between text-[11px]">
              <span>Entregado</span>
              <span>{eur(recibo.entregado)}</span>
            </div>
            <div className="flex justify-between text-[13px] font-bold">
              <span>Cambio</span>
              <span>{eur(recibo.cambio ?? 0)}</span>
            </div>
          </>
        )}

        <Separador />

        <div className="text-center text-[11.5px]">{recibo.local.pie}</div>
      </div>
    </section>
  );
}

function Separador() {
  return <div className="my-2.5 border-t border-dashed border-black/40" />;
}
