"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Merge, Plus, Star, Trash2, X } from "lucide-react";
import { Chip } from "@/components/ui";
import { type ClienteDetalle } from "@/lib/db/queries";
import { actualizarCliente, eliminarCliente, unificarClientes } from "../actions";

function eur(n: number): string {
  return `${n.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  })} €`;
}

const ESTADOS: Record<string, { tone: "good" | "warn" | "bad" | "gray"; texto: string }> = {
  sentada: { tone: "good", texto: "Vino" },
  confirmada: { tone: "warn", texto: "Confirmada" },
  no_show: { tone: "bad", texto: "No-show" },
  cancelada: { tone: "gray", texto: "Cancelada" },
};

export function FichaCliente({ detalle }: { detalle: ClienteDetalle }) {
  const router = useRouter();
  const [, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [etiquetas, setEtiquetas] = useState(detalle.cliente.etiquetas);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [unificarId, setUnificarId] = useState("");
  const [armado, setArmado] = useState<"unificar" | "eliminar" | null>(null);

  const c = detalle.cliente;
  const r = detalle.resumen;

  function guardar(datos: Parameters<typeof actualizarCliente>[1]) {
    setError(null);
    startAccion(async () => {
      const res = await actualizarCliente(c.id, datos);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  function guardarEtiquetas(nuevas: string[]) {
    setEtiquetas(nuevas);
    guardar({ etiquetas: nuevas });
  }

  function unificar() {
    if (armado !== "unificar") {
      setArmado("unificar");
      return;
    }
    setArmado(null);
    setError(null);
    startAccion(async () => {
      const res = await unificarClientes(c.id, unificarId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo unificar");
        return;
      }
      setUnificarId("");
      router.refresh();
    });
  }

  function eliminar() {
    if (armado !== "eliminar") {
      setArmado("eliminar");
      return;
    }
    setError(null);
    startAccion(async () => {
      const res = await eliminarCliente(c.id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar");
        return;
      }
      router.push("/clientes");
    });
  }

  return (
    <section className="anim-in">
      <Link
        href="/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[330px_1fr] gap-3.5 max-lg:grid-cols-1">
        {/* ---------- Columna izquierda: la ficha ---------- */}
        <div className="card flex flex-col gap-4 self-start p-5">
          <div>
            <span className="flex items-center gap-2">
              <input
                defaultValue={c.nombre}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.nombre && guardar({ nombre: e.target.value })}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 font-display text-[22px] font-bold tracking-tight outline-none hover:border-line focus:border-brand"
              />
              {r.numReservas >= 2 && <Star className="size-5 shrink-0 fill-warn text-warn" />}
            </span>
            <div className="px-1 text-[12.5px] text-ink-soft">cliente desde {c.desde}</div>
          </div>

          {/* Etiquetas */}
          <div>
            <Etiqueta>Etiquetas</Etiqueta>
            <div className="flex flex-wrap items-center gap-1.5">
              {etiquetas.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand"
                >
                  {e}
                  <button
                    onClick={() => guardarEtiquetas(etiquetas.filter((x) => x !== e))}
                    className="cursor-pointer rounded-full transition-colors hover:bg-brand/20"
                    title="Quitar"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = nuevaEtiqueta.trim();
                  if (v && !etiquetas.includes(v)) guardarEtiquetas([...etiquetas, v]);
                  setNuevaEtiqueta("");
                }}
                className="inline-flex items-center gap-1"
              >
                <Plus className="size-3.5 text-ink-soft" />
                <input
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                  placeholder="VIP, Familiar…"
                  className="w-24 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-ink-soft/50 hover:border-line focus:border-brand"
                />
              </form>
            </div>
          </div>

          <Campo etiqueta="Teléfono" valor={c.telefono} placeholder="teléfono" onGuardar={(v) => guardar({ telefono: v })} />
          <Campo etiqueta="Email" valor={c.email} placeholder="email" onGuardar={(v) => guardar({ email: v })} />
          <Campo
            etiqueta="Restricciones alimentarias"
            valor={c.restricciones}
            placeholder="alergias, intolerancias…"
            alerta
            onGuardar={(v) => guardar({ restricciones: v })}
          />
          <Campo
            etiqueta="Preferencias de comida y bebida"
            valor={c.preferencias}
            placeholder="vino blanco, sin picante…"
            onGuardar={(v) => guardar({ preferencias: v })}
          />
          <Campo
            etiqueta="Preferencia de mesa"
            valor={c.preferenciaMesa}
            placeholder="terraza, rincón tranquilo…"
            onGuardar={(v) => guardar({ preferenciaMesa: v })}
          />
          <Campo etiqueta="Idioma" valor={c.idioma} placeholder="catalán, inglés…" onGuardar={(v) => guardar({ idioma: v })} />
          <Campo etiqueta="Notas" valor={c.notas} placeholder="lo que haya que recordar…" onGuardar={(v) => guardar({ notas: v })} />

          {/* Unificar duplicados */}
          <div className="border-t border-line pt-4">
            <Etiqueta>Unificar duplicado</Etiqueta>
            <p className="mb-2 text-[12px] text-ink-soft">
              Trae aquí el historial de otra ficha que sea la misma persona; la otra se borra.
            </p>
            <div className="flex gap-2">
              <select
                value={unificarId}
                onChange={(e) => {
                  setUnificarId(e.target.value);
                  setArmado(null);
                }}
                className="min-w-0 flex-1 rounded-xl border border-line bg-card px-2.5 py-2 text-[13px] outline-none focus:border-brand"
              >
                <option value="">Elegir cliente…</option>
                {detalle.otrosClientes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                    {o.telefono ? ` · ${o.telefono}` : ""}
                  </option>
                ))}
              </select>
              {unificarId && (
                <button
                  onClick={unificar}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                    armado === "unificar" ? "bg-warn text-white" : "bg-chip text-ink hover:bg-hover"
                  }`}
                >
                  <Merge className="size-4" />
                  {armado === "unificar" ? "¿Seguro?" : "Unificar"}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={eliminar}
            className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
              armado === "eliminar" ? "bg-bad text-white" : "bg-bad-soft text-bad hover:bg-bad hover:text-white"
            }`}
          >
            <Trash2 className="size-4" />
            {armado === "eliminar" ? "Otra vez para borrar definitivamente" : "Eliminar cliente"}
          </button>
        </div>

        {/* ---------- Columna derecha: comportamiento ---------- */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="card p-5">
            <div className="mb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Resumen de comportamiento
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-5 max-md:grid-cols-2">
              <Dato etiqueta="Gasto total" valor={eur(r.gastoTotal)} />
              <Dato etiqueta="Ticket medio" valor={r.ticketMedio !== null ? eur(r.ticketMedio) : "—"} />
              <Dato etiqueta="Por persona" valor={r.gastoPorPersona !== null ? eur(r.gastoPorPersona) : "—"} />
              <Dato etiqueta="Última visita" valor={r.ultimaVisita} />
              <Dato etiqueta="Reservas" valor={String(r.numReservas)} />
              <Dato etiqueta="Visitas" valor={String(r.visitas)} bien={r.visitas > 0} />
              <Dato etiqueta="No-shows" valor={String(r.noShows)} mal={r.noShows > 0} />
              <Dato etiqueta="Canceladas" valor={String(r.canceladas)} />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 pt-5 pb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Historial de reservas
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Estado</Th>
                    <Th>Fecha</Th>
                    <Th>Hora</Th>
                    <Th>Pax</Th>
                    <Th>Mesa(s)</Th>
                    <Th>Gasto</Th>
                    <Th>Notas</Th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.historial.map((h) => (
                    <tr key={h.id} className="border-b border-line last:border-none hover:bg-hover">
                      <td className="px-3.5 py-2.5">
                        <Chip tone={ESTADOS[h.estado].tone}>{ESTADOS[h.estado].texto}</Chip>
                      </td>
                      <td className="px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap">{h.fecha}</td>
                      <td className="px-3.5 py-2.5 text-sm">{h.hora}</td>
                      <td className="px-3.5 py-2.5 font-display text-[15px] font-bold">{h.comensales}</td>
                      <td className="px-3.5 py-2.5 text-sm whitespace-nowrap">{h.mesa}</td>
                      <td className="px-3.5 py-2.5 font-display text-[15px] font-bold whitespace-nowrap">
                        {h.gasto !== null ? eur(h.gasto) : "—"}
                      </td>
                      <td className="max-w-56 truncate px-3.5 py-2.5 text-[13px] text-ink-soft" title={h.notas ?? ""}>
                        {h.notas ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {detalle.historial.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-soft">
                        Sin reservas todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">{children}</div>
  );
}

function Campo({
  etiqueta,
  valor,
  placeholder,
  alerta,
  onGuardar,
}: {
  etiqueta: string;
  valor: string | null;
  placeholder: string;
  alerta?: boolean;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  return (
    <div>
      <Etiqueta>{etiqueta}</Etiqueta>
      <input
        value={texto}
        placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto !== (valor ?? "") && onGuardar(texto)}
        className={`w-full rounded-lg border border-transparent px-2 py-1.5 text-[13.5px] outline-none placeholder:text-ink-soft/50 hover:border-line focus:border-brand ${
          alerta && texto ? "bg-bad-soft font-semibold text-bad" : "bg-transparent"
        }`}
      />
    </div>
  );
}

function Dato({ etiqueta, valor, bien, mal }: { etiqueta: string; valor: string; bien?: boolean; mal?: boolean }) {
  return (
    <div>
      <div
        className={`font-display text-[21px] font-bold tracking-tight ${mal ? "text-bad" : bien ? "text-good" : ""}`}
      >
        {valor}
      </div>
      <div className="text-[12px] text-ink-soft">{etiqueta}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
