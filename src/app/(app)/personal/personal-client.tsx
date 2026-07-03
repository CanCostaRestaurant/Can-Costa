"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, X } from "lucide-react";
import { PageHead } from "@/components/ui";
import { type PersonalMes } from "@/lib/db/queries";
import { eur } from "@/lib/utils";
import { agregarGastoPersonal, copiarMesAnterior, eliminarGastoPersonal } from "./actions";

export function PersonalClient({ datos }: { datos: PersonalMes }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Personal"
        subtitulo="Nóminas, seguridad social y demás gastos de equipo: suman al dashboard en su categoría"
        derecha={
          <input
            type="month"
            value={datos.mes}
            onChange={(e) => e.target.value && router.push(`/personal?mes=${e.target.value}`)}
            className="card rounded-full! px-4 py-2 text-[13.5px] font-semibold outline-none"
          />
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
                  Concepto
                </th>
                <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
                  Importe
                </th>
                <th className="border-b border-line px-3.5 py-2.5"> </th>
              </tr>
            </thead>
            <tbody>
              {datos.gastos.map((g) => (
                <tr key={g.id} className="border-b border-line last:border-none hover:bg-hover">
                  <td className="px-3.5 py-3 text-sm font-semibold">{g.concepto}</td>
                  <td className="px-3.5 py-3 font-display text-[14.5px] font-bold">{eur(g.importe)}</td>
                  <td className="px-2 py-3 text-right">
                    <button
                      onClick={() => ejecutar(() => eliminarGastoPersonal(g.id))}
                      disabled={ocupado}
                      title="Eliminar"
                      className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-line bg-hover/60">
                <td className="px-3.5 py-2.5">
                  <input
                    placeholder="+ Nómina Marc, Seguridad Social, gestoría laboral…"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                </td>
                <td className="px-3.5 py-2.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="importe €"
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                    className="w-28 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                </td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() =>
                      ejecutar(async () => {
                        const res = await agregarGastoPersonal({
                          mes: datos.mes,
                          concepto,
                          importe: parseFloat(importe.replace(",", ".")),
                        });
                        if (res.ok) {
                          setConcepto("");
                          setImporte("");
                        }
                        return res;
                      })
                    }
                    disabled={!concepto.trim() || !importe || ocupado}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
                  >
                    <Plus className="size-3.5" /> Añadir
                  </button>
                </td>
              </tr>
              <tr>
                <td className="px-3.5 py-3 font-display text-sm font-bold">Total del mes</td>
                <td colSpan={2} className="px-3.5 py-3 font-display text-[17px] font-bold">
                  {eur(datos.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="card p-5">
            <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Gasto de personal · {datos.mes}
            </div>
            <div className="mt-1.5 font-display text-[30px] font-bold tracking-tight">{eur(datos.total)}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Este importe entra en el dashboard dentro de la categoría <b className="text-ink">Personal</b> (en
              General y en A tiempo real, como haddock).
            </p>
          </div>
          <button
            onClick={() => ejecutar(() => copiarMesAnterior(datos.mes))}
            disabled={ocupado}
            className="card flex cursor-pointer items-center justify-center gap-2 px-4 py-3 text-[13.5px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
          >
            <Copy className="size-4 text-ink-soft" /> Copiar conceptos del mes anterior
          </button>
        </div>
      </div>
    </section>
  );
}
