"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Chip } from "@/components/ui";
import { type VentaDia } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { guardarVentaDia } from "./actions";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VentasClient({ ventas }: { ventas: VentaDia[] }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoyISO());
  const [importe, setImporte] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ultimos7 = ventas.slice(0, 7).reduce((acc, v) => acc + v.total, 0);
  const media = ventas.length ? ventas.reduce((acc, v) => acc + v.total, 0) / ventas.length : 0;
  const existente = ventas.find((v) => v.fecha === fecha);

  function onGuardar() {
    setError(null);
    const total = parseFloat(importe.replace(",", "."));
    startGuardar(async () => {
      const res = await guardarVentaDia(fecha, total);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      setImporte("");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[1.7fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Día</Th>
              <Th>Fecha</Th>
              <Th>Ventas</Th>
              <Th>Origen</Th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id} className="border-b border-line last:border-none">
                <td className="px-3.5 py-3 text-sm font-semibold capitalize">{v.diaSemana}</td>
                <td className="px-3.5 py-3 text-sm text-ink-soft">{v.fechaLegible}</td>
                <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold">{eur(v.total)}</td>
                <td className="px-3.5 py-3">
                  <Chip tone={v.origen === "manual" ? "gray" : "good"}>
                    {v.origen === "manual" ? "manual" : v.origen === "seed" ? "demo" : v.origen}
                  </Chip>
                </td>
              </tr>
            ))}
            {ventas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-8 text-center text-sm text-ink-soft">
                  Aún no hay ventas apuntadas. Empieza con el formulario de la derecha.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="card p-5.5">
          <h3 className="mb-3 font-display text-base font-bold tracking-tight">Apuntar ventas del día</h3>
          <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Día</label>
          <input
            type="date"
            value={fecha}
            max={hoyISO()}
            onChange={(e) => setFecha(e.target.value)}
            className="card mt-1.5 mb-3.5 w-full rounded-xl! px-3.5 py-2.5 text-[14.5px] outline-none focus:border-brand"
          />
          <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Total del día
          </label>
          <div className="mt-1.5 mb-4 flex items-baseline gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder={existente ? String(existente.total) : "1.250"}
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              className="w-full border-b-2 border-line bg-transparent font-display text-3xl font-bold tracking-tight outline-none transition-colors focus:border-brand"
            />
            <span className="font-display text-xl font-semibold text-ink-soft">€</span>
          </div>
          {existente && (
            <p className="mb-3 text-[12.5px] text-ink-soft">
              Ese día ya tiene <b>{eur(existente.total)}</b> — al guardar se sustituye.
            </p>
          )}
          {error && <p className="mb-3 text-[13px] font-semibold text-bad">{error}</p>}
          <button
            onClick={onGuardar}
            disabled={guardando || !importe.trim()}
            className="w-full cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar ventas"}
          </button>
        </div>

        <div className="card p-5.5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold tracking-tight">
            <CalendarDays className="size-[18px] text-ink-soft" />
            Resumen
          </h3>
          <Dato etiqueta="Últimos 7 días apuntados" valor={eur(ultimos7, false)} />
          <Dato etiqueta="Media diaria" valor={eur(media, false)} />
          <Dato etiqueta="Días con registro" valor={String(ventas.length)} />
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-2 text-[13.5px] last:border-none">
      <span className="text-ink-soft">{etiqueta}</span>
      <b className={cn("font-display text-[15px] font-bold")}>{valor}</b>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
