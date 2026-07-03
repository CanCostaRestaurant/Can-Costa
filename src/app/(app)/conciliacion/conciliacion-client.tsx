"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, Sparkles } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { type Conciliacion } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { conciliar, desconciliarFactura } from "./actions";

export function ConciliacionClient({ datos }: { datos: Conciliacion }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const sugerencias = datos.facturas.filter((f) => f.sugerencia);
  const conciliadas = datos.facturas.filter((f) => f.albaranes.length > 0);
  const sinConciliar = datos.facturas.filter((f) => f.albaranes.length === 0);

  const abierta = sinConciliar.find((f) => f.id === abiertaId) ?? null;
  const candidatos = useMemo(
    () => (abierta ? datos.albaranesSueltos.filter((a) => a.proveedorId === abierta.proveedorId) : []),
    [abierta, datos.albaranesSueltos],
  );
  const sumaMarcados = candidatos.filter((a) => marcados.has(a.id)).reduce((s, a) => s + a.total, 0);

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) {
    setError(null);
    setAviso(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      if (res.aviso) setAviso(res.aviso);
      setAbiertaId(null);
      setMarcados(new Set());
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Conciliación"
        subtitulo={`Cruza cada factura con sus albaranes · diferencia aceptable: ${eur(datos.tolerancia)} (se cambia en Preferencias)`}
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}
      {aviso && (
        <div className="mb-3.5 rounded-[14px] bg-warn-soft px-4 py-3 text-[13.5px] font-semibold text-[#7A5106]">
          {aviso}
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        <Kpi etiqueta="Albaranes sin conciliar" valor={String(datos.albaranesSueltos.length)} mal={datos.albaranesSueltos.length > 0} />
        <Kpi etiqueta="Recomendadas" valor={String(sugerencias.length)} />
        <Kpi etiqueta="Facturas conciliadas" valor={String(conciliadas.length)} bien={conciliadas.length > 0} />
      </div>

      {/* Conciliaciones recomendadas */}
      {sugerencias.length > 0 && (
        <div className="card mb-3.5 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold tracking-tight">
            <Sparkles className="size-[18px] text-brand" /> Conciliaciones recomendadas
          </h3>
          <div className="flex flex-col gap-2">
            {sugerencias.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-semibold">
                    {f.proveedor} · factura {f.numero ?? "s/n"} — {eur(f.total)}
                  </b>
                  <small className="text-[12.5px] text-ink-soft">
                    {f.sugerencia!.albaranIds.length}{" "}
                    {f.sugerencia!.albaranIds.length === 1 ? "albarán suma" : "albaranes suman"}{" "}
                    {eur(f.sugerencia!.suma)}
                    {Math.abs(f.sugerencia!.diferencia) > 0.005
                      ? ` · diferencia ${eur(Math.abs(f.sugerencia!.diferencia))}`
                      : " · cuadre exacto"}
                  </small>
                </div>
                <button
                  onClick={() => ejecutar(() => conciliar(f.id, f.sugerencia!.albaranIds))}
                  disabled={ocupado}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
                >
                  <Link2 className="size-4" /> Conciliar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-3.5 max-lg:grid-cols-1">
        {/* Facturas sin conciliar → manual */}
        <div className="card p-5">
          <h3 className="mb-1 font-display text-base font-bold tracking-tight">Por conciliar</h3>
          <p className="mb-3 text-[12.5px] text-ink-soft">
            Elige una factura y marca los albaranes que la componen.
          </p>
          <div className="flex flex-col gap-2">
            {sinConciliar.map((f) => (
              <div key={f.id} className="rounded-xl border border-line">
                <button
                  onClick={() => {
                    setAbiertaId(abiertaId === f.id ? null : f.id);
                    setMarcados(new Set());
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">{f.proveedor}</b>
                    <small className="text-[12px] text-ink-soft">
                      factura {f.numero ?? "s/n"} · {f.fecha}
                    </small>
                  </div>
                  <b className="font-display text-[15px] font-bold whitespace-nowrap">{eur(f.total)}</b>
                </button>

                {abiertaId === f.id && (
                  <div className="anim-in border-t border-line px-3.5 py-3">
                    {candidatos.length === 0 ? (
                      <p className="text-[13px] text-ink-soft">
                        No hay albaranes sueltos de este proveedor.
                      </p>
                    ) : (
                      <>
                        {candidatos.map((a) => (
                          <label
                            key={a.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-hover"
                          >
                            <input
                              type="checkbox"
                              checked={marcados.has(a.id)}
                              onChange={(e) => {
                                const s = new Set(marcados);
                                if (e.target.checked) s.add(a.id);
                                else s.delete(a.id);
                                setMarcados(s);
                              }}
                              className="size-4 accent-[#E8532F]"
                            />
                            <span className="flex-1">
                              albarán {a.numero ?? "s/n"} · {a.fecha}
                            </span>
                            <b className="font-display font-bold">{eur(a.total)}</b>
                          </label>
                        ))}
                        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                          <span
                            className={cn(
                              "text-[12.5px] font-semibold",
                              marcados.size > 0 &&
                                (Math.abs(sumaMarcados - f.total) <= datos.tolerancia
                                  ? "text-good"
                                  : "text-bad"),
                            )}
                          >
                            {marcados.size > 0
                              ? `suman ${eur(sumaMarcados)} · dif ${eur(Math.abs(sumaMarcados - f.total))}`
                              : "marca los albaranes de esta factura"}
                          </span>
                          <button
                            onClick={() => ejecutar(() => conciliar(f.id, [...marcados]))}
                            disabled={marcados.size === 0 || ocupado}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-40"
                          >
                            <Link2 className="size-3.5" /> Conciliar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sinConciliar.length === 0 && (
              <p className="rounded-xl bg-chip px-3.5 py-3 text-[13px] text-ink-soft">
                No hay facturas pendientes de conciliar.
              </p>
            )}
          </div>
        </div>

        {/* Conciliadas */}
        <div className="card p-5">
          <h3 className="mb-3 font-display text-base font-bold tracking-tight">Conciliadas</h3>
          <div className="flex flex-col gap-2">
            {conciliadas.map((f) => {
              const suma = f.albaranes.reduce((s, a) => s + a.total, 0);
              const cuadra = Math.abs(suma - f.total) <= datos.tolerancia;
              return (
                <div key={f.id} className="rounded-xl border border-line px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-semibold">
                        {f.proveedor} · factura {f.numero ?? "s/n"}
                      </b>
                      <small className="text-[12px] text-ink-soft">
                        {f.albaranes.length} albaranes · {eur(suma)} de {eur(f.total)}
                      </small>
                    </div>
                    {cuadra ? <Chip tone="good">cuadra</Chip> : <Chip tone="bad">descuadre</Chip>}
                    <button
                      onClick={() => ejecutar(() => desconciliarFactura(f.id))}
                      disabled={ocupado}
                      title="Deshacer conciliación"
                      className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
                    >
                      <Link2Off className="size-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.albaranes.map((a) => (
                      <span key={a.id} className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        {a.numero ?? "albarán"} · {eur(a.total, false)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {conciliadas.length === 0 && (
              <p className="rounded-xl bg-chip px-3.5 py-3 text-[13px] text-ink-soft">
                Todavía no hay facturas conciliadas. Cuando el proveedor te mande la factura del mes, crúzala
                aquí con sus albaranes.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ etiqueta, valor, bien, mal }: { etiqueta: string; valor: string; bien?: boolean; mal?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-1.5 font-display text-[28px] font-bold", mal && "text-warn", bien && "text-good")}>
        {valor}
      </div>
    </div>
  );
}
